import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE = "resume_os_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Zero-config auth. The only secret you have to set is APP_PASSWORD.
 * The signing key is derived from it, so there is no second env var to manage.
 */
function signingKey() {
  const pw = process.env.APP_PASSWORD ?? "";
  return createHmac("sha256", "resume-os/v1").update(pw).digest();
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function passwordIsConfigured() {
  return Boolean(process.env.APP_PASSWORD && process.env.APP_PASSWORD.length > 0);
}

export function checkPassword(candidate: string) {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export function makeSessionValue() {
  const issued = Date.now().toString();
  return `${issued}.${sign(issued)}`;
}

export function sessionValueIsValid(value: string | undefined) {
  if (!value) return false;
  const [issued, mac] = value.split(".");
  if (!issued || !mac) return false;
  if (!safeEqual(mac, sign(issued))) return false;
  const age = Date.now() - Number(issued);
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE * 1000;
}

export async function isAuthenticated() {
  // If no password is set the app is open — useful for a first local run.
  if (!passwordIsConfigured()) return true;
  const jar = await cookies();
  return sessionValueIsValid(jar.get(COOKIE)?.value);
}

export async function createSession() {
  const jar = await cookies();
  jar.set(COOKIE, makeSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

// ---------------------------------------------------------------------------
// MCP token — auto-generated on first read and stored in the database so the
// user never has to invent or paste a secret into Railway.
// ---------------------------------------------------------------------------

const MCP_TOKEN_KEY = "mcp_token";

export async function getOrCreateMcpToken(): Promise<string> {
  const existing = await db.setting.findUnique({ where: { key: MCP_TOKEN_KEY } });
  if (existing?.value) return existing.value;
  const token = `rsm_${randomBytes(24).toString("hex")}`;
  await db.setting.upsert({
    where: { key: MCP_TOKEN_KEY },
    create: { key: MCP_TOKEN_KEY, value: token },
    update: { value: token },
  });
  return token;
}

export async function rotateMcpToken(): Promise<string> {
  const token = `rsm_${randomBytes(24).toString("hex")}`;
  await db.setting.upsert({
    where: { key: MCP_TOKEN_KEY },
    create: { key: MCP_TOKEN_KEY, value: token },
    update: { value: token },
  });
  return token;
}

export async function mcpTokenIsValid(candidate: string | null | undefined) {
  if (!candidate) return false;
  const token = await getOrCreateMcpToken();
  return safeEqual(candidate, token);
}
