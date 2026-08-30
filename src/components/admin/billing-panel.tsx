"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2Icon,
  CopyIcon,
  CreditCardIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { saveConfigAction, syncBillingAction } from "@/server/actions";

/**
 * Hosting other people for a fee. The Stripe side is built by hand in their
 * Dashboard — a Product, a recurring Price, a Payment Link, a webhook — and
 * this panel holds the three values that connect it to this instance. The
 * mechanism is described where the admin can read it, because a payment flow
 * you can't explain is one you can't debug at 9pm when a friend's card fails.
 */
export function BillingPanel({
  configured,
  settings,
  billedUsers,
  webhookUrl,
}: {
  configured: boolean;
  settings: {
    stripeSecretKeyMasked: string;
    hasSecretKey: boolean;
    stripeWebhookSecretMasked: string;
    hasWebhookSecret: boolean;
    stripePaymentLink: string;
  };
  billedUsers: number;
  webhookUrl: string;
}) {
  const [values, setValues] = useState({
    stripeSecretKey: "",
    stripeWebhookSecret: "",
    stripePaymentLink: settings.stripePaymentLink,
  });
  const [saving, startSaving] = useTransition();
  const [syncing, startSyncing] = useTransition();

  const save = () =>
    startSaving(async () => {
      const result = await saveConfigAction(values);
      if (result.ok) {
        setValues((v) => ({ ...v, stripeSecretKey: "", stripeWebhookSecret: "" }));
        toast.success("Billing settings saved.");
      }
    });

  const sync = () =>
    startSyncing(async () => {
      const result = await syncBillingAction();
      if (result.ok) {
        const changed = result.results.filter((r) => r.action !== "unchanged");
        toast.success(
          result.results.length === 0
            ? "No billed users to sync yet."
            : changed.length === 0
              ? `All ${result.results.length} billed user${result.results.length === 1 ? "" : "s"} already match Stripe.`
              : changed.map((r) => `${r.email}: ${r.action}`).join(", "),
        );
      } else {
        toast.error(result.error);
      }
    });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <CreditCardIcon className="text-muted-foreground size-4" />
          Billing
        </CardTitle>
        {configured ? (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <CheckCircle2Icon className="text-success size-3" />
            {billedUsers} paying {billedUsers === 1 ? "member" : "members"}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[11px]">Not configured</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Host this instance for other people and charge for it. In Stripe: create a product
          with a recurring price, a payment link for it, and a webhook pointed at the URL
          below. Someone who pays through the link is invited here automatically; if their
          subscription lapses they&apos;re suspended — data kept, sign-in and Claude access off —
          and paying again turns them back on.
        </p>

        <div className="space-y-1.5">
          <Label>Webhook URL</Label>
          <div className="flex items-center gap-2">
            <code className="bg-muted/70 min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-[12px]">
              {webhookUrl}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toast.success("Copied.");
              }}
            >
              <CopyIcon />
            </Button>
          </div>
          <p className="text-faint text-[12px]">
            Events: checkout.session.completed, customer.subscription.created / updated /
            deleted, invoice.payment_failed.
          </p>
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="stripe-key">Secret key</Label>
            <Input
              id="stripe-key"
              type="password"
              placeholder={settings.hasSecretKey ? settings.stripeSecretKeyMasked : "rk_live_… or sk_live_…"}
              value={values.stripeSecretKey}
              onChange={(e) => setValues((v) => ({ ...v, stripeSecretKey: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stripe-whsec">Webhook signing secret</Label>
            <Input
              id="stripe-whsec"
              type="password"
              placeholder={settings.hasWebhookSecret ? settings.stripeWebhookSecretMasked : "whsec_…"}
              value={values.stripeWebhookSecret}
              onChange={(e) => setValues((v) => ({ ...v, stripeWebhookSecret: e.target.value }))}
            />
          </div>
        </div>
        <p className="text-faint text-[12px]">
          Use a restricted key (Developers → API keys → Create restricted key) with
          read-only Customers and Subscriptions — that&apos;s all this app ever reads, and a
          stolen restricted key can&apos;t move money or change anything in Stripe.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="stripe-link">Payment link</Label>
          <Input
            id="stripe-link"
            placeholder="https://buy.stripe.com/…"
            value={values.stripePaymentLink}
            onChange={(e) => setValues((v) => ({ ...v, stripePaymentLink: e.target.value }))}
          />
          <p className="text-faint text-[12px]">
            The public checkout URL — put it wherever you send people who want in.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={saving}>
            {saving && <LoaderCircleIcon className="animate-spin" />}
            Save
          </Button>
          <Button variant="outline" onClick={sync} disabled={syncing || !configured}>
            {syncing ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
            Resync from Stripe
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
