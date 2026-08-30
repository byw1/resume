import { NextRequest, NextResponse } from "next/server";
import {
  BILLING_EVENTS,
  syncStripeCustomer,
  verifyStripeSignature,
} from "@/lib/billing";
import { billingIsConfigured, getSettings } from "@/lib/settings";
import { recordSystemEvent } from "@/lib/data/system";

export const dynamic = "force-dynamic";

/**
 * The one Stripe endpoint. Paste its URL into a Stripe webhook pointing at
 * the five events in BILLING_EVENTS (Admin → Billing shows the exact URL).
 *
 * The event payload is never trusted beyond the customer id and an email —
 * every decision comes from asking Stripe for the customer's current state,
 * so a duplicate, late or out-of-order delivery converges to the same answer.
 * Failures return 500 on purpose: Stripe retries for days, which makes its
 * retry queue the durable job queue this app otherwise doesn't have.
 */
export async function POST(request: NextRequest) {
  const settings = await getSettings();
  if (!billingIsConfigured(settings)) {
    return new NextResponse("Billing is not configured on this instance.", { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(payload, signature, settings.stripeWebhookSecret)) {
    // Worth recording rather than only returning 400: the usual cause is the
    // wrong signing secret pasted into the Billing tab, and that looks exactly
    // like "Stripe stopped working" from the outside.
    await recordSystemEvent({
      level: "WARN",
      source: "stripe.webhook",
      message: "Signature verification failed.",
      detail: "Usually the wrong signing secret in Admin → Billing.",
    });
    return new NextResponse("Signature verification failed.", { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new NextResponse("Not JSON.", { status: 400 });
  }

  if (!event.type || !BILLING_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type ?? "unknown" });
  }

  const object = event.data?.object ?? {};
  const customerId = typeof object.customer === "string" ? object.customer : "";
  if (!customerId) return NextResponse.json({ received: true, ignored: "no customer" });

  // checkout.session.completed carries the payer's email; subscription and
  // invoice events don't, and sync looks it up from Stripe when needed.
  const details = object.customer_details as { email?: string } | undefined;
  const email = typeof details?.email === "string" ? details.email : null;

  const baseUrl = settings.publicUrl || request.nextUrl.origin;

  try {
    const result = await syncStripeCustomer({ customerId, email, baseUrl, settings });
    // Recorded on success too, and this is the point of the table: entitlement
    // only stays correct while these keep arriving, and a webhook that quietly
    // stops produces no error anywhere. "Last one 4m ago" is the only evidence.
    await recordSystemEvent({
      level: "INFO",
      source: "stripe.webhook",
      message: `${event.type} — ${result.action}`,
      detail: "",
      userEmail: email ?? "",
    });
    return NextResponse.json({ received: true, action: result.action });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing sync failed.";
    await recordSystemEvent({
      source: "billing.sync",
      message,
      detail: event.type,
      userEmail: email ?? "",
    });
    return new NextResponse(message, { status: 500 });
  }
}
