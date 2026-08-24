import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { billingIsConfigured, getSettings, type InstanceSettings } from "@/lib/settings";
import { createInvite } from "@/lib/data/users";

/**
 * Paid hosting, kept as small as it can honestly be.
 *
 * The instance owner creates a Product and a Payment Link in the Stripe
 * Dashboard — no provisioning code, no price in this repo. Someone pays, the
 * webhook fires, and this module does the only two jobs that need code:
 *
 *   1. Turn a paid checkout into an invite, if the payer isn't a user yet.
 *   2. Keep one fact in sync: does this customer's subscription entitle them
 *      to be active on this instance?
 *
 * Sync is convergent rather than event-driven: whatever the webhook says
 * happened, we ask Stripe for the customer's current subscriptions and act on
 * that answer. Events can arrive late, twice, or out of order, and this stays
 * correct — the same property the stateless MCP transport has, for the same
 * reason. A subscription in `past_due` still counts as entitled: Stripe's own
 * retries are the grace period, and `customer.subscription.deleted` is the
 * definitive end.
 *
 * Like the Resend client in email.ts, this speaks to Stripe's REST API with
 * plain fetch. It is three GETs; an SDK would be the largest dependency in the
 * app.
 *
 * Billing only ever touches users whose stripeCustomerId matches the event.
 * The owner has no customer id, free invitees have no customer id — a Stripe
 * outage or a bad webhook cannot lock the owner out of their own instance.
 */

const STRIPE_API = "https://api.stripe.com";

/** Stripe's definition of "still paying", including their retry window. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/** The events the webhook acts on. Anything else is acknowledged and ignored. */
export const BILLING_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

/**
 * Verify a Stripe-Signature header: v1 = HMAC-SHA256(`${t}.${payload}`) with
 * the webhook signing secret. Several v1 entries can appear during a secret
 * rotation; any one matching passes. The timestamp check bounds replays.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;
  const parts = new Map<string, string[]>();
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=", 2);
    if (!key || value === undefined) continue;
    const list = parts.get(key.trim()) ?? [];
    list.push(value.trim());
    parts.set(key.trim(), list);
  }
  const timestamp = Number(parts.get("t")?.[0]);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (parts.get("v1") ?? []).some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    return (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });
}

async function stripeGet(path: string, secretKey: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(15000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined;
    throw new Error(error?.message || `Stripe returned ${response.status} for ${path}`);
  }
  return body;
}

/** Does this customer currently hold a live subscription? */
async function customerIsEntitled(customerId: string, secretKey: string): Promise<boolean> {
  const body = await stripeGet(
    `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`,
    secretKey,
  );
  const subscriptions = (body.data ?? []) as { status?: string }[];
  return subscriptions.some((sub) => sub.status && LIVE_STATUSES.has(sub.status));
}

async function customerEmail(customerId: string, secretKey: string): Promise<string> {
  const body = await stripeGet(`/v1/customers/${encodeURIComponent(customerId)}`, secretKey);
  return typeof body.email === "string" ? body.email.toLowerCase() : "";
}

export type BillingSyncResult = {
  customerId: string;
  email: string;
  entitled: boolean;
  action:
    | "activated"
    | "suspended"
    | "invited"
    | "linked"
    | "unlinked"
    | "member-unlinked"
    | "unchanged"
    | "no-user";
};

/**
 * The unattended state-changing operation: converge a Stripe customer with
 * this instance. Finds the user by customer id only, invites the payer if no
 * account holds that email yet, and drives isActive from entitlement — with
 * the same semantics as an admin suspension, so a lapsed customer's sessions
 * and MCP calls stop working immediately. It never attaches a customer to an
 * existing member; that is linkBillingCustomer's job, on an admin's say-so.
 */
