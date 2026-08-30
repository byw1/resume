import { db } from "@/lib/db";
import { recordAudit } from "@/lib/data/audit";

/**
 * Instance-wide configuration, stored in the database rather than in env vars
 * so an admin can change it from the UI without a redeploy.
 *
 * Everything configurable is declared once, in VARIABLES below. That list is
 * the source of the typed settings object, the defaults, the audit wording and
 * the Variables screen — so adding a knob is one entry here plus a field on
 * InstanceSettings, and nothing has to be taught about it twice.
 *
 * Note the shape of this file against brain.ts, resumes.ts and pipeline.ts.
 * Those take `userId` first because they touch one person's content and the
 * compiler has to reject a call site that forgets. Nothing here is anyone's
 * content — it is how the instance behaves — so it follows users.ts and
 * system.ts instead: the writes take the acting admin first, for the audit
 * trail rather than for isolation, and only admins can reach any of it.
 */

export const SETTING_KEYS = {
  instanceName: "instance_name",
  resendApiKey: "resend_api_key",
  resendFromEmail: "resend_from_email",
  resendFromName: "resend_from_name",
  publicUrl: "public_url",
  companyLogos: "company_logos",
  stripeSecretKey: "stripe_secret_key",
  stripeWebhookSecret: "stripe_webhook_secret",
  stripePaymentLink: "stripe_payment_link",
} as const;

export type InstanceSettings = {
  instanceName: string;
  resendApiKey: string;
  resendFromEmail: string;
  resendFromName: string;
  publicUrl: string;
  /** Off means no request ever leaves the browser for a logo. */
  companyLogos: boolean;
  /** Stripe, for the instance owner who hosts other people for a fee. */
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  /** A Stripe Payment Link — the public checkout URL for this instance. */
  stripePaymentLink: string;
};

/**
 * `secret` is never sent to a browser or returned by a tool, and the audit log
 * records only that it moved. `toggle` stores "1" or "0". Everything else is
 * a string that shows its value everywhere.
 */
export type VariableKind = "text" | "url" | "secret" | "toggle";

export type VariableGroup = "Instance" | "Email" | "Billing";

export type VariableDef = {
  key: string;
  /** The field this key backs on InstanceSettings. */
  field: keyof InstanceSettings;
  label: string;
  help: string;
  kind: VariableKind;
  group: VariableGroup;
  placeholder: string;
  /** What the app uses when no row is stored. Raw, so "1" for a toggle. */
  fallback: string;
};

/** The group a key with no entry here lands in on the Variables screen. */
export const CUSTOM_GROUP = "Custom";

export const VARIABLES: VariableDef[] = [
  {
    key: SETTING_KEYS.instanceName,
    field: "instanceName",
    label: "Instance name",
    help: "What this instance is called. Shown on the sign-in page and in every email it sends.",
    kind: "text",
    group: "Instance",
    placeholder: "Hired",
    fallback: "Hired",
  },
  {
    key: SETTING_KEYS.publicUrl,
    field: "publicUrl",
    label: "Public URL",
    help: "Where this instance is reachable from outside. Invitation links and the Stripe webhook URL are built from it. Left empty, the app guesses from the incoming request, which is right until something sits in front of it.",
    kind: "url",
    group: "Instance",
    placeholder: "https://your-app.up.railway.app",
    fallback: "",
  },
  {
    key: SETTING_KEYS.companyLogos,
    field: "companyLogos",
    label: "Company logos",
    // On by default: a job tracker with no logos looks unfinished, and the
    // switch exists for the person who would rather twenty-icons.com not see
    // which companies they are applying to.
    help: "Shows each company's favicon in the pipeline. Fetching it means the browser asks twenty-icons.com for the logo, so that service can see which companies people here are tracking. Off, everyone gets initials instead.",
    kind: "toggle",
    group: "Instance",
    placeholder: "",
    fallback: "1",
  },
  {
    key: SETTING_KEYS.resendApiKey,
    field: "resendApiKey",
    label: "Resend API key",
    help: "Starts with re_. Stored on your server and never shown again.",
    kind: "secret",
    group: "Email",
    placeholder: "re_...",
    fallback: "",
  },
  {
    key: SETTING_KEYS.resendFromEmail,
    field: "resendFromEmail",
    label: "From address",
    help: "Must be on a domain you have verified in Resend, or every send is rejected.",
    kind: "text",
    group: "Email",
    placeholder: "hello@yourdomain.com",
    fallback: "",
  },
  {
    key: SETTING_KEYS.resendFromName,
    field: "resendFromName",
    label: "From name",
    help: "The display name on outgoing mail.",
    kind: "text",
    group: "Email",
    placeholder: "Hired",
    fallback: "Hired",
  },
  {
    key: SETTING_KEYS.stripeSecretKey,
    field: "stripeSecretKey",
    label: "Stripe secret key",
    help: "A restricted rk_ key with read-only Customers and Subscriptions is enough, and safer than the full sk_ key.",
    kind: "secret",
    group: "Billing",
    placeholder: "rk_live_… or sk_live_…",
    fallback: "",
  },
  {
    key: SETTING_KEYS.stripeWebhookSecret,
    field: "stripeWebhookSecret",
    label: "Stripe signing secret",
    help: "From the webhook you registered in Stripe. Without it every incoming event is refused.",
    kind: "secret",
    group: "Billing",
    placeholder: "whsec_…",
    fallback: "",
  },
  {
    key: SETTING_KEYS.stripePaymentLink,
    field: "stripePaymentLink",
    label: "Stripe payment link",
    help: "The public checkout URL — put it wherever you send people who want in.",
    kind: "url",
    group: "Billing",
    placeholder: "https://buy.stripe.com/…",
    fallback: "",
  },
];

