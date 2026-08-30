"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ActivityType, NoteKind, Stage, UserRole } from "@prisma/client";
import * as brain from "@/lib/data/brain";
import * as resumes from "@/lib/data/resumes";
import * as pipeline from "@/lib/data/pipeline";
import * as views from "@/lib/data/views";
import * as pipelineShare from "@/lib/data/pipeline-share";
import * as users from "@/lib/data/users";
import * as waitlist from "@/lib/data/waitlist";
import * as connections from "@/lib/data/connections";
import {
  authenticate,
  claimInstance,
  endSession,
  instanceNeedsSetup,
  requireAdmin,
  requireUser,
  setupKeyMatches,
  startSession,
} from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/settings";
import { sendEmail, testEmail } from "@/lib/email";
import { syncAllBilling } from "@/lib/billing";
import { loadPosting } from "@/lib/posting";
import {
  checkLoginAllowed,
  clearLoginFailures,
  clientIp,
  recordLoginFailure,
  sweepThrottles,
} from "@/lib/login-throttle";
import { listAudit, recordAudit } from "@/lib/data/audit";
import { recordSystemEvent, sweepSystemEvents } from "@/lib/data/system";

/**
 * Every action resolves the caller from their session cookie. No action ever
 * accepts a userId from the client, so a crafted request cannot act as somebody
 * else no matter what it sends.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function setupAction(_prev: { error?: string } | undefined, formData: FormData) {
  if (!(await instanceNeedsSetup())) return { error: "This instance has already been set up." };

  const setupKey = String(formData.get("setupKey") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!setupKeyMatches(setupKey)) return { error: "That setup key doesn't match APP_PASSWORD." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };

  const user = await claimInstance({ email, name, password });
  await startSession(user.id);
  redirect("/");
}

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = clientIp(await headers());

  // Checked before the password is even looked at, so a locked account costs an
  // attacker a database read rather than a scrypt verification.
  const verdict = await checkLoginAllowed(email, ip);
  if (!verdict.allowed) {
    const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
    return {
      error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const user = await authenticate(email, password);
  if (!user) {
    await recordLoginFailure(email, ip);
    // The same sentence whether the address exists, the password is wrong or
    // the account is suspended. Three different messages is a tool for
    // discovering which addresses are real.
    return { error: "That email and password don't match." };
  }

  await clearLoginFailures(email, ip);
  await startSession(user.id);
  // Cheap, and it keeps the tables from growing on a busy instance. Deliberately
  // not awaited-and-blocking on failure: a failed sweep must not fail a login.
  void sweepThrottles().catch(() => {});
  void sweepSystemEvents().catch(() => {});
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function acceptInviteAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };

  try {
    const user = await users.acceptInvite({ token, name, password });
    await startSession(user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not accept that invitation." };
  }
  redirect("/");
}

export async function changeOwnPasswordAction(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
) {
  const user = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  if (next.length < 10) return { error: "Use a password of at least 10 characters." };
  if (!(await authenticate(user.email, current))) return { error: "Your current password is wrong." };

  await users.changePassword(user.id, next);
  await startSession(user.id); // keep this device signed in
  return { ok: true };
}

export async function updateOwnAccountAction(patch: { name?: string; email?: string }) {
  const user = await requireUser();
  await users.updateOwnAccount(user.id, patch);
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Sharing a resume
// ---------------------------------------------------------------------------

async function currentBaseUrl() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function publishResumeAction(id: string) {
  const user = await requireUser();
  const resume = await resumes.publishResume(user.id, id);
  revalidatePath(`/resumes/${id}`);
  revalidatePath("/resumes");
  return { url: `${await currentBaseUrl()}/r/${resume.slug}` };
}

export async function unpublishResumeAction(id: string) {
  const user = await requireUser();
  await resumes.unpublishResume(user.id, id);
  revalidatePath(`/resumes/${id}`);
  revalidatePath("/resumes");
}

// ---------------------------------------------------------------------------
// MCP connections
// ---------------------------------------------------------------------------

export async function createConnectionAction(input: { name?: string; client?: string }) {
  const user = await requireUser();
  const connection = await connections.createConnection(user.id, input);
  revalidatePath("/settings");
  return { id: connection.id, token: connection.token };
}

export async function renameConnectionAction(id: string, name: string) {
  const user = await requireUser();
  await connections.renameConnection(user.id, id, name);
  revalidatePath("/settings");
}

export async function rotateConnectionAction(id: string) {
  const user = await requireUser();
  const token = await connections.rotateConnection(user.id, id);
  revalidatePath("/settings");
  return token;
}

export async function deleteConnectionAction(id: string) {
  const user = await requireUser();
  await connections.deleteConnection(user.id, id);
  revalidatePath("/settings");
}

/**
 * Calls our own MCP endpoint the way a client would, over real HTTP, and
 * reports what came back. Proves the whole path — routing, host headers, token
 * lookup — rather than just asserting the token exists in the database.
 */
