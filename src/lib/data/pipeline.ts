import { ActivityType, Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";

export const STAGES: Stage[] = [
  "WISHLIST",
  "APPLIED",
  "SCREEN",
  "INTERVIEW",
  "FINAL",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
];

/** Stages shown as columns on the board. Terminal states get their own view. */
export const BOARD_STAGES: Stage[] = [
  "WISHLIST",
  "APPLIED",
  "SCREEN",
  "INTERVIEW",
  "FINAL",
  "OFFER",
];

export const STAGE_LABEL: Record<Stage, string> = {
  WISHLIST: "Wishlist",
  APPLIED: "Applied",
  SCREEN: "Screening",
  INTERVIEW: "Interviewing",
  FINAL: "Final round",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const STAGE_TONE: Record<Stage, string> = {
  WISHLIST: "oklch(0.62 0.02 280)",
  APPLIED: "oklch(0.62 0.16 250)",
  SCREEN: "oklch(0.66 0.15 215)",
  INTERVIEW: "oklch(0.68 0.16 175)",
  FINAL: "oklch(0.72 0.16 120)",
  OFFER: "oklch(0.74 0.17 85)",
  ACCEPTED: "oklch(0.68 0.18 150)",
  REJECTED: "oklch(0.62 0.17 25)",
  WITHDRAWN: "oklch(0.58 0.02 280)",
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  NOTE: "Note",
  STAGE_CHANGE: "Stage change",
  EMAIL_SENT: "Email sent",
  EMAIL_RECEIVED: "Email received",
  CALL: "Call",
  INTERVIEW: "Interview",
  FOLLOW_UP: "Follow-up",
  APPLIED: "Applied",
  OFFER: "Offer",
  REJECTION: "Rejection",
  REFERRAL: "Referral",
};

export const TERMINAL_STAGES: Stage[] = ["ACCEPTED", "REJECTED", "WITHDRAWN"];

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export async function listCompanies() {
  return db.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { applications: true } } },
  });
}

export async function upsertCompanyByName(name: string, extra?: Partial<{ website: string; industry: string; location: string; notes: string }>) {
  const clean = name.trim();
  return db.company.upsert({
    where: { name: clean },
    create: { name: clean, ...extra },
    update: extra ?? {},
  });
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export type ApplicationInput = {
  company: string;
  roleTitle: string;
  stage?: Stage;
  jobUrl?: string;
  jobDescription?: string;
  location?: string;
  workMode?: string;
  salaryRange?: string;
  source?: string;
  excitement?: number;
  fit?: number;
  notes?: string;
  appliedAt?: Date | string | null;
  nextFollowUpAt?: Date | string | null;
  resumeId?: string | null;
};

const applicationInclude = {
  company: true,
  resume: { select: { id: true, name: true } },
  _count: { select: { activities: true, tasks: true, contacts: true } },
} satisfies Prisma.ApplicationInclude;

export async function listApplications(options?: { stage?: Stage; includeClosed?: boolean; search?: string }) {
  const where: Prisma.ApplicationWhereInput = {};
  if (options?.stage) where.stage = options.stage;
  else if (!options?.includeClosed) where.stage = { notIn: TERMINAL_STAGES };
  if (options?.search) {
    where.OR = [
      { roleTitle: { contains: options.search, mode: "insensitive" } },
      { company: { name: { contains: options.search, mode: "insensitive" } } },
      { notes: { contains: options.search, mode: "insensitive" } },
    ];
  }
  return db.application.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    include: applicationInclude,
  });
}

export async function getApplication(id: string) {
  return db.application.findUnique({
    where: { id },
    include: {
      company: true,
      resume: { select: { id: true, name: true } },
      activities: { orderBy: { occurredAt: "desc" } },
      contacts: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }] },
    },
  });
}

