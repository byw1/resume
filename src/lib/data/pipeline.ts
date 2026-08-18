import { ActivityType, Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";

/** Like brain.ts: userId is the required first argument on every query. */

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

/**
 * A stage is a position on one path, not a category, so the hue rotates in one
 * direction as an application advances — steel, blue, violet, pink, then gold
 * at the offer. Turning one way is what keeps it a path: you can tell "further
 * along" from two chips without knowing which label is which.
 *
 * The three endings sit outside the rotation because they mean something other
 * than progress. Values are CSS variables so they follow the theme; a fixed
 * colour tuned for one mode goes muddy in the other.
 */
export const STAGE_TONE: Record<Stage, string> = {
  WISHLIST: "var(--stage-wishlist)",
  APPLIED: "var(--stage-applied)",
  SCREEN: "var(--stage-screen)",
  INTERVIEW: "var(--stage-interview)",
  FINAL: "var(--stage-final)",
  OFFER: "var(--stage-offer)",
  ACCEPTED: "var(--stage-accepted)",
  REJECTED: "var(--stage-rejected)",
  WITHDRAWN: "var(--stage-withdrawn)",
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

export async function listCompanies(userId: string) {
  return db.company.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { _count: { select: { applications: true } } },
  });
}

export async function upsertCompanyByName(
  userId: string,
  name: string,
  extra?: Partial<{ website: string; industry: string; location: string; notes: string }>,
) {
  const clean = name.trim();
  return db.company.upsert({
    where: { userId_name: { userId, name: clean } },
    create: { userId, name: clean, ...extra },
    update: extra ?? {},
  });
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export type ApplicationInput = {
  company: string;
  /** The company's own site. Drives the logo; nothing else depends on it. */
  companyWebsite?: string;
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

export async function listApplications(
  userId: string,
  options?: { stage?: Stage; includeClosed?: boolean; search?: string },
) {
  const where: Prisma.ApplicationWhereInput = { userId };
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

export async function getApplication(userId: string, id: string) {
  return db.application.findFirst({
    where: { id, userId },
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

/** A resume may only be attached if the same user owns it. */
async function assertOwnsResume(userId: string, resumeId: string) {
  const resume = await db.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new Error(`No resume with id ${resumeId}`);
}

export async function createApplication(userId: string, input: ApplicationInput) {
  const company = await upsertCompanyByName(
    userId,
    input.company,
    input.companyWebsite ? { website: input.companyWebsite } : undefined,
  );
  const stage = input.stage ?? "WISHLIST";
  const appliedAt = toDate(input.appliedAt) ?? (stage !== "WISHLIST" ? new Date() : null);
  if (input.resumeId) await assertOwnsResume(userId, input.resumeId);

  const application = await db.application.create({
    data: {
      userId,
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
      userId,
      applicationId: application.id,
      type: stage === "WISHLIST" ? "NOTE" : "APPLIED",
      body: stage === "WISHLIST" ? "Added to wishlist." : `Applied for ${input.roleTitle}.`,
    },
  });

  return application;
}

export async function updateApplication(
  userId: string,
  id: string,
  patch: Partial<ApplicationInput> & { sortOrder?: number },
) {
  const current = await db.application.findFirst({ where: { id, userId } });
  if (!current) throw new Error(`No application with id ${id}`);

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
    if (patch.resumeId) {
      await assertOwnsResume(userId, patch.resumeId);
      data.resume = { connect: { id: patch.resumeId } };
    } else {
      data.resume = { disconnect: true };
    }
  }
  // The website lives on the company, not the application. Resolved after the
  // company itself, so moving an application to a different employer and
  // setting a website in the same call writes it to the new one.
  let companyId = current.companyId;
  if (patch.company !== undefined) {
    const company = await upsertCompanyByName(userId, patch.company);
    companyId = company.id;
    data.company = { connect: { id: company.id } };
  }
  if (patch.companyWebsite !== undefined) {
    await db.company.updateMany({
      where: { id: companyId, userId },
      data: { website: patch.companyWebsite },
    });
  }
  if (patch.stage !== undefined) {
    await db.application.update({ where: { id }, data });
    return moveApplicationStage(userId, id, patch.stage);
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

export async function moveApplicationStage(
  userId: string,
  id: string,
  stage: Stage,
  note?: string,
) {
  const current = await db.application.findFirst({ where: { id, userId } });
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
        userId,
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

export async function deleteApplication(userId: string, id: string) {
  const { count } = await db.application.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No application with id ${id}`);
  return { id };
}

export async function reorderApplications(userId: string, ids: string[]) {
  await db.$transaction(
    ids.map((id, index) =>
      db.application.updateMany({ where: { id, userId }, data: { sortOrder: index } }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Activities, tasks, contacts
// ---------------------------------------------------------------------------

export async function addActivity(
  userId: string,
  input: {
    applicationId: string;
    type?: ActivityType;
    body: string;
    occurredAt?: Date | string;
  },
) {
  const application = await db.application.findFirst({
    where: { id: input.applicationId, userId },
  });
  if (!application) throw new Error(`No application with id ${input.applicationId}`);

  return db.activity.create({
    data: {
      userId,
      applicationId: input.applicationId,
      type: input.type ?? "NOTE",
      body: input.body,
      occurredAt: toDate(input.occurredAt) ?? new Date(),
    },
  });
}

export async function listActivities(userId: string, applicationId?: string, limit = 40) {
  return db.activity.findMany({
    where: { userId, ...(applicationId ? { applicationId } : {}) },
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { application: { include: { company: true } } },
  });
}

export async function createTask(
  userId: string,
  input: {
    title: string;
    detail?: string;
    dueAt?: Date | string | null;
    applicationId?: string | null;
  },
) {
  if (input.applicationId) {
    const application = await db.application.findFirst({
      where: { id: input.applicationId, userId },
    });
    if (!application) throw new Error(`No application with id ${input.applicationId}`);
  }
  return db.task.create({
    data: {
      userId,
      title: input.title,
      detail: input.detail ?? "",
      dueAt: toDate(input.dueAt) ?? null,
      applicationId: input.applicationId ?? null,
    },
  });
}

export async function listTasks(userId: string, options?: { done?: boolean; limit?: number }) {
  return db.task.findMany({
    where: { userId, ...(options?.done === undefined ? {} : { done: options.done }) },
    orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: options?.limit ?? 100,
    include: { application: { include: { company: true } } },
  });
}

export async function setTaskDone(userId: string, id: string, done: boolean) {
  const { count } = await db.task.updateMany({
    where: { id, userId },
    data: { done, doneAt: done ? new Date() : null },
  });
  if (count === 0) throw new Error(`No task with id ${id}`);
  return db.task.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteTask(userId: string, id: string) {
  const { count } = await db.task.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No task with id ${id}`);
  return { id };
}

export async function createContact(
  userId: string,
  input: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    relationship?: string;
    notes?: string;
    company?: string;
    applicationId?: string | null;
  },
) {
  if (input.applicationId) {
    const application = await db.application.findFirst({
      where: { id: input.applicationId, userId },
    });
    if (!application) throw new Error(`No application with id ${input.applicationId}`);
  }
  const companyId = input.company ? (await upsertCompanyByName(userId, input.company)).id : undefined;
  return db.contact.create({
    data: {
      userId,
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

export async function listContacts(userId: string, applicationId?: string) {
  return db.contact.findMany({
    where: { userId, ...(applicationId ? { applicationId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { company: true, application: { select: { id: true, roleTitle: true } } },
  });
}

export async function deleteContact(userId: string, id: string) {
  const { count } = await db.contact.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No contact with id ${id}`);
  return { id };
}

// ---------------------------------------------------------------------------
// Dashboard reads
// ---------------------------------------------------------------------------

/** Applications whose follow-up date has arrived (or passed). */
export async function followUpsDue(userId: string, withinDays = 0) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  cutoff.setHours(23, 59, 59, 999);
  return db.application.findMany({
    where: {
      userId,
      nextFollowUpAt: { lte: cutoff },
      stage: { notIn: TERMINAL_STAGES },
    },
    orderBy: { nextFollowUpAt: "asc" },
    include: { company: true },
  });
}

/**
 * Everything with a date on it, in one window.
 *
 * Three tables carry dates — an application's next follow-up, a task's due
 * date, and an activity's occurredAt — and a person thinking about "next week"
 * is thinking about all three at once. Merging them here rather than in the
 * calendar component is what lets the same answer come back over MCP.
 */
export type ScheduleKind = "FOLLOW_UP" | "TASK" | "ACTIVITY";

export type ScheduleEntry = {
  kind: ScheduleKind;
  id: string;
  date: Date;
  title: string;
  detail: string;
  company: string | null;
  applicationId: string | null;
  stage: Stage | null;
  done: boolean | null;
  activityType: ActivityType | null;
};

export async function listSchedule(
  userId: string,
  from: Date | string,
  to: Date | string,
): Promise<ScheduleEntry[]> {
  const start = toDate(from) ?? new Date();
  const end = toDate(to) ?? new Date();
  const range = { gte: start, lte: end };

  const [followUps, tasks, activities] = await Promise.all([
    db.application.findMany({
      where: { userId, nextFollowUpAt: range, stage: { notIn: TERMINAL_STAGES } },
      include: { company: true },
    }),
    db.task.findMany({
      where: { userId, dueAt: range },
      include: { application: { include: { company: true } } },
    }),
    db.activity.findMany({
      where: { userId, occurredAt: range },
      include: { application: { include: { company: true } } },
    }),
  ]);

  const entries: ScheduleEntry[] = [
    ...followUps.map((application) => ({
      kind: "FOLLOW_UP" as const,
      id: application.id,
      date: application.nextFollowUpAt!,
      title: `Follow up with ${application.company.name}`,
      detail: application.roleTitle,
      company: application.company.name,
      applicationId: application.id,
      stage: application.stage,
      done: null,
      activityType: null,
    })),
    ...tasks.map((task) => ({
      kind: "TASK" as const,
      id: task.id,
      date: task.dueAt!,
      title: task.title,
      detail: task.detail,
      company: task.application?.company.name ?? null,
      applicationId: task.applicationId,
      stage: task.application?.stage ?? null,
      done: task.done,
      activityType: null,
    })),
    ...activities.map((activity) => ({
      kind: "ACTIVITY" as const,
      id: activity.id,
      date: activity.occurredAt,
      title: `${ACTIVITY_LABEL[activity.type]} · ${activity.application.company.name}`,
      detail: activity.body,
      company: activity.application.company.name,
      applicationId: activity.applicationId,
      stage: activity.application.stage,
      done: null,
      activityType: activity.type,
    })),
  ];

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function pipelineStats(userId: string) {
  const [byStage, total, active, thisWeek, interviews, offers, tasksOpen, followUps] =
    await Promise.all([
      db.application.groupBy({ by: ["stage"], where: { userId }, _count: { _all: true } }),
      db.application.count({ where: { userId } }),
      db.application.count({ where: { userId, stage: { notIn: TERMINAL_STAGES } } }),
      db.application.count({ where: { userId, appliedAt: { gte: startOfWeek() } } }),
      db.application.count({ where: { userId, stage: { in: ["SCREEN", "INTERVIEW", "FINAL"] } } }),
      db.application.count({ where: { userId, stage: { in: ["OFFER", "ACCEPTED"] } } }),
      db.task.count({ where: { userId, done: false } }),
      followUpsDue(userId, 0),
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