export async function testConnectionAction(id: string) {
  const user = await requireUser();
  const all = await connections.listConnections(user.id);
  const connection = all.find((item) => item.id === id);
  if (!connection) return { ok: false as const, error: "No connection with that id." };

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  try {
    const response = await fetch(`${proto}://${host}/api/mcp/${connection.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "user-agent": "hired-selftest" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false as const, error: `Server answered ${response.status}.` };
    }
    const payload = (await response.json()) as { result?: { tools?: unknown[] } };
    const toolCount = payload.result?.tools?.length ?? 0;
    if (!toolCount) return { ok: false as const, error: "Connected, but no tools came back." };
    return { ok: true as const, toolCount };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not reach the endpoint.",
    };
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function inviteUserAction(input: { email: string; role: UserRole }) {
  const actor = await requireAdmin();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  try {
    const result = await users.createInvite({
      actor,
      email: input.email,
      role: input.role,
      baseUrl: `${proto}://${host}`,
    });
    revalidatePath("/settings/admin");
    return {
      ok: true as const,
      acceptUrl: result.acceptUrl,
      emailSent: result.emailSent,
      emailError: result.emailError,
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not invite." };
  }
}

export async function revokeInviteAction(id: string) {
  const actor = await requireAdmin();
  await users.revokeInvite(actor, id);
  revalidatePath("/settings/admin");
}

/**
 * Invite someone off the waitlist. Same shape as inviteUserAction because it
 * is the same job with the address already chosen — the request row supplies
 * the email, so this can't be used to invite an arbitrary person.
 */