function toDate(value: Date | string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createApplication(input: ApplicationInput) {
  const company = await upsertCompanyByName(input.company);
  const stage = input.stage ?? "WISHLIST";
  const appliedAt = toDate(input.appliedAt) ?? (stage !== "WISHLIST" ? new Date() : null);

  const application = await db.application.create({
    data: {
      companyId: company.id,
      roleTitle: input.roleTitle,
      stage,
      jobUrl: input.jobUrl ?? "",
      jobDescription: input.jobDescription ?? "",
      location: input.location ?? "",
      workMode: input.workMode ?? "",
      salaryRange: input.salaryRange ?? "",
      source: input.source ?? "",
      excitement: clamp(input.excitement ?? 3, 1, 5),
      fit: clamp(input.fit ?? 3, 1, 5),
      notes: input.notes ?? "",
      appliedAt,
      nextFollowUpAt: toDate(input.nextFollowUpAt) ?? defaultFollowUp(stage),
      resumeId: input.resumeId ?? null,
    },
    include: applicationInclude,
  });

  await db.activity.create({
    data: {
      applicationId: application.id,
      type: stage === "WISHLIST" ? "NOTE" : "APPLIED",
      body: stage === "WISHLIST" ? "Added to wishlist." : `Applied for ${input.roleTitle}.`,
    },
  });

  return application;
}

export async function updateApplication(id: string, patch: Partial<ApplicationInput> & { sortOrder?: number }) {
  const data: Prisma.ApplicationUpdateInput = {};
  if (patch.roleTitle !== undefined) data.roleTitle = patch.roleTitle;
  if (patch.jobUrl !== undefined) data.jobUrl = patch.jobUrl;
  if (patch.jobDescription !== undefined) data.jobDescription = patch.jobDescription;
  if (patch.location !== undefined) data.location = patch.location;
  if (patch.workMode !== undefined) data.workMode = patch.workMode;
  if (patch.salaryRange !== undefined) data.salaryRange = patch.salaryRange;
  if (patch.source !== undefined) data.source = patch.source;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.excitement !== undefined) data.excitement = clamp(patch.excitement, 1, 5);
  if (patch.fit !== undefined) data.fit = clamp(patch.fit, 1, 5);
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.appliedAt !== undefined) data.appliedAt = toDate(patch.appliedAt);
  if (patch.nextFollowUpAt !== undefined) data.nextFollowUpAt = toDate(patch.nextFollowUpAt);
  if (patch.resumeId !== undefined) {
    data.resume = patch.resumeId ? { connect: { id: patch.resumeId } } : { disconnect: true };
  }
  if (patch.company !== undefined) {
    const company = await upsertCompanyByName(patch.company);
    data.company = { connect: { id: company.id } };
  }
  if (patch.stage !== undefined) {
    return moveApplicationStage(id, patch.stage);
  }
  return db.application.update({ where: { id }, data, include: applicationInclude });
}

/** Days after entering a stage that a nudge should fire. */
const FOLLOW_UP_DAYS: Partial<Record<Stage, number>> = {
  APPLIED: 7,
  SCREEN: 4,
  INTERVIEW: 4,
  FINAL: 3,
  OFFER: 2,
};

