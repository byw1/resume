import { ActivityType, Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { pick } from "@/lib/data/patch";
import { loadPosting, type ParsedPosting } from "@/lib/posting";

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
  "GHOSTED",
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
  GHOSTED: "Ghosted",
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
  GHOSTED: "var(--stage-ghosted)",
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

export const TERMINAL_STAGES: Stage[] = ["ACCEPTED", "REJECTED", "WITHDRAWN", "GHOSTED"];

/**
 * The endings where someone else decided, or nobody did. Used by the funnel:
 * a rejection is a decision against you and a ghosting is the absence of one,
 * and telling them apart is the difference between "my resume is not landing"
 * and "I am not following up".
 */
export const NO_ANSWER_STAGES: Stage[] = ["GHOSTED"];

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

const companyCounts = { _count: { select: { applications: true, contacts: true } } } as const;

export type CompanyInput = {
  name: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
  notes?: string;
};

/** Columns a caller may write. Anything else in the patch is dropped. */
const COMPANY_COLUMNS = ["name", "website", "industry", "size", "location", "notes"] as const;
const CONTACT_COLUMNS = [
  "name",
  "title",
  "email",
  "phone",
  "linkedin",
  "relationship",
  "notes",
] as const;

export async function listCompanies(userId: string, options?: { search?: string }) {
  const where: Prisma.CompanyWhereInput = { userId };
  if (options?.search) {
    where.OR = [
      { name: { contains: options.search, mode: "insensitive" } },
      { industry: { contains: options.search, mode: "insensitive" } },
      { location: { contains: options.search, mode: "insensitive" } },
      { notes: { contains: options.search, mode: "insensitive" } },
    ];
  }
  return db.company.findMany({ where, orderBy: { name: "asc" }, include: companyCounts });
}

export async function getCompany(userId: string, id: string) {
  return db.company.findFirst({
    where: { id, userId },
    include: {
      applications: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          roleTitle: true,
          stage: true,
          location: true,
          salaryRange: true,
          nextFollowUpAt: true,
          updatedAt: true,
        },
      },
      contacts: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function createCompany(userId: string, input: CompanyInput) {
  const name = input.name.trim();
  if (!name) throw new Error("A company needs a name");
  const existing = await db.company.findFirst({ where: { userId, name } });
  if (existing) throw new Error(`You already have a company called "${name}"`);
  return db.company.create({
    data: { userId, ...pick({ ...input, name }, COMPANY_COLUMNS) },
    include: companyCounts,
  });
}

export async function updateCompany(userId: string, id: string, patch: Partial<CompanyInput>) {
  const data = pick(patch, COMPANY_COLUMNS);
  if (data.name !== undefined) {
    data.name = data.name.trim();
    if (!data.name) throw new Error("A company needs a name");
    const clash = await db.company.findFirst({
      where: { userId, name: data.name, id: { not: id } },
    });
    if (clash) throw new Error(`You already have a company called "${data.name}"`);
  }
  const { count } = await db.company.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No company with id ${id}`);
  return db.company.findFirstOrThrow({ where: { id, userId }, include: companyCounts });
}

/**
 * Deleting a company leaves its applications and contacts standing — the
 * schema nulls the link rather than cascading. Losing an application because
 * you tidied up a company record would be a genuinely bad afternoon.
 */
export async function deleteCompany(userId: string, id: string) {
  const company = await db.company.findFirst({
    where: { id, userId },
    include: companyCounts,
  });
  if (!company) throw new Error(`No company with id ${id}`);
  if (company._count.applications > 0) {
    throw new Error(
      `"${company.name}" still has ${company._count.applications} application(s). Move or delete those first.`,
    );
  }
  await db.company.delete({ where: { id } });
  return { id, name: company.name };
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
  // The moment this application last changed stage, for "how long has it been
  // sitting there". updatedAt is not that date — editing a note bumps it — and
  // "waiting 40 days" is only worth printing if it is true.
  activities: {
    where: { toStage: { not: null } },
    orderBy: { occurredAt: "desc" as const },
    take: 1,
    select: { occurredAt: true },
  },
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
  const rows = await db.application.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    include: applicationInclude,
  });
  // The take-1 transition row is plumbing for the date below, not something a
  // caller — or an assistant reading a tool result — should have to interpret.
  const now = Date.now();
  return rows.map(({ activities, ...application }) => {
    const since = activities[0]?.occurredAt ?? application.createdAt;
    return {
      ...application,
      stageSince: since,
      daysInStage: Math.floor((now - since.getTime()) / 86_400_000),
    };
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

export type CaptureResult =
  | { captured: true; application: Awaited<ReturnType<typeof createApplication>>; parsed: ParsedPosting }
  | { captured: false; parsed: ParsedPosting; reason: string };

/**
 * One move from a posting URL to a tracked application: fetch the page, read
 * the JobPosting data most boards embed, match or create the company, and
 * create the application on the wishlist with the description filled.
 *
 * When the page doesn't say who the employer is or what the role is called,
 * nothing is created — whatever WAS readable comes back so the caller can
 * complete it and create the application deliberately. Guessing an employer's
 * name from a URL is how a pipeline fills with companies that don't exist.
 */
export async function captureJobPosting(userId: string, url: string): Promise<CaptureResult> {
  const parsed = await loadPosting(url);

  if (!parsed.roleTitle || !parsed.company) {
    const missing = [
      !parsed.roleTitle ? "the role title" : null,
      !parsed.company ? "the employer" : null,
    ]
      .filter(Boolean)
      .join(" or ");
    return {
      captured: false,
      parsed,
      reason: `The page didn't state ${missing} in a readable way. Nothing was created.`,
    };
  }

  const application = await createApplication(userId, {
    company: parsed.company,
    companyWebsite: parsed.companyWebsite || undefined,
    roleTitle: parsed.roleTitle,
    stage: "WISHLIST",
    jobUrl: url.trim(),
    jobDescription: parsed.jobDescription,
    location: parsed.location,
    workMode: parsed.workMode,
    salaryRange: parsed.salaryRange,
    source: parsed.source,
  });
  return { captured: true, application, parsed };
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
        // Recorded separately from the body, which a note is allowed to replace.
        // Without these the funnel is guesswork.
        fromStage: current.stage,
        toStage: stage,
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

/**
 * Move several applications to the same stage in one go.
 *
 * Loops `moveApplicationStage` rather than issuing one `updateMany`, because
 * the whole value of a stage move is the things that happen around it — the
 * timeline entry, the follow-up date, the transition row the funnel is built
 * from. An `updateMany` would be one fast query that quietly destroys the
 * history this product exists to keep.
 *
 * Ids that don't belong to the caller are skipped rather than throwing, so
 * closing out twelve dead applications doesn't fail on the one that was
 * already deleted in another tab. Returns what actually moved.
 */
export async function moveApplicationsStage(userId: string, ids: string[], stage: Stage) {
  const moved: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    try {
      await moveApplicationStage(userId, id, stage);
      moved.push(id);
    } catch {
      skipped.push(id);
    }
  }
  return { moved, skipped, stage };
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
    applicationId?: string;
    contactId?: string;
    type?: ActivityType;
    body: string;
    occurredAt?: Date | string;
  },
) {
  // Exactly one parent. An entry lives on one timeline — an application's or
  // a person's — and a caller passing both hasn't decided which.
  if (Boolean(input.applicationId) === Boolean(input.contactId)) {
    throw new Error("Attach an activity to exactly one thing: an application or a contact.");
  }
  if (input.applicationId) {
    const application = await db.application.findFirst({
      where: { id: input.applicationId, userId },
    });
    if (!application) throw new Error(`No application with id ${input.applicationId}`);
  }
  if (input.contactId) {
    const contact = await db.contact.findFirst({ where: { id: input.contactId, userId } });
    if (!contact) throw new Error(`No contact with id ${input.contactId}`);
  }

  return db.activity.create({
    data: {
      userId,
      applicationId: input.applicationId ?? null,
      contactId: input.contactId ?? null,
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
    include: {
      application: { include: { company: true } },
      contact: { select: { id: true, name: true } },
    },
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

const contactInclude = {
  company: true,
  application: { select: { id: true, roleTitle: true, stage: true } },
} satisfies Prisma.ContactInclude;

export async function listContacts(
  userId: string,
  options?: { applicationId?: string; companyId?: string; search?: string },
) {
  const where: Prisma.ContactWhereInput = { userId };
  if (options?.applicationId) where.applicationId = options.applicationId;
  if (options?.companyId) where.companyId = options.companyId;
  if (options?.search) {
    where.OR = [
      { name: { contains: options.search, mode: "insensitive" } },
      { title: { contains: options.search, mode: "insensitive" } },
      { email: { contains: options.search, mode: "insensitive" } },
      { notes: { contains: options.search, mode: "insensitive" } },
      { company: { name: { contains: options.search, mode: "insensitive" } } },
    ];
  }
  return db.contact.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      ...contactInclude,
      // The most recent touch, for "when did I last talk to them" in a list.
      activities: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" as const }, take: 1 },
    },
  });
}

export async function getContact(userId: string, id: string) {
  return db.contact.findFirst({
    where: { id, userId },
    include: { ...contactInclude, activities: { orderBy: { occurredAt: "desc" as const } } },
  });
}

export async function updateContact(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    title: string;
    email: string;
    phone: string;
    linkedin: string;
    relationship: string;
    notes: string;
    company: string;
    applicationId: string | null;
    nextFollowUpAt: Date | string | null;
  }>,
) {
  const current = await db.contact.findFirst({ where: { id, userId } });
  if (!current) throw new Error(`No contact with id ${id}`);

  const data: Prisma.ContactUpdateInput = pick(patch, CONTACT_COLUMNS);
  if (patch.nextFollowUpAt !== undefined) data.nextFollowUpAt = toDate(patch.nextFollowUpAt);
  // Company and application are relations, so they are resolved by hand rather
  // than picked — and both are re-checked against this user.
  if (patch.company !== undefined) {
    data.company = patch.company
      ? { connect: { id: (await upsertCompanyByName(userId, patch.company)).id } }
      : { disconnect: true };
  }
  if (patch.applicationId !== undefined) {
    if (patch.applicationId) {
      const application = await db.application.findFirst({
        where: { id: patch.applicationId, userId },
      });
      if (!application) throw new Error(`No application with id ${patch.applicationId}`);
      data.application = { connect: { id: patch.applicationId } };
    } else {
      data.application = { disconnect: true };
    }
  }
  return db.contact.update({ where: { id }, data, include: contactInclude });
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

/** People whose ping date has arrived (or passed). */
export async function contactFollowUpsDue(userId: string, withinDays = 0) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  cutoff.setHours(23, 59, 59, 999);
  return db.contact.findMany({
    where: { userId, nextFollowUpAt: { lte: cutoff } },
    orderBy: { nextFollowUpAt: "asc" },
    include: { company: { select: { name: true, website: true } } },
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
  /** Set when the entry belongs to a person rather than an application. */
  contactId: string | null;
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

  const [followUps, contactPings, tasks, activities] = await Promise.all([
    db.application.findMany({
      where: { userId, nextFollowUpAt: range, stage: { notIn: TERMINAL_STAGES } },
      include: { company: true },
    }),
    db.contact.findMany({
      where: { userId, nextFollowUpAt: range },
      include: { company: { select: { name: true } } },
    }),
    db.task.findMany({
      where: { userId, dueAt: range },
      include: { application: { include: { company: true } } },
    }),
    db.activity.findMany({
      where: { userId, occurredAt: range },
      include: {
        application: { include: { company: true } },
        contact: { select: { id: true, name: true } },
      },
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
      contactId: null,
      stage: application.stage,
      done: null,
      activityType: null,
    })),
    ...contactPings.map((contact) => ({
      kind: "FOLLOW_UP" as const,
      id: contact.id,
      date: contact.nextFollowUpAt!,
      title: `Ping ${contact.name}`,
      detail: [contact.title, contact.company?.name].filter(Boolean).join(" · "),
      company: contact.company?.name ?? null,
      applicationId: null,
      contactId: contact.id,
      stage: null,
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
      contactId: null,
      stage: task.application?.stage ?? null,
      done: task.done,
      activityType: null,
    })),
    ...activities.map((activity) => ({
      kind: "ACTIVITY" as const,
      id: activity.id,
      date: activity.occurredAt,
      title: `${ACTIVITY_LABEL[activity.type]} · ${
        activity.application?.company.name ?? activity.contact?.name ?? "Note"
      }`,
      detail: activity.body,
      company: activity.application?.company.name ?? null,
      applicationId: activity.applicationId,
      contactId: activity.contactId,
      stage: activity.application?.stage ?? null,
      done: null,
      activityType: activity.type,
    })),
  ];

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * What is actually going wrong with the search.
 *
 * A funnel display shows six numbers and leaves the reading to you. This does
 * the reading: it works out which step is losing people and says so in one
 * sentence, because "you are getting responses but not past the screen" is a
 * different week's work from "nothing is coming back at all".
 *
 * Progress is measured by the furthest stage an application ever reached, not
 * by where it sits now — otherwise every rejection would look like it failed at
 * the first hurdle, and a rejection after a final round is the opposite signal
 * from a rejection after applying.
 */

/** The one path forward. Terminal stages sit outside it and end the journey. */
const LADDER: Stage[] = ["APPLIED", "SCREEN", "INTERVIEW", "FINAL", "OFFER"];

export type FunnelStep = {
  from: Stage;
  to: Stage;
  reached: number;
  advanced: number;
  /** Null rather than 0 when nobody has reached this step yet. */
  rate: number | null;
  medianDays: number | null;
};

export type SearchDiagnosis = {
  /** The sentence. Everything else on the screen supports this. */
  headline: string;
  detail: string;
  /** Which step is the bottleneck, or null when there isn't enough to say. */
  weakest: Stage | null;
  confident: boolean;
  steps: FunnelStep[];
  applied: number;
  inFlight: number;
  velocity: { weekStart: string; count: number }[];
  stalled: { id: string; company: string; roleTitle: string; stage: Stage; days: number }[];
  byResume: { id: string; name: string; sent: number; responded: number; rate: number | null }[];
};

/** How long an application can sit in a stage before it has probably died. */
const STALE_AFTER: Partial<Record<Stage, number>> = {
  APPLIED: 21,
  SCREEN: 14,
  INTERVIEW: 14,
  FINAL: 10,
  OFFER: 7,
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

const DAY = 86_400_000;

export async function diagnoseSearch(userId: string): Promise<SearchDiagnosis> {
  const [applications, transitions] = await Promise.all([
    db.application.findMany({
      where: { userId },
      select: {
        id: true,
        stage: true,
        roleTitle: true,
        appliedAt: true,
        updatedAt: true,
        resumeId: true,
        company: { select: { name: true } },
        resume: { select: { id: true, name: true } },
      },
    }),
    db.activity.findMany({
      where: { userId, toStage: { not: null } },
      select: { applicationId: true, fromStage: true, toStage: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  const byApplication = new Map<string, typeof transitions>();
  for (const transition of transitions) {
    // Stage transitions only exist on application activities; the null check
    // is for the type, not an expected case.
    if (!transition.applicationId) continue;
    const list = byApplication.get(transition.applicationId);
    if (list) list.push(transition);
    else byApplication.set(transition.applicationId, [transition]);
  }

  // --- how far each application ever got ------------------------------------
  const rank = (stage: Stage | null) => (stage ? LADDER.indexOf(stage) : -1);
  const furthest = new Map<string, number>();
  for (const application of applications) {
    let best = rank(application.stage);
    // ACCEPTED means they got the offer, whatever the row says now.
    if (application.stage === "ACCEPTED") best = LADDER.indexOf("OFFER");
    for (const transition of byApplication.get(application.id) ?? []) {
      best = Math.max(best, rank(transition.toStage));
    }
    // An application with a date on it was sent, even if nothing was logged.
    if (best < 0 && application.appliedAt) best = 0;
    furthest.set(application.id, best);
  }

  // --- time spent in each stage before moving on ----------------------------
  const daysIn = new Map<Stage, number[]>();
  for (const list of byApplication.values()) {
    for (let i = 0; i < list.length - 1; i++) {
      const stage = list[i].toStage;
      if (!stage) continue;
      const days = Math.round((list[i + 1].occurredAt.getTime() - list[i].occurredAt.getTime()) / DAY);
      if (days < 0) continue;
      const bucket = daysIn.get(stage);
      if (bucket) bucket.push(days);
      else daysIn.set(stage, [days]);
    }
  }

  const steps: FunnelStep[] = LADDER.slice(0, -1).map((from, index) => {
    const reached = [...furthest.values()].filter((value) => value >= index).length;
    const advanced = [...furthest.values()].filter((value) => value >= index + 1).length;
    return {
      from,
      to: LADDER[index + 1],
      reached,
      advanced,
      rate: reached > 0 ? Math.round((advanced / reached) * 100) : null,
      medianDays: median(daysIn.get(from) ?? []),
    };
  });

  // --- velocity: six weeks back, Monday-anchored ----------------------------
  const now = new Date();
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const velocity = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(monday);
    start.setUTCDate(start.getUTCDate() - (5 - i) * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return {
      weekStart: start.toISOString().slice(0, 10),
      count: applications.filter(
        (application) =>
          application.appliedAt !== null &&
          application.appliedAt >= start &&
          application.appliedAt < end,
      ).length,
    };
  });

  // --- what has gone quiet ---------------------------------------------------
  const lastTouch = (id: string, fallback: Date) => {
    const list = byApplication.get(id);
    return list && list.length > 0 ? list[list.length - 1].occurredAt : fallback;
  };
  const stalled = applications
    .filter((application) => !TERMINAL_STAGES.includes(application.stage))
    .map((application) => ({
      id: application.id,
      company: application.company.name,
      roleTitle: application.roleTitle,
      stage: application.stage,
      days: Math.floor((now.getTime() - lastTouch(application.id, application.updatedAt).getTime()) / DAY),
    }))
    .filter((row) => row.days >= (STALE_AFTER[row.stage] ?? Infinity))
    .sort((a, b) => b.days - a.days);

  // --- which resume is actually working --------------------------------------
  const resumeRows = new Map<string, { id: string; name: string; sent: number; responded: number }>();
  for (const application of applications) {
    if (!application.resume || (furthest.get(application.id) ?? -1) < 0) continue;
    const row = resumeRows.get(application.resume.id) ?? {
      id: application.resume.id,
      name: application.resume.name,
      sent: 0,
      responded: 0,
    };
    row.sent += 1;
    if ((furthest.get(application.id) ?? -1) >= 1) row.responded += 1;
    resumeRows.set(application.resume.id, row);
  }
  const byResume = [...resumeRows.values()]
    .map((row) => ({ ...row, rate: row.sent > 0 ? Math.round((row.responded / row.sent) * 100) : null }))
    .sort((a, b) => b.sent - a.sent);

  const applied = [...furthest.values()].filter((value) => value >= 0).length;
  const inFlight = applications.filter(
    (application) => !TERMINAL_STAGES.includes(application.stage),
  ).length;

  return {
    ...verdict(steps, applied, velocity),
    steps,
    applied,
    inFlight,
    velocity,
    stalled,
    byResume,
  };
}

/**
 * The sentence.
 *
 * Deliberately opinionated and deliberately not benchmarked against numbers we
 * cannot source. The thresholds below are this tool's own rules of thumb, and
 * the copy says which step is losing people rather than claiming what a normal
 * rate is. Under ten applications it says nothing at all, because a diagnosis
 * from four data points is a guess wearing a lab coat.
 */
function verdict(
  steps: FunnelStep[],
  applied: number,
  velocity: { weekStart: string; count: number }[],
) {
  const step = (from: Stage) => steps.find((candidate) => candidate.from === from);
  const response = step("APPLIED");
  const screen = step("SCREEN");
  const interview = step("INTERVIEW");
  const final = step("FINAL");

  const thisWeek = velocity[velocity.length - 1]?.count ?? 0;
  const previous = velocity.slice(0, -1);
  const busiest = Math.max(0, ...previous.map((week) => week.count));
  const slowing =
    busiest >= 3 && thisWeek * 2 < busiest
      ? ` You have also slowed down — ${thisWeek} sent this week against ${busiest} in your best recent week, and a search usually dies of that before anything else.`
      : "";

  if (applied < 10) {
    return {
      headline: "Too early to tell you anything useful.",
      detail: `${applied} application${applied === 1 ? "" : "s"} in. Around ten is where the numbers below start meaning something rather than describing luck.${slowing}`,
      weakest: null,
      confident: false,
    };
  }

  if (response && response.reached >= 10 && (response.rate ?? 0) < 15) {
    return {
      headline: "Almost nothing is coming back.",
      detail: `${response.advanced} of ${response.reached} applications got any response. At this volume that is not bad luck — it is the resume or which jobs you are applying to, and sending more of the same will not fix it.${slowing}`,
      weakest: "APPLIED" as Stage,
      confident: true,
    };
  }

  if (screen && screen.reached >= 4 && (screen.rate ?? 0) < 34) {
    return {
      headline: "You are getting responses but not past the screen.",
      detail: `${screen.advanced} of ${screen.reached} screens became an interview. The resume is working — this is a phone-screen problem, which is usually how you tell the story rather than what is in it.${slowing}`,
      weakest: "SCREEN" as Stage,
      confident: true,
    };
  }

  if (interview && interview.reached >= 3 && (interview.rate ?? 0) < 40) {
    return {
      headline: "You are getting into the room and not converting.",
      detail: `${interview.advanced} of ${interview.reached} interviews went further. You are being taken seriously; something in the loop itself is losing it.${slowing}`,
      weakest: "INTERVIEW" as Stage,
      confident: true,
    };
  }

  if (final && final.reached >= 2 && (final.rate ?? 0) < 50) {
    return {
      headline: "You are reaching final rounds and stopping there.",
      detail: `${final.advanced} of ${final.reached} final rounds became an offer. This close, the difference is usually fit and how you close rather than capability.${slowing}`,
      weakest: "FINAL" as Stage,
      confident: true,
    };
  }

  if (thisWeek === 0 && busiest >= 3) {
    return {
      headline: "Your funnel is fine. You have stopped feeding it.",
      detail: `Nothing sent this week, against ${busiest} in your best recent week. Every rate below is holding up — there is just less going in.`,
      weakest: null,
      confident: true,
    };
  }

  return {
    headline: "Nothing obviously broken.",
    detail: `${applied} applications in and every step is converting at a reasonable rate. Keep the volume up and chase what has gone quiet.${slowing}`,
    weakest: null,
    confident: true,
  };
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
