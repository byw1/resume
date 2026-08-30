import { db } from "@/lib/db";
import { recordAudit } from "@/lib/data/audit";

/**
 * Instance-wide configuration, stored in the database rather than in env vars
 * so an admin can change it from the UI without a redeploy.
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

/** Raw stored values, so a write can tell what actually changed. */
async function getSettingsMap() {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function getSettings(): Promise<InstanceSettings> {
  const map = await getSettingsMap();
  return {
    instanceName: map.get(SETTING_KEYS.instanceName) ?? "Hired",
    resendApiKey: map.get(SETTING_KEYS.resendApiKey) ?? "",
    resendFromEmail: map.get(SETTING_KEYS.resendFromEmail) ?? "",
    resendFromName: map.get(SETTING_KEYS.resendFromName) ?? "Hired",
    publicUrl: map.get(SETTING_KEYS.publicUrl) ?? "",
    // On by default: a job tracker with no logos looks unfinished, and the
    // switch exists for the person who would rather twenty-icons.com not see
    // which companies they are applying to.
    companyLogos: (map.get(SETTING_KEYS.companyLogos) ?? "1") !== "0",
    stripeSecretKey: map.get(SETTING_KEYS.stripeSecretKey) ?? "",
    stripeWebhookSecret: map.get(SETTING_KEYS.stripeWebhookSecret) ?? "",
    stripePaymentLink: map.get(SETTING_KEYS.stripePaymentLink) ?? "",
  };
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/**
 * How each field is described in the audit log.
 *
 * `secret: true` means the row records that the field was set, never what it
 * was set to. Everything else records the new value, because "public URL →
 * https://app.hired.tools" is the whole reason you would read the row.
 */
const FIELD_LABEL: Record<string, { label: string; secret?: boolean }> = {
  [SETTING_KEYS.instanceName]: { label: "Instance name" },
  [SETTING_KEYS.resendApiKey]: { label: "Resend API key", secret: true },
  [SETTING_KEYS.resendFromEmail]: { label: "From address" },
  [SETTING_KEYS.resendFromName]: { label: "From name" },
  [SETTING_KEYS.publicUrl]: { label: "Public URL" },
  [SETTING_KEYS.companyLogos]: { label: "Company logos" },
  [SETTING_KEYS.stripeSecretKey]: { label: "Stripe secret key", secret: true },
  [SETTING_KEYS.stripeWebhookSecret]: { label: "Stripe signing secret", secret: true },
  [SETTING_KEYS.stripePaymentLink]: { label: "Stripe payment link" },
};

/**
 * Change instance configuration.
 *
 * The actor is first and required, the same shape as `setUserRole` and
 * `adminResetPassword`, and for the same reason: the compiler rejects a call
 * site that forgets, so nothing can change how the instance behaves without a
 * name attached. That matters most for the quietest failure this app has —
 * clearing the Resend key breaks every future invitation and produces no error
 * anywhere until somebody notices they were never emailed.
 *
 * One row per save, listing what moved. Secret values never appear in it.
 */
export async function updateSettings(
  actor: { id: string; email: string },
  patch: Partial<InstanceSettings>,
) {
  const entries: [string, string | undefined][] = [
    [SETTING_KEYS.instanceName, patch.instanceName],
    [SETTING_KEYS.resendApiKey, patch.resendApiKey],
    [SETTING_KEYS.resendFromEmail, patch.resendFromEmail],
    [SETTING_KEYS.resendFromName, patch.resendFromName],
    [SETTING_KEYS.publicUrl, patch.publicUrl],
    [SETTING_KEYS.companyLogos, patch.companyLogos === undefined ? undefined : patch.companyLogos ? "1" : "0"],
    [SETTING_KEYS.stripeSecretKey, patch.stripeSecretKey],
    [SETTING_KEYS.stripeWebhookSecret, patch.stripeWebhookSecret],
    [SETTING_KEYS.stripePaymentLink, patch.stripePaymentLink],
  ];

  const before = await getSettingsMap();
  const changed: string[] = [];

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    const next = value.trim();
    if ((before.get(key) ?? "") === next) continue;
    await setSetting(key, next);

    const field = FIELD_LABEL[key];
    if (!field) continue;
    if (field.secret) changed.push(next ? `${field.label} set` : `${field.label} cleared`);
    else changed.push(`${field.label} → ${next || "(empty)"}`);
  }

  if (changed.length > 0) {
    await recordAudit({ actor, action: "settings.change", detail: changed.join(", ") });
  }
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