export async function inviteFromWaitlistAction(input: { id: string; role: UserRole }) {
  const actor = await requireAdmin();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  try {
    const result = await waitlist.inviteFromWaitlist({
      actor,
      id: input.id,
      role: input.role,
      baseUrl: `${proto}://${host}`,
    });
    revalidatePath("/settings/admin");
    return {
      ok: true as const,
      acceptUrl: result.acceptUrl,
      emailSent: result.emailSent,
      emailError: result.emailError,
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not invite." };
  }
}

export async function removeWaitlistSignupAction(id: string) {
  await requireAdmin();
  await waitlist.removeWaitlistSignup(id);
  revalidatePath("/settings/admin");
}

export async function setUserRoleAction(userId: string, role: UserRole) {
  const actor = await requireAdmin();
  try {
    await users.setUserRole(actor, userId, role);
    revalidatePath("/settings/admin");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not update." };
  }
}

export async function setUserActiveAction(userId: string, isActive: boolean) {
  const actor = await requireAdmin();
  try {
    await users.setUserActive(actor, userId, isActive);
    revalidatePath("/settings/admin");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not update." };
  }
}

/**
 * Reset a member's password to a generated one and hand it back once.
 *
 * The password is returned to the admin who asked rather than emailed, because
 * on a self-hosted instance email may not be configured at all — and an admin
 * reading it off the screen to a customer they are already on a call with is
 * the actual support flow.
 */
export async function adminResetPasswordAction(userId: string) {
  const actor = await requireAdmin();
  try {
    const result = await users.adminResetPassword(actor, userId);
    revalidatePath("/settings/admin");
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not reset." };
  }
}

export async function listAuditAction(limit = 100) {
  await requireAdmin();
  const rows = await listAudit({ limit });
  return rows.map((row) => ({
    id: row.id,
    actorEmail: row.actorEmail,
    action: row.action,
    targetEmail: row.targetEmail,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function deleteUserAction(userId: string) {
  const actor = await requireAdmin();
  try {
    await users.deleteUser(actor, userId);
    revalidatePath("/settings/admin");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not delete." };
  }
}

export async function saveEmailSettingsAction(patch: {
  instanceName?: string;
  resendApiKey?: string;
  resendFromEmail?: string;
  resendFromName?: string;
  publicUrl?: string;
  companyLogos?: boolean;
}) {
  const actor = await requireAdmin();
  // An empty API key field means "leave it alone", not "clear it".
  const clean = { ...patch };
  if (clean.resendApiKey !== undefined && clean.resendApiKey.trim() === "") delete clean.resendApiKey;
  await updateSettings(actor, clean);
  revalidatePath("/settings/admin");
  revalidatePath("/applications");
  return { ok: true as const };
}

/**
 * Fetch a posting URL and hand back what the page says, for the new-application
 * dialog to prefill. Deliberately creates nothing: in the UI a person reviews
 * the fields before tracking the job, so the parse and the create stay
 * separate. (The capture_job_posting tool is the one-move version for
 * assistants.)
 */
export async function parsePostingAction(url: string) {
  await requireUser();
  try {
    return { ok: true as const, parsed: await loadPosting(url) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not fetch that." };
  }
}

export async function saveBillingSettingsAction(patch: {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePaymentLink?: string;
}) {
  const actor = await requireAdmin();
  // Empty secret fields mean "leave it alone", not "clear it" — same rule as
  // the Resend key above.
  const clean = { ...patch };
  if (clean.stripeSecretKey !== undefined && clean.stripeSecretKey.trim() === "") delete clean.stripeSecretKey;
  if (clean.stripeWebhookSecret !== undefined && clean.stripeWebhookSecret.trim() === "") delete clean.stripeWebhookSecret;
  await updateSettings(actor, clean);
  revalidatePath("/settings/admin");
  return { ok: true as const };
}

export async function syncBillingAction(email?: string) {
  await requireAdmin();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  try {
    const results = await syncAllBilling(`${proto}://${host}`, email?.trim() || undefined);
    revalidatePath("/settings/admin");
    return { ok: true as const, results };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Sync failed." };
  }
}

export async function sendTestEmailAction(to?: string) {
  const actor = await requireAdmin();
  const settings = await getSettings();
  const result = await sendEmail({
    to: to?.trim() || actor.email,
    ...testEmail(settings.instanceName),
    settings,
  });
  return result.ok
    ? { ok: true as const, to: to?.trim() || actor.email }
    : { ok: false as const, error: result.error };
}

// ---------------------------------------------------------------------------
// Brain
// ---------------------------------------------------------------------------

export async function saveProfileAction(patch: brain.ProfilePatch) {
  const user = await requireUser();
  await brain.updateProfile(user.id, patch);
  revalidatePath("/brain");
  revalidatePath("/");
}

/**
 * Store a headshot, or clear it with an empty string.
 *
 * The browser has already cropped and downscaled by the time this runs, so what
 * arrives is a small data URI; the size and type rules still live in the data
 * layer, because `set_profile_photo` posts here through the same function and
 * neither door should be the lenient one.
 */
export async function setProfilePhotoAction(input: string) {
  const user = await requireUser();
  const result = await brain.setProfilePhoto(user.id, input);
  revalidatePath("/settings");
  revalidatePath("/brain");
  revalidatePath("/resumes");
  revalidatePath("/");
  return result;
}

export async function createRoleAction(input: brain.RoleInput) {
  const user = await requireUser();
  const role = await brain.createRole(user.id, input);
  revalidatePath("/brain");
  return role.id;
}

export async function updateRoleAction(id: string, patch: Partial<brain.RoleInput>) {
  const user = await requireUser();
  await brain.updateRole(user.id, id, patch);
  revalidatePath("/brain");
  revalidatePath(`/brain/${id}`);
}

export async function deleteRoleAction(id: string) {
  const user = await requireUser();
  await brain.deleteRole(user.id, id);
  revalidatePath("/brain");
  redirect("/brain");
}

export async function createHighlightAction(input: brain.HighlightInput) {
  const user = await requireUser();
  const highlight = await brain.createHighlight(user.id, input);
  revalidatePath("/brain");
  if (input.roleId) revalidatePath(`/brain/${input.roleId}`);
  return highlight;
}

export async function updateHighlightAction(
  id: string,
  patch: Partial<brain.HighlightInput> & { archived?: boolean },
) {
  const user = await requireUser();
  await brain.updateHighlight(user.id, id, patch);
  revalidatePath("/brain");
}

export async function deleteHighlightAction(id: string) {
  const user = await requireUser();
  await brain.deleteHighlight(user.id, id);
  revalidatePath("/brain");
}

export async function createNoteAction(input: { title: string; body?: string; tags?: string[] }) {
  const user = await requireUser();
  const note = await brain.createNote(user.id, input);
  revalidatePath("/brain");
  return note.id;
}

export async function updateNoteAction(
  id: string,
  patch: Partial<{ title: string; body: string; tags: string[]; pinned: boolean; kind: NoteKind }>,
) {
  const user = await requireUser();
  await brain.updateNote(user.id, id, patch);
  revalidatePath("/brain");
}

export async function deleteNoteAction(id: string) {
  const user = await requireUser();
  await brain.deleteNote(user.id, id);
  revalidatePath("/brain");
}

export async function createEducationAction(input: { school: string }) {
  const user = await requireUser();
  await brain.createEducation(user.id, input);
  revalidatePath("/brain");
}

export async function updateEducationAction(id: string, patch: Record<string, unknown>) {
  const user = await requireUser();
  await brain.updateEducation(user.id, id, patch);
  revalidatePath("/brain");
}

export async function deleteEducationAction(id: string) {
  const user = await requireUser();
  await brain.deleteEducation(user.id, id);
  revalidatePath("/brain");
}

export async function createProjectAction(input: { name: string }) {
  const user = await requireUser();
  await brain.createProject(user.id, input);
  revalidatePath("/brain");
}

export async function updateProjectAction(id: string, patch: Record<string, unknown>) {
  const user = await requireUser();
  await brain.updateProject(user.id, id, patch);
  revalidatePath("/brain");
}

export async function deleteProjectAction(id: string) {
  const user = await requireUser();
  await brain.deleteProject(user.id, id);
  revalidatePath("/brain");
}

export async function createSkillGroupAction(input: { name: string; skills?: string[] }) {
  const user = await requireUser();
  await brain.createSkillGroup(user.id, input);
  revalidatePath("/brain");
}

export async function updateSkillGroupAction(id: string, patch: { name?: string; skills?: string[] }) {
  const user = await requireUser();
  await brain.updateSkillGroup(user.id, id, patch);
  revalidatePath("/brain");
}

export async function deleteSkillGroupAction(id: string) {
  const user = await requireUser();
  await brain.deleteSkillGroup(user.id, id);
  revalidatePath("/brain");
}

export async function createCertificationAction(input: {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}) {
  const user = await requireUser();
  await brain.createCertification(user.id, input);
  revalidatePath("/brain");
}

export async function deleteCertificationAction(id: string) {
  const user = await requireUser();
  await brain.deleteCertification(user.id, id);
  revalidatePath("/brain");
}

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

export async function createResumeAction(input: resumes.ResumeMeta & { seedFromBrain?: boolean }) {
  const user = await requireUser();
  const resume = await resumes.createResume(user.id, input);
  revalidatePath("/resumes");
  return resume.id;
}

export async function updateResumeAction(id: string, patch: resumes.ResumeMeta & { data?: unknown }) {
  const user = await requireUser();
  await resumes.updateResume(user.id, id, patch);
  revalidatePath("/resumes");
  revalidatePath(`/resumes/${id}`);
}

export async function deleteResumeAction(id: string) {
  const user = await requireUser();
  await resumes.deleteResume(user.id, id);
  revalidatePath("/resumes");
  redirect("/resumes");
}

export async function duplicateResumeAction(id: string, name?: string) {
  const user = await requireUser();
  const copy = await resumes.duplicateResume(user.id, id, name);
  revalidatePath("/resumes");
  return copy.id;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function createApplicationAction(input: pipeline.ApplicationInput) {
  const user = await requireUser();
  const application = await pipeline.createApplication(user.id, input);
  revalidatePath("/applications");
  revalidatePath("/");
  return application.id;
}

export async function updateApplicationAction(
  id: string,
  patch: Partial<pipeline.ApplicationInput>,
) {
  const user = await requireUser();
  await pipeline.updateApplication(user.id, id, patch);
  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/");
}

export async function moveApplicationsStageAction(ids: string[], stage: Stage) {
  const user = await requireUser();
  const result = await pipeline.moveApplicationsStage(user.id, ids, stage);
  revalidatePath("/applications");
  revalidatePath("/");
  return result;
}

export async function moveStageAction(id: string, stage: Stage) {
  const user = await requireUser();
  await pipeline.moveApplicationStage(user.id, id, stage);
  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/");
}

export async function deleteApplicationAction(id: string) {
  const user = await requireUser();
  await pipeline.deleteApplication(user.id, id);
  revalidatePath("/applications");
  revalidatePath("/");
}

export async function addActivityAction(input: {
  applicationId?: string;
  contactId?: string;
  type?: ActivityType;
  body: string;
}) {
  const user = await requireUser();
  await pipeline.addActivity(user.id, input);
  if (input.applicationId) revalidatePath(`/applications/${input.applicationId}`);
  if (input.contactId) revalidatePath(`/crm/contacts/${input.contactId}`);
  revalidatePath("/");
}

export async function createTaskAction(input: {
  title: string;
  detail?: string;
  dueAt?: string | null;
  applicationId?: string | null;
}) {
  const user = await requireUser();
  await pipeline.createTask(user.id, input);
  revalidatePath("/");
  if (input.applicationId) revalidatePath(`/applications/${input.applicationId}`);
}

export async function toggleTaskAction(id: string, done: boolean) {
  const user = await requireUser();
  await pipeline.setTaskDone(user.id, id, done);
  revalidatePath("/");
  revalidatePath("/applications");
}

export async function deleteTaskAction(id: string) {
  const user = await requireUser();
  await pipeline.deleteTask(user.id, id);
  revalidatePath("/");
}

export async function createContactAction(input: {
  name: string;
  title?: string;
  email?: string;
  relationship?: string;
  company?: string;
  applicationId?: string | null;
}) {
  const user = await requireUser();
  await pipeline.createContact(user.id, input);
  if (input.applicationId) revalidatePath(`/applications/${input.applicationId}`);
  revalidatePath("/applications");
}

export async function deleteContactAction(id: string, applicationId?: string) {
  const user = await requireUser();
  await pipeline.deleteContact(user.id, id);
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function snoozeFollowUpAction(id: string, days: number) {
  const user = await requireUser();
  const next = new Date();
  next.setDate(next.getDate() + days);
  next.setHours(9, 0, 0, 0);
  await pipeline.updateApplication(user.id, id, { nextFollowUpAt: next });
  revalidatePath("/");
  revalidatePath("/applications");
}

export async function snoozeContactFollowUpAction(id: string, days: number) {
  const user = await requireUser();
  const next = new Date();
  next.setDate(next.getDate() + days);
  next.setHours(9, 0, 0, 0);
  await pipeline.updateContact(user.id, id, { nextFollowUpAt: next });
  revalidatePath("/");
  revalidatePath("/crm/contacts");
}

// ---------------------------------------------------------------------------
// CRM — companies and the people at them
// ---------------------------------------------------------------------------

export async function saveCompanyAction(
  id: string,
  patch: {
    name?: string;
    website?: string;
    industry?: string;
    size?: string;
    location?: string;
    notes?: string;
  },
) {
  const user = await requireUser();
  const company = await pipeline.updateCompany(user.id, id, patch);
  revalidatePath(`/crm/companies/${id}`);
  revalidatePath("/crm/companies");
  // The website is where the logo comes from, so the pipeline changes too.
  revalidatePath("/applications");
  return { name: company.name };
}

export async function createCompanyAction(input: { name: string; website?: string }) {
  const user = await requireUser();
  const company = await pipeline.createCompany(user.id, input);
  revalidatePath("/crm/companies");
  return { id: company.id };
}

export async function deleteCompanyAction(id: string) {
  const user = await requireUser();
  await pipeline.deleteCompany(user.id, id);
  revalidatePath("/crm/companies");
}

export async function saveContactAction(
  id: string,
  patch: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    relationship?: string;
    notes?: string;
    company?: string;
    /** "yyyy-mm-dd" from a date input; empty string clears the date. */
    nextFollowUpAt?: string;
  },
) {
  const user = await requireUser();
  const { nextFollowUpAt, ...rest } = patch;
  await pipeline.updateContact(user.id, id, {
    ...rest,
    ...(nextFollowUpAt !== undefined ? { nextFollowUpAt: nextFollowUpAt || null } : {}),
  });
  revalidatePath(`/crm/contacts/${id}`);
  revalidatePath("/crm/contacts");
}

export async function deleteCrmContactAction(id: string) {
  const user = await requireUser();
  await pipeline.deleteContact(user.id, id);
  revalidatePath("/crm/contacts");
  revalidatePath("/crm/companies");
}

/**
 * The application behind a card, for the side panel.
 *
 * The panel opens over the board rather than navigating, so it has to fetch
 * what the full page would have been given at render time. Same data function,
 * same ownership check — the id is all that crosses from the client.
 */
export async function getApplicationForPanelAction(id: string) {
  const user = await requireUser();
  const [application, resumeList] = await Promise.all([
    pipeline.getApplication(user.id, id),
    resumes.listResumes(user.id),
  ]);
  if (!application) throw new Error("That application is gone.");
  return {
    application: {
      id: application.id,
      company: application.company.name,
      companyId: application.companyId,
      roleTitle: application.roleTitle,
      stage: application.stage,
      jobUrl: application.jobUrl,
      jobDescription: application.jobDescription,
      location: application.location,
      workMode: application.workMode,
      salaryRange: application.salaryRange,
      source: application.source,
      excitement: application.excitement,
      fit: application.fit,
      notes: application.notes,
      appliedAt: application.appliedAt?.toISOString() ?? null,
      nextFollowUpAt: application.nextFollowUpAt?.toISOString() ?? null,
      resumeId: application.resumeId,
    },
    activities: application.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      body: activity.body,
      occurredAt: activity.occurredAt.toISOString(),
    })),
    contacts: application.contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      title: contact.title,
      email: contact.email,
      linkedin: contact.linkedin,
      relationship: contact.relationship,
    })),
    tasks: application.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      done: task.done,
      dueAt: task.dueAt?.toISOString() ?? null,
    })),
    resumes: resumeList.map((resume) => ({ id: resume.id, name: resume.name })),
  };
}

