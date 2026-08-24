import { NextRequest, NextResponse } from "next/server";
import {
  BILLING_EVENTS,
  syncStripeCustomer,
  verifyStripeSignature,
} from "@/lib/billing";
import { billingIsConfigured, getSettings } from "@/lib/settings";

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
    return NextResponse.json({ received: true, action: result.action });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing sync failed.";
    return new NextResponse(message, { status: 500 });
  }
}