const BY_KEY = new Map(VARIABLES.map((variable) => [variable.key, variable]));

/**
 * A key an admin invents. Lowercase, underscores, no spaces — the same shape
 * as the keys above, so a variable added by hand today reads like one that
 * grows a form tomorrow.
 */
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

export function assertVariableKey(key: string) {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      "A variable key is lowercase letters, numbers and underscores, starting with a letter — like retention_days.",
    );
  }
}

/** Raw stored values for the declared keys, so a write can tell what changed. */
async function getSettingsMap() {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function getSettings(): Promise<InstanceSettings> {
  const map = await getSettingsMap();
  const raw = (key: string) => map.get(key) ?? BY_KEY.get(key)?.fallback ?? "";
  return {
    instanceName: raw(SETTING_KEYS.instanceName),
    resendApiKey: raw(SETTING_KEYS.resendApiKey),
    resendFromEmail: raw(SETTING_KEYS.resendFromEmail),
    resendFromName: raw(SETTING_KEYS.resendFromName),
    publicUrl: raw(SETTING_KEYS.publicUrl),
    companyLogos: raw(SETTING_KEYS.companyLogos) !== "0",
    stripeSecretKey: raw(SETTING_KEYS.stripeSecretKey),
    stripeWebhookSecret: raw(SETTING_KEYS.stripeWebhookSecret),
    stripePaymentLink: raw(SETTING_KEYS.stripePaymentLink),
  };
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

type Actor = { id: string; email: string };

/** What a value looks like when nothing is stored, in words. */
function defaultText(variable: VariableDef) {
  if (variable.kind === "toggle") return variable.fallback === "0" ? "off" : "on";
  return variable.fallback || "empty";
}

/**
 * How a change reads in the audit log.
 *
 * A secret records that the field was set, never what it was set to.
 * Everything else records the new value, because "Public URL →
 * https://app.hired.tools" is the whole reason you would read the row.
 */
function describeChange(key: string, value: string) {
  const variable = BY_KEY.get(key);
  if (!variable) return `${key} → ${value || "(empty)"}`;
  if (variable.kind === "secret") return `${variable.label} ${value ? "set" : "cleared"}`;
  if (variable.kind === "toggle") return `${variable.label} → ${value === "0" ? "off" : "on"}`;
  return `${variable.label} → ${value || "(empty)"}`;
}

/**
 * The one write path. Compares against what is stored, saves what actually
 * moved, and records a single audit row naming every field that changed.
 *
 * A save that changes nothing writes nothing — the panels send every field on
 * every submit, so without the comparison the log would fill with rows
 * recording that somebody opened a form.
 */
async function applyChanges(actor: Actor, entries: [string, string][]) {
  if (entries.length === 0) return [];

  const rows = await db.setting.findMany({
    where: { key: { in: entries.map(([key]) => key) } },
  });
  const before = new Map(rows.map((row) => [row.key, row.value]));
  const changed: string[] = [];

  for (const [key, value] of entries) {
    const next = value.trim();
    if ((before.get(key) ?? "") === next) continue;
    await setSetting(key, next);
    changed.push(describeChange(key, next));
  }

  if (changed.length > 0) {
    await recordAudit({ actor, action: "settings.change", detail: changed.join(", ") });
  }
  return changed;
}

/**
 * Change instance configuration.
 *
 * The actor is first and required, the same shape as `setUserRole` and
 * `adminResetPassword`, and for the same reason: the compiler rejects a call
 * site that forgets, so nothing can change how the instance behaves without a
 * name attached. That matters most for the quietest failure this app has —
 * clearing the Resend key breaks every future invitation and produces no error
 * anywhere until somebody notices they were never emailed.
 */
export async function updateSettings(actor: Actor, patch: Partial<InstanceSettings>) {
  const entries: [string, string][] = [];
  for (const variable of VARIABLES) {
    const value = patch[variable.field];
    if (value === undefined) continue;
    entries.push([
      variable.key,
      variable.kind === "toggle" ? (value ? "1" : "0") : String(value),
    ]);
  }
  return applyChanges(actor, entries);
}

export type VariableRow = {
  key: string;
  label: string;
  help: string;
  kind: VariableKind;
  group: string;
  /** Masked when the variable is a secret — the raw value never leaves here. */
  value: string;
  placeholder: string;
  /** What this falls back to with nothing stored, in words. */
  fallbackText: string;
  hasValue: boolean;
  /** True when no row is stored and the built-in default is in force. */
  isDefault: boolean;
  /** False for a key an admin invented, which has no form of its own. */
  known: boolean;
  updatedAt: string | null;
};

/**
 * Every configurable value on this instance, declared ones first and anything
 * an admin added after them. Secrets come back masked, which is why this is
 * safe to hand straight to a client component.
 */
export async function listVariables(): Promise<VariableRow[]> {
  const rows = await db.setting.findMany({ orderBy: { key: "asc" } });
  const stored = new Map(rows.map((row) => [row.key, row]));

  const declared = VARIABLES.map((variable) => {
    const row = stored.get(variable.key);
    const value = row?.value ?? variable.fallback;
    return {
      key: variable.key,
      label: variable.label,
      help: variable.help,
      kind: variable.kind,
      group: variable.group as string,
      value: variable.kind === "secret" ? maskSecret(value) : value,
      placeholder: variable.placeholder,
      fallbackText: defaultText(variable),
      hasValue: Boolean(value),
      isDefault: !row,
      known: true,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });

  const custom = rows
    .filter((row) => !BY_KEY.has(row.key))
    .map((row) => ({
      key: row.key,
      label: row.key,
      help: "",
      kind: "text" as VariableKind,
      group: CUSTOM_GROUP,
      value: row.value,
      placeholder: "",
      fallbackText: "empty",
      hasValue: Boolean(row.value),
      isDefault: false,
      known: false,
      updatedAt: row.updatedAt.toISOString(),
    }));

  return [...declared, ...custom];
}

/**
 * Write variables by key. Unknown keys are created, which is how a setting
 * exists before it has a form of its own.
 */
export async function setVariables(actor: Actor, patch: Record<string, string>) {
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(patch)) {
    const variable = BY_KEY.get(key);
    if (!variable) assertVariableKey(key);
    // Same rule as the guided forms: blank means keep what's there.
    if (variable?.kind === "secret" && value.trim() === "") continue;
    entries.push([
      key,
      variable?.kind === "toggle" ? (value === "1" || value === "true" ? "1" : "0") : value,
    ]);
  }
  return applyChanges(actor, entries);
}

/**
 * Remove a variable's stored value. A declared key falls back to its built-in
 * default; a custom one disappears.
 */
export async function deleteVariable(actor: Actor, key: string) {
  const existing = await db.setting.findUnique({ where: { key } });
  if (!existing) return { deleted: false, key };

  await db.setting.delete({ where: { key } });

  const variable = BY_KEY.get(key);
  const detail = !variable
    ? `Variable ${key} removed`
    : variable.kind === "secret"
      ? `${variable.label} cleared`
      : `${variable.label} reset to ${defaultText(variable)}`;
  await recordAudit({ actor, action: "settings.change", detail });

  return { deleted: true, key, detail };
}

export function emailIsConfigured(settings: InstanceSettings) {
  return Boolean(settings.resendApiKey && settings.resendFromEmail);
}

export function billingIsConfigured(settings: InstanceSettings) {
  return Boolean(settings.stripeSecretKey && settings.stripeWebhookSecret);
}

/** Never send the raw key to the browser. */
export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 5)}${"•".repeat(18)}${value.slice(-4)}`;
}