function defaultFollowUp(stage: Stage): Date | null {
  const days = FOLLOW_UP_DAYS[stage];
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

export async function moveApplicationStage(id: string, stage: Stage, note?: string) {
  const current = await db.application.findUnique({ where: { id } });
  if (!current) throw new Error(`No application with id ${id}`);

  const data: Prisma.ApplicationUpdateInput = { stage };
  if (stage !== "WISHLIST" && !current.appliedAt) data.appliedAt = new Date();
  if (TERMINAL_STAGES.includes(stage)) {
    data.closedAt = new Date();
    data.nextFollowUpAt = null;
  } else {
    data.closedAt = null;
    data.nextFollowUpAt = defaultFollowUp(stage);
  }

  const updated = await db.application.update({ where: { id }, data, include: applicationInclude });

  if (current.stage !== stage) {
    await db.activity.create({
      data: {
        applicationId: id,
        type: stageActivityType(stage),
        body: note ?? `${STAGE_LABEL[current.stage]} → ${STAGE_LABEL[stage]}`,
      },
    });
  }
  return updated;
}

function stageActivityType(stage: Stage): ActivityType {
  if (stage === "APPLIED") return "APPLIED";
  if (stage === "OFFER" || stage === "ACCEPTED") return "OFFER";
  if (stage === "REJECTED") return "REJECTION";
  return "STAGE_CHANGE";
}

export async function deleteApplication(id: string) {
  return db.application.delete({ where: { id } });
}

export async function reorderApplications(ids: string[]) {
  await db.$transaction(
    ids.map((id, index) => db.application.update({ where: { id }, data: { sortOrder: index } })),
  );
}

// ---------------------------------------------------------------------------
// Activities, tasks, contacts
// ---------------------------------------------------------------------------

export async function addActivity(input: {
  applicationId: string;
  type?: ActivityType;
  body: string;
  occurredAt?: Date | string;
}) {
  return db.activity.create({
    data: {
      applicationId: input.applicationId,
      type: input.type ?? "NOTE",
      body: input.body,
      occurredAt: toDate(input.occurredAt) ?? new Date(),
    },
  });
}

export async function listActivities(applicationId?: string, limit = 40) {
  return db.activity.findMany({
    where: applicationId ? { applicationId } : {},
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { application: { include: { company: true } } },
  });
}

export async function createTask(input: {
  title: string;
  detail?: string;
  dueAt?: Date | string | null;
  applicationId?: string | null;
}) {
  return db.task.create({
    data: {
      title: input.title,
      detail: input.detail ?? "",
      dueAt: toDate(input.dueAt) ?? null,
      applicationId: input.applicationId ?? null,
    },
  });
}

export async function listTasks(options?: { done?: boolean; limit?: number }) {
  return db.task.findMany({
    where: options?.done === undefined ? {} : { done: options.done },
    orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: options?.limit ?? 100,
    include: { application: { include: { company: true } } },
  });
}

export async function setTaskDone(id: string, done: boolean) {
  return db.task.update({
    where: { id },
    data: { done, doneAt: done ? new Date() : null },
  });
}

export async function deleteTask(id: string) {
  return db.task.delete({ where: { id } });
}

export async function createContact(input: {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  relationship?: string;
  notes?: string;
  company?: string;
  applicationId?: string | null;
}) {
  const companyId = input.company ? (await upsertCompanyByName(input.company)).id : undefined;
  return db.contact.create({
    data: {
      name: input.name,
      title: input.title ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      linkedin: input.linkedin ?? "",
      relationship: input.relationship ?? "",
      notes: input.notes ?? "",
      companyId,
      applicationId: input.applicationId ?? null,
    },
  });
}

export async function listContacts(applicationId?: string) {
  return db.contact.findMany({
    where: applicationId ? { applicationId } : {},
    orderBy: { createdAt: "desc" },
    include: { company: true, application: { select: { id: true, roleTitle: true } } },
  });
}

export async function deleteContact(id: string) {
  return db.contact.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Dashboard reads
// ---------------------------------------------------------------------------

/** Applications whose follow-up date has arrived (or passed). */
export async function followUpsDue(withinDays = 0) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  cutoff.setHours(23, 59, 59, 999);
  return db.application.findMany({
    where: {
      nextFollowUpAt: { lte: cutoff },
      stage: { notIn: TERMINAL_STAGES },
    },
    orderBy: { nextFollowUpAt: "asc" },
    include: { company: true },
  });
}

export async function pipelineStats() {
  const [byStage, total, active, thisWeek, interviews, offers, tasksOpen, followUps] =
    await Promise.all([
      db.application.groupBy({ by: ["stage"], _count: { _all: true } }),
      db.application.count(),
      db.application.count({ where: { stage: { notIn: TERMINAL_STAGES } } }),
      db.application.count({ where: { appliedAt: { gte: startOfWeek() } } }),
      db.application.count({ where: { stage: { in: ["SCREEN", "INTERVIEW", "FINAL"] } } }),
      db.application.count({ where: { stage: { in: ["OFFER", "ACCEPTED"] } } }),
      db.task.count({ where: { done: false } }),
      followUpsDue(0),
    ]);

  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const row of byStage) counts[row.stage] = row._count._all;

  const applied = total - counts.WISHLIST;
  const responded = counts.SCREEN + counts.INTERVIEW + counts.FINAL + counts.OFFER + counts.ACCEPTED;

  return {
    counts,
    total,
    active,
    thisWeek,
    interviews,
    offers,
    tasksOpen,
    followUpsDue: followUps.length,
    responseRate: applied > 0 ? Math.round((responded / applied) * 100) : 0,
  };
}

function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday-first
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export { Stage, ActivityType };
