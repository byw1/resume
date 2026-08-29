import { db } from "@/lib/db";

/**
 * Rate limiting for the sign-in form.
 *
 * The login page is public, the source is public, and without this someone can
 * guess passwords as fast as their connection allows — which is the one thing
 * that actually gets an instance taken over. Being open source does not cause
 * that; not counting failed attempts does.
 *
 * Counters live in the database rather than in a process, for the same reason
 * the MCP transport is stateless: the app restarts and may run as more than one
 * replica, and a counter held in memory is a counter an attacker clears by
 * waiting for a deploy.
 *
 * Two keys are counted for every attempt. The email key is the real protection:
 * it defends one account no matter where the traffic comes from. The IP key is
 * defence in depth against someone spraying one password across many accounts,
 * and it is deliberately loose — an office, a school and a mobile network all
 * share addresses, and locking those out would be a denial of service on real
 * people. `x-forwarded-for` can also be forged by whoever speaks to the proxy,
 * so the IP key is a speed bump rather than a wall; the email key is not.
 */

const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
/** Failures against one email address before that account stops answering. */
const EMAIL_LIMIT = 8;
/** Failures from one address before it stops answering. Loose: addresses are shared. */
const IP_LIMIT = 30;

export type ThrottleVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function emailKey(email: string) {
  return `email:${email.trim().toLowerCase()}`;
}

function ipKey(ip: string) {
  return `ip:${ip}`;
}

/**
 * The client address, as far as we can tell.
 *
 * Behind Railway's proxy the left-most entry of `x-forwarded-for` is the
 * client. Anyone talking to the proxy directly can put whatever they like
 * there, which is why this only ever feeds the loose IP counter.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Whether this email and address may attempt a sign-in right now. */
export async function checkLoginAllowed(email: string, ip: string): Promise<ThrottleVerdict> {
  const now = new Date();
  const rows = await db.loginThrottle.findMany({
    where: { key: { in: [emailKey(email), ipKey(ip)] }, lockedUntil: { gt: now } },
    orderBy: { lockedUntil: "desc" },
    take: 1,
  });
  const locked = rows[0];
  if (!locked?.lockedUntil) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((locked.lockedUntil.getTime() - now.getTime()) / 1000)),
  };
}

async function bump(key: string, limit: number) {
  const now = new Date();
  const existing = await db.loginThrottle.findUnique({ where: { key } });

  // A window that has expired starts again rather than accumulating forever —
  // eight wrong guesses spread over a year is a person, not an attack.
  const stale = !existing || now.getTime() - existing.windowStartedAt.getTime() > WINDOW_MS;
  const failures = stale ? 1 : existing.failures + 1;
  const lockedUntil = failures >= limit ? new Date(now.getTime() + LOCK_MS) : null;

  await db.loginThrottle.upsert({
    where: { key },
    create: { key, failures, windowStartedAt: now, lockedUntil },
    update: {
      failures,
      ...(stale ? { windowStartedAt: now } : {}),
      lockedUntil,
    },
  });
}

/** Count a failed attempt against both the account and the address. */
export async function recordLoginFailure(email: string, ip: string) {
  await Promise.all([bump(emailKey(email), EMAIL_LIMIT), bump(ipKey(ip), IP_LIMIT)]);
}

/** A correct password clears the slate for that account and address. */
export async function clearLoginFailures(email: string, ip: string) {
  await db.loginThrottle.deleteMany({ where: { key: { in: [emailKey(email), ipKey(ip)] } } });
}

/**
 * Drop counters nothing has touched in a day. Called opportunistically from a
 * successful sign-in rather than on a schedule: this table is small, the app
 * has no cron, and a sweep that only runs when someone logs in is a sweep that
 * runs often enough on any instance that has users and never on one that
 * doesn't.
 */
export async function sweepThrottles() {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  await db.loginThrottle.deleteMany({ where: { updatedAt: { lt: cutoff } } });
}
