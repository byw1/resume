"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { relativeDay } from "@/lib/utils";
import {
  deleteVariableAction,
  saveVariablesAction,
  sendTestEmailAction,
  syncBillingAction,
} from "@/server/actions";

type Variable = {
  key: string;
  label: string;
  help: string;
  kind: "text" | "url" | "secret" | "toggle";
  group: string;
  value: string;
  placeholder: string;
  fallbackText: string;
  hasValue: boolean;
  isDefault: boolean;
  known: boolean;
  updatedAt: string | null;
};

/**
 * Everything this instance is configured with, on one screen.
 *
 * This used to be two tabs: guided forms for email and billing, and a flat
 * table of the same values underneath. Two screens editing the same nine rows
 * is a question — "which one is authoritative?" — that has no good answer, so
 * there is one screen now. The guided part did not disappear; it moved into
 * the section it belongs to. Resend still carries its setup steps and its test
 * send, Stripe still shows the webhook URL to register and the resync button,
 * and every field under both is the same editable row as everything else.
 */
export function ConfigurationPanel({
  variables,
  google,
  email,
  billing,
}: {
  variables: Variable[];
  google: { configured: boolean; redirectUri: string };
  email: { configured: boolean; fromEmail: string; ownEmail: string };
  billing: { configured: boolean; billedUsers: number; webhookUrl: string };
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, startSaving] = useTransition();
  const [resetting, startResetting] = useTransition();
  const [adding, startAdding] = useTransition();

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Variable[]>();
    for (const variable of variables) {
      if (!map.has(variable.group)) {
        map.set(variable.group, []);
        order.push(variable.group);
      }
      map.get(variable.group)!.push(variable);
    }
    return order.map((name) => ({ name, rows: map.get(name)! }));
  }, [variables]);

  // A secret's shown value is a mask, so anything typed into one is a change
  // and an empty box means "leave it alone" — which is also why clearing a
  // secret is the reset button rather than deleting the text.
  const pending = variables.filter((variable) => {
    const edited = edits[variable.key];
    if (edited === undefined) return false;
    return variable.kind === "secret" ? edited.trim() !== "" : edited !== variable.value;
  });

  const save = () =>
    startSaving(async () => {
      const patch = Object.fromEntries(pending.map((v) => [v.key, edits[v.key]]));
      const result = await saveVariablesAction(patch);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEdits({});
      router.refresh();
      toast.success(
        result.changed.length === 0 ? "Nothing changed" : `Saved: ${result.changed.join(", ")}`,
      );
    });

  const reset = (variable: Variable) =>
    startResetting(async () => {
      const result = await deleteVariableAction(variable.key);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEdits(({ [variable.key]: _cleared, ...rest }) => rest);
      router.refresh();
      toast.success(
        variable.known
          ? `${variable.label} is back to its default (${variable.fallbackText})`
          : `${variable.key} removed`,
      );
    });

  const add = () =>
    startAdding(async () => {
      const result = await saveVariablesAction({ [newKey.trim()]: newValue });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setNewKey("");
      setNewValue("");
      router.refresh();
      toast.success(`${newKey.trim()} added`);
    });

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Card key={group.name}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <CardTitle className="text-[15px]">{group.name}</CardTitle>
              {group.name === "Sign-in" && (
                <StatusBadge
                  ok={google.configured}
                  okLabel="Google is on"
                  notLabel="Password only"
                  neutral
                />
              )}
              {group.name === "Email" && (
                <StatusBadge
                  ok={email.configured}
                  okLabel="Ready"
                  notLabel="Set up needed"
                />
              )}
              {group.name === "Billing" && (
                <StatusBadge
                  ok={billing.configured}
                  okLabel={`${billing.billedUsers} paying ${billing.billedUsers === 1 ? "member" : "members"}`}
                  notLabel="Not configured"
                />
              )}
            </div>
            <p className="text-muted-foreground text-sm">{GROUP_BLURB[group.name] ?? ""}</p>
          </CardHeader>

          <CardContent className="pt-0">
            {group.name === "Sign-in" && <GoogleSetup redirectUri={google.redirectUri} />}
            {group.name === "Email" && !email.configured && <ResendSteps />}
            {group.name === "Billing" && <WebhookUrl url={billing.webhookUrl} />}

            <div className="divide-border/70 divide-y">
              {group.rows.map((variable) => (
                <Row
                  key={variable.key}
                  variable={variable}
                  draft={edits[variable.key]}
                  busy={resetting}
                  onChange={(value) => setEdits((prev) => ({ ...prev, [variable.key]: value }))}
                  onReset={() => {
                    if (
                      !confirm(
                        variable.known
                          ? `Reset ${variable.label} to its default (${variable.fallbackText})?`
                          : `Remove ${variable.key}? Whatever reads it falls back to nothing.`,
                      )
                    ) {
                      return;
                    }
                    reset(variable);
                  }}
                />
              ))}
            </div>

            {group.name === "Email" && (
              <>
                <Separator className="my-5" />
                <TestEmail ownEmail={email.ownEmail} configured={email.configured} />
              </>
            )}
            {group.name === "Billing" && (
              <>
                <Separator className="my-5" />
                <ResyncBilling configured={billing.configured} />
              </>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Add a variable</CardTitle>
          <p className="text-muted-foreground text-sm">
            For a setting that has no section of its own yet — a feature can read a key today
            rather than waiting on a screen being built for it. Lowercase letters, numbers and
            underscores. Values are stored as plain text and shown in full here and in the log,
            so don&apos;t put a key or a password in one.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="new-variable-key">Key</Label>
              <Input
                id="new-variable-key"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="retention_days"
                className="font-mono text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-variable-value">Value</Label>
              <Input
                id="new-variable-value"
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                placeholder="90"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={add} disabled={adding || !newKey.trim()}>
                {adding ? <LoaderCircleIcon className="animate-spin" /> : <PlusIcon />}
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sticky, because the page is longer than a screen and one save covers
          every section — you can fix the from address and the payment link in
          the same pass without hunting for two buttons. */}
      {pending.length > 0 && (
        <div className="bg-card/95 shadow-raised sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur">
          <span className="text-sm">
            {pending.length} unsaved {pending.length === 1 ? "change" : "changes"}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {pending.map((variable) => variable.key).join(", ")}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => setEdits({})} disabled={saving}>
              Discard
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <LoaderCircleIcon className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** What each section is for, in one line, above its fields. */
const GROUP_BLURB: Record<string, string> = {
  Instance: "What this instance is called and where it lives. Every invitation link, published resume and webhook URL is built from the public URL.",
  "Sign-in": "Everyone can always sign in with an email and password. Adding a Google client turns on a Continue with Google button as well — existing members and anyone holding an invitation can use it straight away.",
  Email: "Invitations go out through Resend. Everything works without it — creating an invite just gives you a link to send yourself.",
  Billing: "Optional, for hosting other people here for a fee. Someone who pays through your Stripe payment link is invited automatically; a lapsed subscription suspends them, data kept, and paying again turns them back on.",
  Custom: "Variables added by hand. Nothing in the app reads these unless something was written to look for them.",
};

/**
 * `neutral` is for a section where "off" is a perfectly good answer. Email
 * unconfigured is a warning because invitations quietly stop arriving; Google
 * unconfigured just means passwords, which is how most instances will run.
 */
function StatusBadge({
  ok,
  okLabel,
  notLabel,
  neutral = false,
}: {
  ok: boolean;
  okLabel: string;
  notLabel: string;
  neutral?: boolean;
}) {
  if (!ok && neutral) {
    return (
      <Badge variant="outline" className="text-[11px]">
        {notLabel}
      </Badge>
    );
  }
  return (
    <Badge variant={ok ? "success" : "warning"} className="gap-1">
      {ok ? <CheckCircle2Icon className="size-3" /> : <TriangleAlertIcon className="size-3" />}
      {ok ? okLabel : notLabel}
    </Badge>
  );
}

function GoogleSetup({ redirectUri }: { redirectUri: string }) {
  return (
    <div className="mb-5 space-y-3">
      <ol className="space-y-2">
        {[
          <>
            In the{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-0.5 underline underline-offset-2"
            >
              Google Cloud console <ExternalLinkIcon className="size-3" />
            </a>
            , create an OAuth client ID of type <strong>Web application</strong>.
          </>,
          <>Add the redirect URI below under Authorised redirect URIs, exactly as shown.</>,
          <>Paste the client ID and secret in, and save.</>,
        ].map((step, index) => (
          <li key={index} className="flex gap-3 text-sm">
            <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums">
              {index + 1}
            </span>
            <span className="text-muted-foreground pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-1.5">
        <Label>Authorised redirect URI</Label>
        <div className="flex items-center gap-2">
          <code className="bg-muted/70 min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-[12px]">
            {redirectUri}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(redirectUri);
              toast.success("Copied.");
            }}
            aria-label="Copy the redirect URI"
          >
            <CopyIcon />
          </Button>
        </div>
        <p className="text-faint text-[12px]">
          Character for character, or Google answers every sign-in with
          redirect_uri_mismatch. It is built from the public URL above, so fix that first if
          it looks wrong.
        </p>
      </div>
    </div>
  );
}

function ResendSteps() {
  return (
    <ol className="mb-5 space-y-2">
      {[
        <>
          Create a free account at{" "}
          <a
            href="https://resend.com"
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-0.5 underline underline-offset-2"
          >
            resend.com <ExternalLinkIcon className="size-3" />
          </a>
          .
        </>,
        <>Add and verify the domain you want to send from.</>,
        <>Create an API key and paste it below, with a from address on that domain.</>,
        <>Save, then send yourself a test to prove it works.</>,
      ].map((step, index) => (
        <li key={index} className="flex gap-3 text-sm">
          <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums">
            {index + 1}
          </span>
          <span className="text-muted-foreground pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function WebhookUrl({ url }: { url: string }) {
  return (
    <div className="mb-5 space-y-1.5">
      <Label>Webhook URL</Label>
      <div className="flex items-center gap-2">
        <code className="bg-muted/70 min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-[12px]">
          {url}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success("Copied.");
          }}
          aria-label="Copy the webhook URL"
        >
          <CopyIcon />
        </Button>
      </div>
      <p className="text-faint text-[12px]">
        Register this in Stripe with the events checkout.session.completed,
        customer.subscription.created / updated / deleted, invoice.payment_failed.
      </p>
    </div>
  );
}

function TestEmail({ ownEmail, configured }: { ownEmail: string; configured: boolean }) {
  const [to, setTo] = useState(ownEmail);
  const [testing, startTesting] = useTransition();

  return (
    <div className="space-y-2">
      <Label htmlFor="test-email">Send a test email</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="test-email"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="you@example.com"
          className="min-w-[14rem] flex-1"
        />
        <Button
          variant="outline"
          disabled={testing}
          onClick={() =>
            startTesting(async () => {
              const result = await sendTestEmailAction(to);
              if (result.ok) toast.success(`Test email sent to ${result.to}`);
              else toast.error(result.error, { duration: 8000 });
            })
          }
        >
          {testing ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
          Send test
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {configured
          ? "If it fails, the exact reason from Resend is shown — usually an unverified domain."
          : "Save a key and a from address first. Until then this reports what is missing."}
      </p>
    </div>
  );
}

function ResyncBilling({ configured }: { configured: boolean }) {
  const [syncing, startSyncing] = useTransition();

  return (
    <div className="space-y-2">
      <Label>Reconcile with Stripe</Label>
      <div>
        <Button
          variant="outline"
          disabled={syncing || !configured}
          onClick={() =>
            startSyncing(async () => {
              const result = await syncBillingAction();
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              const changed = result.results.filter((r) => r.action !== "unchanged");
              toast.success(
                result.results.length === 0
                  ? "No billed users to sync yet."
                  : changed.length === 0
                    ? `All ${result.results.length} billed user${result.results.length === 1 ? "" : "s"} already match Stripe.`
                    : changed.map((r) => `${r.email}: ${r.action}`).join(", "),
              );
            })
          }
        >
          {syncing ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
          Resync from Stripe
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Asks Stripe for the current subscription state and fixes anything that drifted — the
        recovery path for a webhook that never arrived. Safe to run any time.
      </p>
    </div>
  );
}

function Row({
  variable,
  draft,
  busy,
  onChange,
  onReset,
}: {
  variable: Variable;
  draft: string | undefined;
  busy: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const current = draft ?? (variable.kind === "secret" ? "" : variable.value);

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`variable-${variable.key}`} className="text-[13px]">
            {variable.label}
          </Label>
          {variable.isDefault && (
            <Badge variant="outline" className="text-[10px]">
              default
            </Badge>
          )}
        </div>
        {variable.known && (
          <code className="text-faint mt-1 block font-mono text-[11px]">{variable.key}</code>
        )}
        {variable.help && (
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{variable.help}</p>
        )}
        {variable.updatedAt && (
          <p className="text-faint mt-1.5 text-[11px]">
            changed {relativeDay(new Date(variable.updatedAt))}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {variable.kind === "toggle" ? (
            <div className="flex h-9 items-center gap-2">
              <Switch
                id={`variable-${variable.key}`}
                checked={current !== "0"}
                onCheckedChange={(checked) => onChange(checked ? "1" : "0")}
              />
              <span className="text-muted-foreground text-sm">
                {current !== "0" ? "on" : "off"}
              </span>
            </div>
          ) : (
            <Input
              id={`variable-${variable.key}`}
              type={variable.kind === "secret" ? "password" : "text"}
              value={current}
              onChange={(event) => onChange(event.target.value)}
              placeholder={
                variable.kind === "secret" && variable.hasValue
                  ? variable.value
                  : variable.placeholder
              }
              className="font-mono text-[13px]"
            />
          )}
          {variable.kind === "secret" && (
            <p className="text-faint mt-1.5 text-[11px]">
              {variable.hasValue
                ? "Set. Leave blank to keep it, paste to replace it."
                : "Not set."}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive mt-1"
          onClick={onReset}
          disabled={busy || variable.isDefault}
          aria-label={variable.known ? `Reset ${variable.label}` : `Remove ${variable.key}`}
          title={variable.known ? `Reset to ${variable.fallbackText}` : "Remove"}
        >
          <RotateCcwIcon />
        </Button>
      </div>
    </div>
  );
}
