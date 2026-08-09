import type { User, UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureDefaultConnection, generateInviteToken, hashPassword } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { inviteEmail, sendEmail } from "@/lib/email";

const INVITE_DAYS = 14;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers() {
  const users = await db.user.findMany({
    where: { passwordHash: { not: "" } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      invitedBy: { select: { name: true, email: true } },
      _count: { select: { roles: true, resumes: true, applications: true } },
    },
  });
  return users;
}

export async function countUsers() {
  return db.user.count({ where: { passwordHash: { not: "" } } });
}

/**
 * Rules that keep an instance from locking itself out:
 * - the super admin can never be deactivated, demoted or deleted
 * - an admin cannot act on another admin, only on members
 */
export function canManage(actor: User, target: { id: string; role: UserRole }) {
  if (actor.id === target.id) return false;
  if (target.role === "SUPER_ADMIN") return false;
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "ADMIN") return target.role === "MEMBER";
  return false;
}

export async function setUserRole(actor: User, userId: string, role: UserRole) {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("No such user.");
  if (!canManage(actor, target)) throw new Error("You can't change that user's role.");
  if (role === "SUPER_ADMIN") throw new Error("There can only be one super admin.");
  return db.user.update({ where: { id: userId }, data: { role } });
}

export async function setUserActive(actor: User, userId: string, isActive: boolean) {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("No such user.");
  if (!canManage(actor, target)) throw new Error("You can't change that user.");
  if (!isActive) await db.session.deleteMany({ where: { userId } });
  return db.user.update({ where: { id: userId }, data: { isActive } });
}

/** Deletes the user and, by cascade, everything they owned. */
export async function deleteUser(actor: User, userId: string) {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("No such user.");
  if (!canManage(actor, target)) throw new Error("You can't delete that user.");
  return db.user.delete({ where: { id: userId } });
}

export async function changePassword(userId: string, password: string) {
  await db.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password) } });
  // Every other device gets signed out; the caller re-establishes its own session.
  await db.session.deleteMany({ where: { userId } });
}

export async function updateOwnAccount(userId: string, patch: { name?: string; email?: string }) {
  const data: { name?: string; email?: string } = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    const clash = await db.user.findFirst({ where: { email, id: { not: userId } } });
    if (clash) throw new Error("That email is already in use.");
    data.email = email;
  }
  return db.user.update({ where: { id: userId }, data });
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export async function listInvites() {
  return db.invite.findMany({
    where: { acceptedAt: null },
    orderBy: { createdAt: "desc" },
    include: { invitedBy: { select: { name: true, email: true } } },
  });
}

export type InviteResult = {
  invite: { id: string; email: string; token: string; expiresAt: Date };
  acceptUrl: string;
  emailSent: boolean;
  emailError: string;
};

/**
 * Create an invite and try to email it. If email isn't configured or Resend
 * rejects it, the invite is still valid — the caller shows the link to copy by
 * hand, so the platform is usable before Resend is set up.
 */
export async function createInvite(input: {
  actor: User;
  email: string;
  role: UserRole;
  baseUrl: string;
}): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address.");
  if (input.role === "SUPER_ADMIN") throw new Error("There can only be one super admin.");
  if (input.role === "ADMIN" && input.actor.role !== "SUPER_ADMIN") {
    throw new Error("Only the super admin can invite other admins.");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.passwordHash) throw new Error("Someone with that email is already a member.");

  // Re-inviting the same address replaces the outstanding invite.
  await db.invite.deleteMany({ where: { email, acceptedAt: null } });

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400_000);
  const invite = await db.invite.create({
    data: { email, token, role: input.role, invitedById: input.actor.id, expiresAt },
  });

  const settings = await getSettings();
  const base = (settings.publicUrl || input.baseUrl).replace(/\/$/, "");
  const acceptUrl = `${base}/invite/${token}`;

  const message = inviteEmail({
    instanceName: settings.instanceName,
    inviterName: input.actor.name || input.actor.email,
    acceptUrl,
    expiresInDays: INVITE_DAYS,
  });
  const sent = await sendEmail({ to: email, ...message, settings });

  await db.invite.update({
    where: { id: invite.id },
    data: { emailSent: sent.ok, emailError: sent.ok ? "" : sent.error },
  });

  return {
    invite: { id: invite.id, email, token, expiresAt },
    acceptUrl,
    emailSent: sent.ok,
    emailError: sent.ok ? "" : sent.error,
  };
}

export async function revokeInvite(id: string) {
  return db.invite.deleteMany({ where: { id, acceptedAt: null } });
}

export async function getInviteByToken(token: string) {
  const invite = await db.invite.findUnique({
    where: { token },
    include: { invitedBy: { select: { name: true, email: true } } },
  });
  if (!invite) return { status: "missing" as const, invite: null };
  if (invite.acceptedAt) return { status: "used" as const, invite };
  if (invite.expiresAt < new Date()) return { status: "expired" as const, invite };
  return { status: "valid" as const, invite };
}

export async function acceptInvite(input: { token: string; name: string; password: string }) {
  const result = await getInviteByToken(input.token);
  if (result.status !== "valid" || !result.invite) {
    throw new Error(
      result.status === "expired"
        ? "That invitation has expired. Ask for a new one."
        : result.status === "used"
          ? "That invitation has already been used."
          : "That invitation link isn't valid.",
    );
  }
  const invite = result.invite;

  const clash = await db.user.findUnique({ where: { email: invite.email } });
  if (clash && clash.passwordHash) throw new Error("An account with that email already exists.");

  const user = await db.$transaction(async (tx) => {
    const created = clash
      ? await tx.user.update({
          where: { id: clash.id },
          data: {
            name: input.name.trim(),
            passwordHash: hashPassword(input.password),
            role: invite.role,
            isActive: true,
            invitedById: invite.invitedById,
          },
        })
      : await tx.user.create({
          data: {
            email: invite.email,
            name: input.name.trim(),
            passwordHash: hashPassword(input.password),
            role: invite.role,
            invitedById: invite.invitedById,
          },
        });
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return created;
  });

  await ensureDefaultConnection(user.id);
  return user;
}

// ---------------------------------------------------------------------------
// Instance overview, for the admin dashboard and the MCP admin tools
// ---------------------------------------------------------------------------

export async function instanceStats() {
  const [users, active, admins, pendingInvites, roles, resumes, applications] = await Promise.all([
    db.user.count({ where: { passwordHash: { not: "" } } }),
    db.user.count({ where: { passwordHash: { not: "" }, isActive: true } }),
    db.user.count({ where: { passwordHash: { not: "" }, role: { in: ["ADMIN", "SUPER_ADMIN"] } } }),
    db.invite.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } }),
    db.role.count(),
    db.resume.count(),
    db.application.count(),
  ]);
  return { users, active, admins, pendingInvites, roles, resumes, applications };
}
