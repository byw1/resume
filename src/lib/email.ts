import { emailIsConfigured, getSettings, type InstanceSettings } from "@/lib/settings";

/**
 * Resend over its REST API. No SDK: it is one POST, and skipping the package
 * keeps the deploy smaller and the dependency surface smaller.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  settings?: InstanceSettings;
}): Promise<SendResult> {
  const settings = input.settings ?? (await getSettings());

  if (!emailIsConfigured(settings)) {
    return {
      ok: false,
      error: "Email is not configured. Add a Resend API key and a from address in Admin → Email.",
    };
  }

  const from = settings.resendFromName
    ? `${settings.resendFromName} <${settings.resendFromEmail}>`
    : settings.resendFromEmail;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      // Resend puts the useful part in `message`; fall back to the status.
      return { ok: false, error: body.message || `Resend returned ${response.status}` };
    }
    return { ok: true, id: body.id ?? "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Templates — plain, table-free HTML so it survives every mail client.
// ---------------------------------------------------------------------------

function shell(title: string, body: string, footer: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16181d;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-0.01em;">${title}</h1>
      ${body}
      <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e6e6ea;font-size:12px;color:#6b6f7d;">${footer}</p>
    </div>
  </body>
</html>`;
}

export function inviteEmail(input: {
  instanceName: string;
  inviterName: string;
  acceptUrl: string;
  expiresInDays: number;
}) {
  const subject = `${input.inviterName} invited you to ${input.instanceName}`;
  const html = shell(
    `You've been invited to ${escapeHtml(input.instanceName)}`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
       ${escapeHtml(input.inviterName)} has invited you to join
       <strong>${escapeHtml(input.instanceName)}</strong> — a place to keep everything about your
       career in one spot, build resumes from it, and track where you've applied.
     </p>
     <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
       Click below to pick a password and get started.
     </p>
     <a href="${input.acceptUrl}"
        style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:500;">
       Accept invitation
     </a>
     <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b6f7d;">
       Or paste this link into your browser:<br>
       <span style="color:#3355cc;word-break:break-all;">${input.acceptUrl}</span>
     </p>`,
    `This invitation expires in ${input.expiresInDays} days. If you weren't expecting it, you can ignore this email.`,
  );
  const text = `${input.inviterName} invited you to join ${input.instanceName}.

Accept your invitation: ${input.acceptUrl}

This link expires in ${input.expiresInDays} days.`;
  return { subject, html, text };
}

/**
 * The one email that goes to the instance owner rather than to a user: someone
 * asked for access from the marketing site. It exists so the owner doesn't have
 * to poll an admin screen to find out that a stranger is waiting.
 */
export function waitlistNoticeEmail(input: {
  instanceName: string;
  email: string;
  name: string;
  context: string;
  source: string;
  total: number;
  adminUrl: string;
}) {
  const who = input.name ? `${input.name} (${input.email})` : input.email;
  const subject = `${input.instanceName}: ${who} wants access`;

  const rows = [
    ["Email", input.email],
    input.name ? ["Name", input.name] : null,
    input.context ? ["Looking for", input.context] : null,
    input.source ? ["From", input.source] : null,
  ].filter(Boolean) as [string, string][];

  const html = shell(
    "Someone asked for access",
    `${rows
      .map(
        ([label, value]) =>
          `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;">
             <span style="color:#6b6f7d;">${escapeHtml(label)}</span><br>
             <strong>${escapeHtml(value)}</strong>
           </p>`,
      )
      .join("")}
     <p style="margin:22px 0 0;font-size:15px;line-height:1.6;">
       That's ${input.total} ${input.total === 1 ? "person" : "people"} on the list.
     </p>${
       input.adminUrl
         ? `
     <p style="margin:22px 0 0;">
       <a href="${input.adminUrl}"
          style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:500;">
         Open the waitlist
       </a>
     </p>`
         : ""
     }`,
    "Nobody has been given access. Invite them from Admin \u2192 Waitlist when you're ready.",
  );

  const text = `${who} asked for access to ${input.instanceName}.

${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}

${input.total} on the list.${input.adminUrl ? `\n\nInvite them: ${input.adminUrl}` : ""}

Nobody has been given access yet.`;

  return { subject, html, text };
}

export function testEmail(instanceName: string) {
  return {
    subject: `${instanceName}: email is working`,
    html: shell(
      "Email is working",
      `<p style="margin:0;font-size:15px;line-height:1.6;">
         If you're reading this, ${escapeHtml(instanceName)} can send mail through Resend.
         Invitations will go out from this address.
       </p>`,
      "Sent from your instance's Admin → Email page.",
    ),
    text: `Email is working. ${instanceName} can send mail through Resend.`,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
