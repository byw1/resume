import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User, UserRole } from "@prisma/client";
import { db } from "@/lib/db";

const SESSION_COOKIE = "resume_os_session";
const SESSION_DAYS = 30;

// ---------------------------------------------------------------------------
// Passwords — scrypt from the standard library, no native dependency.
// ---------------------------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt:${SCRYPT_N}:${SCRYPT_r}:${SCRYPT_p}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  // An empty hash is the unclaimed-placeholder marker; nothing may match it.
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, keyHex] = parts;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    const actual = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateMcpToken() {
  return `rsm_${randomBytes(24).toString("hex")}`;
}

function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

export function generateInviteToken() {
  return randomBytes(24).toString("hex");
}

// ---------------------------------------------------------------------------
// Instance setup
// ---------------------------------------------------------------------------

/**
 * The instance is unclaimed until somebody with a real password exists. The
 * migration leaves behind a placeholder row owning any pre-multi-user data;
 * it has an empty passwordHash and cannot be logged into.
 */
export async function instanceNeedsSetup() {
  const claimed = await db.user.count({ where: { passwordHash: { not: "" } } });
  return claimed === 0;
}

export function setupKeyIsRequired() {
  return Boolean(process.env.APP_PASSWORD);
}

export function setupKeyMatches(candidate: string) {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return true; // nothing configured — nothing to check
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Claim the instance as super admin. Adopts the placeholder owner when one
 * exists so data from the single-user era keeps its ids and simply changes
 * hands, rather than being orphaned or deleted.
 */
export async function claimInstance(input: {
  email: string;
  name: string;
  password: string;
}) {
  if (!(await instanceNeedsSetup())) {
    throw new Error("This instance has already been set up.");
  }

  const email = input.email.trim().toLowerCase();
  const placeholder = await db.user.findFirst({ where: { passwordHash: "" } });

  const data = {
    email,
    name: input.name.trim(),
    passwordHash: hashPassword(input.password),
    role: "SUPER_ADMIN" as const,
    isActive: true,
  };

  const user = placeholder
    ? await db.user.update({ where: { id: placeholder.id }, data })
    : await db.user.create({ data });

  await ensureDefaultConnection(user.id);
  return user;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function startSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const headerList = await headers();

  await db.session.create({
    data: {
      token,
      userId,
      expiresAt,
      userAgent: (headerList.get("user-agent") ?? "").slice(0, 200),
    },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  jar.delete(SESSION_COOKIE);
}

/** Sign every device out — used when a password changes. */
export async function endAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.isActive || !session.user.passwordHash) return null;
  return session.user;
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Spend the same work whether or not the account exists.
  const hash = user?.passwordHash || "scrypt:16384:8:1:00:00";
  const ok = verifyPassword(password, hash);
  if (!user || !ok || !user.isActive || !user.passwordHash) return null;
  return user;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function isAdmin(user: { role: UserRole }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/");
  return user;
}

export async function requireSuperAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/");
  return user;
}

// ---------------------------------------------------------------------------
// MCP tokens — each connection belongs to exactly one user, so a connection URL
// only ever reaches that person's data.
// ---------------------------------------------------------------------------

/** Don't write a timestamp on every single tool call. */
const LAST_USED_RESOLUTION_MS = 60_000;

export async function userByMcpToken(
  token: string | null | undefined,
  userAgent = "",
): Promise<User | null> {
  if (!token || !token.startsWith("rsm_")) return null;

  const connection = await db.mcpConnection.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!connection) return null;

  const { user } = connection;
  if (!user.isActive || !user.passwordHash) return null;

  const now = Date.now();
  const stale =
    !connection.lastUsedAt || now - connection.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS;
  if (stale) {
    // Never let bookkeeping fail a real request.
    void db.mcpConnection
      .update({
        where: { id: connection.id },
        data: {
          lastUsedAt: new Date(now),
          lastUsedFrom: userAgent.slice(0, 200),
        },
      })
      .catch(() => {});
  }

  return user;
}

/** Every user starts with one connection so Settings is never an empty page. */
export async function ensureDefaultConnection(userId: string) {
  const existing = await db.mcpConnection.count({ where: { userId } });
  if (existing > 0) return;
  await db.mcpConnection.create({
    data: { userId, name: "Claude", client: "claude", token: generateMcpToken() },
  });
}

export { SESSION_COOKIE };