export async function syncStripeCustomer(input: {
  customerId: string;
  /** Email from the event when it carries one; looked up from Stripe otherwise. */
  email?: string | null;
  /** For invite links when settings.publicUrl is not set. */
  baseUrl: string;
  settings?: InstanceSettings;
}): Promise<BillingSyncResult> {
  const settings = input.settings ?? (await getSettings());
  if (!billingIsConfigured(settings)) {
    throw new Error("Billing is not configured. Add the Stripe keys in Admin → Billing.");
  }

  const entitled = await customerIsEntitled(input.customerId, settings.stripeSecretKey);
  const email =
    input.email?.toLowerCase() || (await customerEmail(input.customerId, settings.stripeSecretKey));

  const user = await db.user.findFirst({ where: { stripeCustomerId: input.customerId } });

  if (!user) {
    // Billing may CREATE accounts, never claim them. The email on a checkout
    // is whatever the payer typed, so matching an existing member by it would
    // let anyone with the public payment link bind a member's account to a
    // foreign subscription and then suspend them by cancelling it. An existing
    // member who starts paying is linked deliberately, by the owner, with
    // admin_link_billing — and the invite path below stays safe because only
    // the holder of that inbox can accept the invite.
    if (email) {
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        return { customerId: input.customerId, email, entitled, action: "member-unlinked" };
      }
    }

    // The payer isn't a member yet. If their money is good, invite them —
    // the invite carries the customer id so it lands on their User row when
    // they accept, and a checkout that never converts to an invite acceptance
    // costs nothing to anyone.
    if (entitled && email) {
      const owner = await db.user.findFirst({
        where: { role: "SUPER_ADMIN" },
        orderBy: { createdAt: "asc" },
      });
      if (!owner) throw new Error("No owner account exists to send the invite from.");
      const existingInvite = await db.invite.findFirst({
        where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
      });
      if (existingInvite) {
        // An invite is already out — likely a free one the owner sent. Leave
        // it exactly as it is: stamping this customer id onto it would turn
        // an invitation the owner chose to make free into a billed one.
        return { customerId: input.customerId, email, entitled, action: "invited" };
      }
      // createInvite replaces any prior unaccepted invite for the address, so
      // the stamp below can only ever land on the invite created right here.
      await createInvite({ actor: owner, email, role: "MEMBER", baseUrl: input.baseUrl });
      await db.invite.updateMany({
        where: { email, acceptedAt: null },
        data: { stripeCustomerId: input.customerId },
      });
      return { customerId: input.customerId, email, entitled, action: "invited" };
    }
    return { customerId: input.customerId, email, entitled, action: "no-user" };
  }

  // Billing never touches the owner. If the owner somehow pays their own
  // instance, nothing here may suspend them.
  if (user.role === "SUPER_ADMIN") {
    return { customerId: input.customerId, email: user.email, entitled, action: "unchanged" };
  }

  if (entitled && !user.isActive) {
    await db.user.update({ where: { id: user.id }, data: { isActive: true } });
    return { customerId: input.customerId, email: user.email, entitled, action: "activated" };
  }
  if (!entitled && user.isActive) {
    // Same semantics as an admin suspension: the flag flips and every session
    // dies now. MCP tokens survive but the stateless transport re-checks
    // isActive on every call, so they stop working on the next one. Data is
    // kept — paying again reactivates the same workspace.
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    await db.session.deleteMany({ where: { userId: user.id } });
    return { customerId: input.customerId, email: user.email, entitled, action: "suspended" };
  }
  return { customerId: input.customerId, email: user.email, entitled, action: "unchanged" };
}

/**
 * The deliberate half of linking, for the one case sync refuses to handle on
 * its own: an existing member who starts paying. The admin names the person;
 * the customer comes from Stripe's records for that same email (or an explicit
 * customer id when Stripe holds more than one). Unlink is the recovery hatch —
 * it detaches the account from billing entirely, which also ends billing's
 * authority over their isActive.
 */
export async function linkBillingCustomer(input: {
  email: string;
  customerId?: string;
  unlink?: boolean;
  baseUrl: string;
}): Promise<BillingSyncResult> {
  const settings = await getSettings();
  if (!billingIsConfigured(settings)) {
    throw new Error("Billing is not configured. Add the Stripe keys in Admin → Billing.");
  }

  const email = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);

  if (input.unlink) {
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: "" } });
    return { customerId: user.stripeCustomerId, email, entitled: false, action: "unlinked" };
  }

  if (user.role === "SUPER_ADMIN") {
    throw new Error("The owner's account can't be put under billing.");
  }

  let customerId = input.customerId?.trim() ?? "";
  if (!customerId) {
    const body = await stripeGet(
      `/v1/customers?email=${encodeURIComponent(email)}&limit=3`,
      settings.stripeSecretKey,
    );
    const customers = (body.data ?? []) as { id?: string }[];
    if (customers.length === 0) {
      throw new Error(`Stripe has no customer with the email ${email}. Ask them to check out first, or pass a customerId.`);
    }
    if (customers.length > 1) {
      throw new Error(
        `Stripe has ${customers.length} customers with that email (${customers.map((c) => c.id).join(", ")}). Pass the right customerId explicitly.`,
      );
    }
    customerId = customers[0].id ?? "";
  }
  if (!customerId) throw new Error("Could not resolve a Stripe customer id.");

  const clash = await db.user.findFirst({
    where: { stripeCustomerId: customerId, NOT: { id: user.id } },
  });
  if (clash) throw new Error(`That Stripe customer is already linked to ${clash.email}.`);

  await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  return syncStripeCustomer({ customerId, baseUrl: input.baseUrl, settings });
}

/**
 * Re-converge from Stripe on demand — the recovery path for a missed webhook.
 * With an email, syncs that one person; without, every user carrying a
 * customer id. Safe to run any time, any number of times.
 */
export async function syncAllBilling(baseUrl: string, email?: string): Promise<BillingSyncResult[]> {
  const settings = await getSettings();
  if (!billingIsConfigured(settings)) {
    throw new Error("Billing is not configured. Add the Stripe keys in Admin → Billing.");
  }

  if (email) {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new Error(`No user with email ${email}`);
    if (!user.stripeCustomerId) {
      throw new Error(`${email} has no Stripe customer attached — they aren't a billed user.`);
    }
    return [
      await syncStripeCustomer({ customerId: user.stripeCustomerId, baseUrl, settings }),
    ];
  }

  const billed = await db.user.findMany({
    where: { stripeCustomerId: { not: "" } },
    orderBy: { createdAt: "asc" },
  });
  const results: BillingSyncResult[] = [];
  for (const user of billed) {
    results.push(
      await syncStripeCustomer({ customerId: user.stripeCustomerId, baseUrl, settings }),
    );
  }
  return results;
}

/** How many people currently pay for this instance. */
export async function billedUserCount(): Promise<number> {
  return db.user.count({ where: { stripeCustomerId: { not: "" } } });
}
