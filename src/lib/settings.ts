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
} as const;

export type InstanceSettings = {
  instanceName: string;
  resendApiKey: string;
  resendFromEmail: string;
  resendFromName: string;
  publicUrl: string;
};

export async function getSettings(): Promise<InstanceSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    instanceName: map.get(SETTING_KEYS.instanceName) ?? "Resume OS",
    resendApiKey: map.get(SETTING_KEYS.resendApiKey) ?? "",
    resendFromEmail: map.get(SETTING_KEYS.resendFromEmail) ?? "",
    resendFromName: map.get(SETTING_KEYS.resendFromName) ?? "Resume OS",
    publicUrl: map.get(SETTING_KEYS.publicUrl) ?? "",
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
  ];
  for (const [key, value] of entries) {
    if (value !== undefined) await setSetting(key, value.trim());
  }
}

export function emailIsConfigured(settings: InstanceSettings) {
  return Boolean(settings.resendApiKey && settings.resendFromEmail);
}

/** Never send the raw key to the browser. */
export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 5)}${"•".repeat(18)}${value.slice(-4)}`;
}
