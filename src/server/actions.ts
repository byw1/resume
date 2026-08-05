"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActivityType, Stage } from "@prisma/client";
import * as brain from "@/lib/data/brain";
import * as resumes from "@/lib/data/resumes";
import * as pipeline from "@/lib/data/pipeline";
import { checkPassword, createSession, destroySession, rotateMcpToken } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return { error: "That password doesn't match." };
  }
  await createSession();
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function rotateMcpTokenAction() {
  const token = await rotateMcpToken();
  revalidatePath("/settings");
  return token;
}

// ---------------------------------------------------------------------------
// Brain
// ---------------------------------------------------------------------------

export async function saveProfileAction(patch: brain.ProfilePatch) {
  await brain.updateProfile(patch);
  revalidatePath("/brain");
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function createRoleAction(input: brain.RoleInput) {
  const role = await brain.createRole(input);
  revalidatePath("/brain");
  return role.id;
}

export async function updateRoleAction(id: string, patch: Partial<brain.RoleInput>) {
  await brain.updateRole(id, patch);
  revalidatePath("/brain");
  revalidatePath(`/brain/${id}`);
}

export async function deleteRoleAction(id: string) {
  await brain.deleteRole(id);
  revalidatePath("/brain");
  redirect("/brain");
}

export async function createHighlightAction(input: brain.HighlightInput) {
  const highlight = await brain.createHighlight(input);
  revalidatePath("/brain");
  if (input.roleId) revalidatePath(`/brain/${input.roleId}`);
  return highlight;
}

export async function updateHighlightAction(
  id: string,
  patch: Partial<brain.HighlightInput> & { archived?: boolean },
) {
  await brain.updateHighlight(id, patch);
  revalidatePath("/brain");
}

export async function deleteHighlightAction(id: string) {
  await brain.deleteHighlight(id);
  revalidatePath("/brain");
}

export async function createNoteAction(input: { title: string; body?: string; tags?: string[] }) {
  const note = await brain.createNote(input);
  revalidatePath("/brain");
  return note.id;
}

export async function updateNoteAction(
  id: string,
  patch: Partial<{ title: string; body: string; tags: string[]; pinned: boolean }>,
) {
  await brain.updateNote(id, patch);
  revalidatePath("/brain");
}

export async function deleteNoteAction(id: string) {
  await brain.deleteNote(id);
  revalidatePath("/brain");
}

export async function createEducationAction(input: Parameters<typeof brain.createEducation>[0]) {
  await brain.createEducation(input);
  revalidatePath("/brain");
}

export async function updateEducationAction(id: string, patch: Record<string, unknown>) {
  await brain.updateEducation(id, patch);
  revalidatePath("/brain");
}

export async function deleteEducationAction(id: string) {
  await brain.deleteEducation(id);
  revalidatePath("/brain");
}

export async function createProjectAction(input: Parameters<typeof brain.createProject>[0]) {
  await brain.createProject(input);
  revalidatePath("/brain");
}

export async function updateProjectAction(id: string, patch: Record<string, unknown>) {
  await brain.updateProject(id, patch);
  revalidatePath("/brain");
}

export async function deleteProjectAction(id: string) {
  await brain.deleteProject(id);
  revalidatePath("/brain");
}

export async function createSkillGroupAction(input: { name: string; skills?: string[] }) {
  await brain.createSkillGroup(input);
  revalidatePath("/brain");
}

export async function updateSkillGroupAction(id: string, patch: { name?: string; skills?: string[] }) {
  await brain.updateSkillGroup(id, patch);
  revalidatePath("/brain");
}

export async function deleteSkillGroupAction(id: string) {
  await brain.deleteSkillGroup(id);
  revalidatePath("/brain");
}

export async function createCertificationAction(input: {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}) {
  await brain.createCertification(input);
  revalidatePath("/brain");
}

export async function deleteCertificationAction(id: string) {
  await brain.deleteCertification(id);
  revalidatePath("/brain");
}

export async function searchBrainAction(query: string) {
  return brain.searchBrain(query, 20);
}

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

export async function createResumeAction(
  input: resumes.ResumeMeta & { seedFromBrain?: boolean },
) {
  const resume = await resumes.createResume(input);
  revalidatePath("/resumes");
  return resume.id;
}

export async function updateResumeAction(id: string, patch: resumes.ResumeMeta & { data?: unknown }) {
  await resumes.updateResume(id, patch);
  revalidatePath("/resumes");
  revalidatePath(`/resumes/${id}`);
}

export async function deleteResumeAction(id: string) {
  await resumes.deleteResume(id);
  revalidatePath("/resumes");
  redirect("/resumes");
}

export async function duplicateResumeAction(id: string, name?: string) {
  const copy = await resumes.duplicateResume(id, name);
  revalidatePath("/resumes");
  return copy.id;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function createApplicationAction(input: pipeline.ApplicationInput) {
  const application = await pipeline.createApplication(input);
  revalidatePath("/applications");
  revalidatePath("/");
  return application.id;
}

export async function updateApplicationAction(
  id: string,
  patch: Partial<pipeline.ApplicationInput>,
) {
  await pipeline.updateApplication(id, patch);
  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/");
}

export async function moveStageAction(id: string, stage: Stage) {
  await pipeline.moveApplicationStage(id, stage);
  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/");
}

export async function deleteApplicationAction(id: string) {
  await pipeline.deleteApplication(id);
  revalidatePath("/applications");
  revalidatePath("/");
}

export async function reorderApplicationsAction(ids: string[]) {
  await pipeline.reorderApplications(ids);
  revalidatePath("/applications");
}

export async function addActivityAction(input: {
  applicationId: string;
  type?: ActivityType;
  body: string;
}) {
  await pipeline.addActivity(input);
  revalidatePath(`/applications/${input.applicationId}`);
  revalidatePath("/");
}

export async function createTaskAction(input: {
  title: string;
  detail?: string;
  dueAt?: string | null;
  applicationId?: string | null;
}) {
  await pipeline.createTask(input);
  revalidatePath("/");
  if (input.applicationId) revalidatePath(`/applications/${input.applicationId}`);
}

export async function toggleTaskAction(id: string, done: boolean) {
  await pipeline.setTaskDone(id, done);
  revalidatePath("/");
  revalidatePath("/applications");
}

export async function deleteTaskAction(id: string) {
  await pipeline.deleteTask(id);
  revalidatePath("/");
}

export async function createContactAction(input: Parameters<typeof pipeline.createContact>[0]) {
  await pipeline.createContact(input);
  if (input.applicationId) revalidatePath(`/applications/${input.applicationId}`);
  revalidatePath("/applications");
}

export async function deleteContactAction(id: string, applicationId?: string) {
  await pipeline.deleteContact(id);
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
}

export async function snoozeFollowUpAction(id: string, days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  next.setHours(9, 0, 0, 0);
  await pipeline.updateApplication(id, { nextFollowUpAt: next });
  revalidatePath("/");
  revalidatePath("/applications");
}