// --- sharing the pipeline read-only -----------------------------------------

export async function sharePipelineAction(includeClosed?: boolean) {
  const user = await requireUser();
  const share = await pipelineShare.sharePipeline(user.id, { includeClosed });
  revalidatePath("/applications");
  return { slug: share.slug, includeClosed: share.includeClosed, url: `${await currentBaseUrl()}/p/${share.slug}` };
}

export async function unsharePipelineAction() {
  const user = await requireUser();
  await pipelineShare.unsharePipeline(user.id);
  revalidatePath("/applications");
}

// --- saved pipeline views ---------------------------------------------------

export async function saveViewAction(name: string, query: string) {
  const user = await requireUser();
  const view = await views.saveView(user.id, name, query);
  revalidatePath("/applications");
  return view;
}

export async function deleteSavedViewAction(id: string) {
  const user = await requireUser();
  await views.deleteSavedView(user.id, id);
  revalidatePath("/applications");
}

// --- the audit log ----------------------------------------------------------

/**
 * A page of the audit log, filtered.
 *
 * The Log tab pages through the server rather than filtering rows already in
 * the browser, because the log outlives everything else on an instance: cutting
 * a page and then filtering it shows you the wrong hundred rows.
 */
export async function loadAuditAction(input: {
  group?: string;
  search?: string;
  offset?: number;
  limit?: number;
}) {
  await requireAdmin();
  const limit = Math.min(input.limit ?? 100, 200);
  const rows = await listAudit({
    group: input.group,
    search: input.search,
    offset: input.offset ?? 0,
    limit,
  });
  return {
    rows: rows.map((row) => ({
      id: row.id,
      actorEmail: row.actorEmail,
      action: row.action,
      targetEmail: row.targetEmail,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    })),
    // Fewer than asked for means this was the last page. One boolean beats a
    // count query the tab would run on every keystroke.
    more: rows.length === limit,
  };
}

// --- errors -----------------------------------------------------------------

/**
 * Called by the error boundary when a screen throws.
 *
 * Next logs the real error to stdout and hands the browser only a `digest`, so
 * without this an admin has no way to see that anything happened. Requires a
 * session, so it is not an open write endpoint, and takes nothing from the
 * client but the digest and the path — never the message, which the browser
 * cannot be trusted to have not made up.
 */
export async function reportRenderErrorAction(input: { digest?: string; path?: string }) {
  const user = await requireUser();
  await recordSystemEvent({
    source: "app",
    message: `A screen failed to render${input.path ? `: ${input.path}` : "."}`,
    detail: input.digest ? `digest ${input.digest}` : "",
    userEmail: user.email,
  });
}
