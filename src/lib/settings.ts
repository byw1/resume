import { db } from "@/lib/db";

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

export async function getSettings(): Promise<InstanceSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
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

export async function updateSettings(patch: Partial<InstanceSettings>) {
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
  for (const [key, value] of entries) {
    if (value !== undefined) await setSetting(key, value.trim());
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
