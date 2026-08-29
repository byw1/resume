import type { User } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * A record of what an admin did to whose account.
 *
 * This is the one table in the app that is deliberately not scoped to a user —
 * it is instance-level, and only admins can read it. It exists because a
 * service holding other people's career data should be able to answer "who
 * suspended this account, and when", and because an admin who can reset
 * passwords without leaving a trace is an admin nobody can audit.
 *
 * Emails are copied in as text rather than joined, so a row still makes sense
 * after the account it describes is deleted. Deleting a user is exactly the
 * moment you most want the log to remember.
 */

export type AuditAction =
  | "user.invite"
  | "user.invite_revoke"
  | "user.role"
  | "user.suspend"
  | "user.reactivate"
  | "user.delete"
  | "user.password_reset"
  | "billing.link"
  | "billing.unlink";

export async function recordAudit(input: {
  actor: Pick<User, "id" | "email">;
  action: AuditAction;
  target?: { id?: string | null; email?: string | null };
  detail?: string;
}) {
  return db.adminAudit.create({
    data: {
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      action: input.action,
      targetId: input.target?.id ?? null,
      targetEmail: input.target?.email ?? "",
      // Never a password, a token or any other secret — this is read by every
      // admin and kept after the account is gone.
      detail: input.detail ?? "",
    },
  });
}

export async function listAudit(options?: { limit?: number; targetId?: string }) {
  return db.adminAudit.findMany({
    where: options?.targetId ? { targetId: options.targetId } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(options?.limit ?? 100, 500),
  });
}
