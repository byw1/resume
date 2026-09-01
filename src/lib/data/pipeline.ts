import { ActivityType, Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { pick } from "@/lib/data/patch";
import { DAY, hasGoneQuiet, lastTouchAt, quietDaysFor } from "@/lib/quiet";
import { readQuickLog } from "@/lib/quick-log";
import { loadPosting, type ParsedPosting } from "@/lib/posting";

/** Like me.ts: userId is the required first argument on every query. */

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
  OUTREACH: "Outreach",
};

/**
 * The kinds of touch a person logs by hand, in the order a picker should
 * offer them. The rest of ActivityType is written by the system — a stage
 * change, an application — and offering those invites a timeline that
 * disagrees with the board.
 */
export const ACTIVITY_OPTIONS: ActivityType[] = [
  "NOTE",
  "OUTREACH",
  "EMAIL_SENT",
  "EMAIL_RECEIVED",
  "CALL",
  "INTERVIEW",
  "FOLLOW_UP",
  "REFERRAL",
];

/**
 * What a brand-new workspace is offered as a one-click seed. NOT appended to
 * anybody's list forever — that was the old behaviour and the reason the picker
 * filled with options nobody could remove. Accepting these creates real rows
 * the person owns and can rename, recolour or delete.
 */
export const SOURCE_SUGGESTIONS = [
  "LinkedIn",
  "Job board",
  "Company site",
  "Referral",
  "Recruiter reached out",
  "Cold outreach",
] as const;

/** The swatches a source can wear. Token names, resolved through SOURCE_TONE. */
export const SOURCE_COLORS = [
  "slate",
  "blue",
  "teal",
  "green",
  "amber",
  "red",
  "violet",
  "pink",
] as const;

export type SourceColor = (typeof SOURCE_COLORS)[number];

/**
 * Same argument as STAGE_TONE: a CSS variable follows the theme and a stored
 * hex is right in exactly one of them. See --tag-* in globals.css for why a
 * source wears its colour as a dot rather than as ink and wash.
 */
export const SOURCE_TONE: Record<SourceColor, string> = {
  slate: "var(--tag-slate)",
  blue: "var(--tag-blue)",
  teal: "var(--tag-teal)",
  green: "var(--tag-green)",
  amber: "var(--tag-amber)",
  red: "var(--tag-red)",
  violet: "var(--tag-violet)",
  pink: "var(--tag-pink)",
};

/** Anything unrecognised renders slate rather than throwing at paint time. */
export function sourceTone(color: string): string {
  return SOURCE_TONE[color as SourceColor] ?? SOURCE_TONE.slate;
}

function sourceKey(name: string): string {
  return name.trim().toLowerCase();
}

function assertColor(color: string): SourceColor {
  if (!(SOURCE_COLORS as readonly string[]).includes(color)) {
    throw new Error(`Unknown colour "${color}". Use one of: ${SOURCE_COLORS.join(", ")}.`);
  }
  return color as SourceColor;
}

// ---------------------------------------------------------------------------
// Sources — the channels an application came from
// ---------------------------------------------------------------------------

const sourceCounts = { _count: { select: { applications: true } } } as const;

export async function listSources(userId: string) {
  return db.source.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: sourceCounts,
  });
}

/**
 * The starter set, offered rather than imposed.
 *
 * These used to be appended to everyone's picker in code, which made them
 * permanent and un-deletable — half of the reason the list "filled with random
 * source forms". Accepting them creates real rows the person owns. Skips any
 * name they already have, so pressing it twice is harmless.
 */
export async function seedSources(userId: string) {
  const existing = await db.source.findMany({ where: { userId }, select: { key: true } });
  const have = new Set(existing.map((row) => row.key));
  const wanted = SOURCE_SUGGESTIONS.filter((name) => !have.has(sourceKey(name)));
  await db.source.createMany({
    data: wanted.map((name, index) => ({
      userId,
      name,
      key: sourceKey(name),
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
    })),
  });
  return listSources(userId);
}

export async function createSource(
  userId: string,
  input: { name: string; color?: string },
) {
  const name = input.name.trim();
  if (!name) throw new Error("A source needs a name");
  const key = sourceKey(name);
  const existing = await db.source.findFirst({ where: { userId, key } });
  if (existing) throw new Error(`You already have a source called "${existing.name}"`);
  return db.source.create({
    data: { userId, name, key, color: input.color ? assertColor(input.color) : "slate" },
    include: sourceCounts,
  });
}

export async function updateSource(
  userId: string,
  id: string,
  patch: { name?: string; color?: string },
) {
  const data: Prisma.SourceUpdateInput = {};
  if (patch.color !== undefined) data.color = assertColor(patch.color);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("A source needs a name");
    // `key` is derived, so it is assigned here rather than picked off the
    // patch — otherwise a rename leaves the old key and the case-insensitive
    // uniqueness quietly stops meaning anything.
    const key = sourceKey(name);
    const clash = await db.source.findFirst({ where: { userId, key, id: { not: id } } });
    if (clash) throw new Error(`You already have a source called "${clash.name}"`);
    data.name = name;
    data.key = key;
  }
  const { count } = await db.source.updateMany({ where: { id, userId }, data: data as Prisma.SourceUpdateManyMutationInput });
  if (count === 0) throw new Error(`No source with id ${id}`);
  return db.source.findFirstOrThrow({ where: { id, userId }, include: sourceCounts });
}

/**
 * Deleting a source takes it off every application and succeeds.
 *
 * Deliberately unlike deleteCompany, which refuses while applications point at
 * it. A company is a record with its own history and losing it loses work; a
 * source is a label, and the applications are untouched apart from no longer
 * wearing it. A label you cannot remove IS the bug this replaced.
 */
export async function deleteSource(userId: string, id: string) {
  const source = await db.source.findFirst({
    where: { id, userId },
    include: sourceCounts,
  });
  if (!source) throw new Error(`No source with id ${id}`);
  await db.source.delete({ where: { id } });
  return { id, name: source.name, detachedFrom: source._count.applications };
}

/**
 * Names and ids in, ids out — creating a source only for a name nothing
 * matches. Matching is on the case-folded key, so "linkedin" lands on the
 * existing "LinkedIn" rather than minting a twin.
 */
async function resolveSourceIds(
  userId: string,
  input: { sourceIds?: string[]; sources?: string[]; source?: string },
): Promise<string[] | undefined> {
  if (input.sourceIds !== undefined) {
    if (input.sourceIds.length === 0) return [];
    // Every id is re-checked against this user: the join table carries no
    // userId of its own, so this is the only thing standing between a
    // client-supplied id and a cross-workspace link.
    const owned = await db.source.findMany({
      where: { id: { in: input.sourceIds }, userId },
      select: { id: true },
    });
    const found = new Set(owned.map((row) => row.id));
    const missing = input.sourceIds.filter((id) => !found.has(id));
    if (missing.length > 0) throw new Error(`No source with id ${missing[0]}`);
    return [...found];
  }

  const names =
    input.sources !== undefined
      ? input.sources
      : input.source !== undefined
        ? [input.source]
        : undefined;
  if (names === undefined) return undefined;

  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name) wanted.set(sourceKey(name), name);
  }
  if (wanted.size === 0) return [];

  const existing = await db.source.findMany({
    where: { userId, key: { in: [...wanted.keys()] } },
  });
  const ids = existing.map((row) => row.id);
  const have = new Set(existing.map((row) => row.key));
  for (const [key, name] of wanted) {
    if (have.has(key)) continue;
    const created = await db.source.create({
      data: {
        userId,
        name,
        key,
        // Spread the palette rather than making every new source slate.
        color: SOURCE_COLORS[Math.abs(hashKey(key)) % SOURCE_COLORS.length],
      },
    });
    ids.push(created.id);
  }
  return ids;
}

/** Small stable hash, only ever used to pick a default swatch. */
function hashKey(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return hash;
}

/** A source as every caller wants it: the row, not the link to it. */
export type SourceRef = { id: string; name: string; color: string };

/**
 * The join rows a caller never wants to see, flattened to what they meant.
 *
 * The return type is spelled out with Omit rather than left to inference: a
 * spread over a generic keeps the original `sources` in the resulting type, so
 * without this every caller still sees join rows through the compiler even
 * though the value is right.
 */
function flattenSources<T extends { sources: { source: SourceRef }[] }>(
  row: T,
): Omit<T, "sources"> & { sources: SourceRef[] } {
  return { ...row, sources: row.sources.map((link) => link.source) };
}

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
  "twitter",
  "instagram",
  "github",
  "website",
  "relationship",
  "notes",
] as const;

/** Cuts of the company list that keep coming up as questions. */
export type CompanyFilter = "active" | "applied" | "never-applied" | "with-contacts";

export async function listCompanies(
  userId: string,
  options?: { search?: string; filter?: CompanyFilter },
) {
  const where: Prisma.CompanyWhereInput = { userId };
  if (options?.search) {
    where.OR = [
      { name: { contains: options.search, mode: "insensitive" } },
      { industry: { contains: options.search, mode: "insensitive" } },
      { location: { contains: options.search, mode: "insensitive" } },
      { notes: { contains: options.search, mode: "insensitive" } },
    ];
  }
  if (options?.filter === "active") where.applications = { some: { stage: { notIn: TERMINAL_STAGES } } };
  if (options?.filter === "applied") where.applications = { some: { appliedAt: { not: null } } };
  if (options?.filter === "never-applied") where.applications = { none: { appliedAt: { not: null } } };
  if (options?.filter === "with-contacts") where.contacts = { some: {} };

  const rows = await db.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      ...companyCounts,
      // Plumbing for the two derived fields below, not part of the result.
      applications: { select: { appliedAt: true, stage: true } },
    },
  });
  // "When did I last apply here" and "is anything still live" are the two
  // questions a company list gets asked; answer them on every row rather than
  // making callers fetch each company.
  return rows.map(({ applications, ...company }) => ({
    ...company,
    lastAppliedAt: applications.reduce<Date | null>(
      (latest, application) =>
        application.appliedAt && (!latest || application.appliedAt > latest)
          ? application.appliedAt
          : latest,
      null,
    ),
    openApplications: applications.filter(
      (application) => !TERMINAL_STAGES.includes(application.stage),
    ).length,
  }));
}

export async function getCompany(userId: string, id: string) {
  const company = await db.company.findFirst({
    where: { id, userId },
    include: {
      applications: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          roleTitle: true,
          stage: true,
          location: true,
          workMode: true,
          salaryRange: true,
          jobUrl: true,
          sources: { include: { source: true }, orderBy: { source: { name: "asc" as const } } },
          appliedAt: true,
          nextFollowUpAt: true,
          updatedAt: true,
        },
      },
      contacts: { orderBy: { createdAt: "asc" }, include: { contact: true } },
    },
  });
  if (!company) return null;
  return {
    ...company,
    applications: company.applications.map(flattenSources),
    // Callers want the people, not the rows that link them here.
    contacts: company.contacts.map((link) => link.contact),
  };
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
 * Refuses while applications point here, and unlinks the people who represent it.
 *
 * Note what the schema actually does: `ContactCompany` cascades — deleting a
 * company drops the link and leaves the person standing — but
 * `Application.company` is `onDelete: Cascade`, so deleting a company
 * WOULD take its applications with it, history included. That is the genuinely
 * bad afternoon this guard exists to prevent, and it is why the check below is
 * load-bearing rather than a courtesy. To fold a duplicate employer away
 * without losing anything, use mergeCompanies.
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

/**
 * Folding a duplicate employer into the one you are keeping.
 *
 * "Stripe", "Stripe, Inc." and "stripe" all end up on file — an application
 * created one, a capture created another, and a typo created the third. The
 * applications are spread across them, so the company page tells you a half
 * truth wherever you look.
 *
 * The rules, in order of how much they matter:
 *
 *   1. Nothing is deleted except the duplicate's own row. Applications and
 *      contacts move; none is dropped, and none is de-duplicated — two
 *      identical role titles on the survivor is the correct outcome, because
 *      the alternative is guessing which of two records to destroy.
 *   2. Notes are never lost. The survivor's notes win their position and the
 *      duplicate's are appended under a line saying where they came from.
 *   3. Blanks are filled, values are never overwritten. The duplicate usually
 *      holds the website (it was auto-created from a posting) while the record
 *      you kept holds the research, or the other way round.
 *   4. The survivor's NAME is never taken from the duplicate. Which name lives
 *      is the direction of the merge; renaming afterwards is a separate act.
 *
 * The transaction is not a nicety. `Application.company` is `onDelete: Cascade`,
 * so the delete has to come after the re-pointing, and a failure in between
 * would leave the pipeline split across two companies — the exact state being
 * repaired, but now half-done.
 */

/** Scalars a merge may fill in on the survivor. `name` is deliberately absent. */
const MERGE_FILL_COLUMNS = ["website", "industry", "size", "location"] as const;

export type CompanyMergePlan = {
  keep: { id: string; name: string };
  merge: { id: string; name: string };
  /** How many rows change owner. */
  applications: number;
  contacts: number;
  /** Which blank fields on the survivor get filled, and with what. */
  fills: { field: string; value: string }[];
  /** Whether the duplicate's notes will be appended to the survivor's. */
  notesAppended: boolean;
  /** Role titles that move, for a confirmation that is not a blind click. */
  movingRoles: string[];
};

async function planCompanyMerge(userId: string, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new Error("Those are the same company.");
  const [keep, merge] = await Promise.all([
    db.company.findFirst({
      where: { id: keepId, userId },
      include: {
        applications: { select: { roleTitle: true } },
        contacts: { select: { contactId: true } },
      },
    }),
    db.company.findFirst({
      where: { id: mergeId, userId },
      include: {
        applications: { select: { roleTitle: true } },
        contacts: { select: { contactId: true } },
      },
    }),
  ]);
  if (!keep) throw new Error(`No company with id ${keepId}`);
  if (!merge) throw new Error(`No company with id ${mergeId}`);

  const fills = MERGE_FILL_COLUMNS.flatMap((field) =>
    !keep[field].trim() && merge[field].trim() ? [{ field, value: merge[field] }] : [],
  );
  // Skipped when the survivor already carries them — merging the same pair
  // twice (a name recreated by upsertCompanyByName, then merged again) must
  // not double the text.
  const loserNotes = merge.notes.trim();
  const notesAppended = Boolean(loserNotes) && !keep.notes.includes(loserNotes);

  // Someone can already represent both, and that link is dropped rather than
  // moved — the pair is the join's primary key — so it is not a person the
  // survivor gains.
  const alreadyKept = new Set(keep.contacts.map((link) => link.contactId));
  const movingContacts = merge.contacts.filter((link) => !alreadyKept.has(link.contactId));

  const plan: CompanyMergePlan = {
    keep: { id: keep.id, name: keep.name },
    merge: { id: merge.id, name: merge.name },
    applications: merge.applications.length,
    contacts: movingContacts.length,
    fills,
    notesAppended,
    movingRoles: merge.applications.map((application) => application.roleTitle),
  };
  return { plan, keep, merge, loserNotes };
}

/** What a merge would do, without doing any of it. */
export async function previewCompanyMerge(
  userId: string,
  keepId: string,
  mergeId: string,
): Promise<CompanyMergePlan> {
  const { plan } = await planCompanyMerge(userId, keepId, mergeId);
  return plan;
}

export async function mergeCompanies(userId: string, keepId: string, mergeId: string) {
  const { plan, keep, loserNotes } = await planCompanyMerge(userId, keepId, mergeId);

  const notes = !keep.notes.trim()
    ? loserNotes
    : plan.notesAppended
      ? `${keep.notes}\n\n— merged from "${plan.merge.name}" on ${new Date().toISOString().slice(0, 10)} —\n${loserNotes}`
      : keep.notes;

  await db.$transaction(async (tx) => {
    // Re-point first. The delete at the end cascades to applications, so
    // anything still pointing at the duplicate when it goes is destroyed.
    await tx.application.updateMany({
      where: { companyId: mergeId, userId },
      data: { companyId: keepId },
    });
    // Drop the duplicate's link for anyone already at the survivor, then move
    // the rest: (contactId, companyId) is the primary key, so re-pointing both
    // would collide.
    await tx.contactCompany.deleteMany({
      where: {
        companyId: mergeId,
        contact: { userId, companies: { some: { companyId: keepId } } },
      },
    });
    await tx.contactCompany.updateMany({
      where: { companyId: mergeId, contact: { userId } },
      data: { companyId: keepId },
    });
    await tx.company.update({
      where: { id: keepId },
      data: {
        ...Object.fromEntries(plan.fills.map((fill) => [fill.field, fill.value])),
        ...(notes === keep.notes ? {} : { notes }),
      },
    });
    // Ownership was established by planCompanyMerge's userId-filtered reads.
    await tx.company.delete({ where: { id: mergeId } });
  });

  const survivor = await db.company.findFirstOrThrow({
    where: { id: keepId, userId },
    include: companyCounts,
  });
  return { ...survivor, merged: plan };
}

export async function upsertCompanyByName(
  userId: string,
  name: string,
  extra?: Partial<{ website: string; industry: string; location: string; notes: string }>,
) {
  const clean = name.trim();
  // The last line of defence against a half-typed name becoming a company.
  // Callers reach here from an autosave, a tool argument and a posting parse,
  // and a Company row named "" is unreachable, unnameable and permanent.
  if (!clean) throw new Error("A company needs a name");
  return db.company.upsert({
    where: { userId_name: { userId, name: clean } },
    create: { userId, name: clean, ...extra },
    update: extra ?? {},
  });
}

/** A company as a contact's callers want it: the row, not the link to it. */
export type CompanyRef = { id: string; name: string; website: string };

/**
 * The join rows a caller never wants to see, flattened. Spelled out with Omit
 * for the same reason flattenSources is: a spread over a generic keeps the
 * original `companies` in the resulting type.
 */
function flattenCompanies<T extends { companies: { company: CompanyRef }[] }>(
  row: T,
): Omit<T, "companies"> & { companies: CompanyRef[] } {
  return { ...row, companies: row.companies.map((link) => link.company) };
}

/**
 * Names and ids in, ids out — the set a person represents, in the order given.
 *
 * Ids are re-checked against this user because the join table carries no
 * userId of its own; names go through upsertCompanyByName, so "she also
 * advises Vercel" links the Vercel already on file rather than a second one.
 * Returns undefined when the caller said nothing about companies, which is how
 * updateContact tells "leave them alone" from "detach every one".
 */
async function resolveCompanyIds(
  userId: string,
  input: { companyIds?: string[]; companies?: string[]; company?: string },
): Promise<string[] | undefined> {
  if (input.companyIds !== undefined) {
    if (input.companyIds.length === 0) return [];
    const owned = await db.company.findMany({
      where: { id: { in: input.companyIds }, userId },
      select: { id: true },
    });
    const found = new Set(owned.map((row) => row.id));
    const missing = input.companyIds.filter((id) => !found.has(id));
    if (missing.length > 0) throw new Error(`No company with id ${missing[0]}`);
    return [...new Set(input.companyIds)];
  }

  const names =
    input.companies !== undefined
      ? input.companies
      : input.company !== undefined
        ? [input.company]
        : undefined;
  if (names === undefined) return undefined;

  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const company = await upsertCompanyByName(userId, name);
    if (!ids.includes(company.id)) ids.push(company.id);
  }
  return ids;
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
  /** Source ids, when you already have them. Wins over `sources`. */
  sourceIds?: string[];
  /** Source names — resolved against what exists, created only when nothing matches. */
  sources?: string[];
  /** Legacy single-source spelling. `sourceIds` and `sources` both win over it. */
  source?: string;
  excitement?: number;
  fit?: number;
  notes?: string;
  appliedAt?: Date | string | null;
  nextFollowUpAt?: Date | string | null;
  resumeId?: string | null;
};

const applicationSourceInclude = {
  sources: { include: { source: true }, orderBy: { source: { name: "asc" as const } } },
} satisfies Prisma.ApplicationInclude;

const applicationInclude = {
  company: true,
  ...applicationSourceInclude,
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

/**
 * When each of these applications last had anything happen to it, in one
 * query rather than one per card. Postgres answers it off the existing
 * (applicationId, occurredAt) index.
 */
async function lastActivityByApplication(userId: string, ids: string[]) {
  const found = new Map<string, Date>();
  if (ids.length === 0) return found;
  const rows = await db.activity.groupBy({
    by: ["applicationId"],
    where: { userId, applicationId: { in: ids } },
    _max: { occurredAt: true },
  });
  for (const row of rows) {
    if (row.applicationId && row._max.occurredAt) found.set(row.applicationId, row._max.occurredAt);
  }
  return found;
}

export async function listApplications(
  userId: string,
  options?: { stage?: Stage; includeClosed?: boolean; search?: string; quietForDays?: number },
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
  // The take-1 transition row is plumbing for the dates below, not something a
  // caller — or an assistant reading a tool result — should have to interpret.
  const touched = await lastActivityByApplication(userId, rows.map((row) => row.id));
  const now = new Date();
  const mapped = rows.map(({ activities, ...application }) => {
    const since = activities[0]?.occurredAt ?? application.createdAt;
    const subject = {
      stage: application.stage,
      createdAt: application.createdAt,
      appliedAt: application.appliedAt,
      lastActivityAt: touched.get(application.id) ?? null,
      lastStageChangeAt: activities[0]?.occurredAt ?? null,
    };
    return {
      ...flattenSources(application),
      stageSince: since,
      daysInStage: Math.floor((now.getTime() - since.getTime()) / DAY),
      // Two questions, and confusing them is why the board could answer
      // neither: daysInStage is how long it has sat where it is, quietDays is
      // how long since ANYTHING happened. A logged call resets the second and
      // leaves the first alone.
      lastTouchAt: lastTouchAt(subject),
      quietDays: quietDaysFor(subject, now),
    };
  });
  // Filtered here rather than in the query: the number is computed, so
  // Postgres cannot answer it without the same read.
  return options?.quietForDays === undefined
    ? mapped
    : mapped.filter((row) => row.quietDays >= options.quietForDays!);
}

export async function getApplication(userId: string, id: string) {
  const application = await db.application.findFirst({
    where: { id, userId },
    include: {
      company: true,
      ...applicationSourceInclude,
      resume: { select: { id: true, name: true } },
      activities: { orderBy: { occurredAt: "desc" } },
      contacts: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }] },
    },
  });
  if (!application) return null;
  // The timeline is already here in full, newest first, so the same two dates
  // the list computes cost nothing extra here.
  const subject = {
    stage: application.stage,
    createdAt: application.createdAt,
    appliedAt: application.appliedAt,
    lastActivityAt: application.activities[0]?.occurredAt ?? null,
    lastStageChangeAt:
      application.activities.find((activity) => activity.toStage !== null)?.occurredAt ?? null,
  };
  return {
    ...flattenSources(application),
    lastTouchAt: lastTouchAt(subject),
    quietDays: quietDaysFor(subject, new Date()),
  };
}

/**
 * Links a person is reachable at: trimmed, blanks dropped, deduped. Same rule
 * as sources below, and for the same reason — a form that submits an empty row
 * should not persist one.
 */
function cleanLinks(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
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
      sources: { create: (await resolveSourceIds(userId, input) ?? []).map((sourceId) => ({ sourceId })) },
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

  return flattenSources(application);
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
    // The parser's spelling resolves against what exists before creating, so
    // a capture cannot mint "LinkedIn Jobs" beside an existing "LinkedIn"
    // unless the parser genuinely says something new.
    sources: parsed.source ? [parsed.source] : [],
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
  // Replaces the whole set, like every other array in this layer.
  const sourceIds = await resolveSourceIds(userId, patch);
  if (sourceIds !== undefined) {
    data.sources = { deleteMany: {}, create: sourceIds.map((sourceId) => ({ sourceId })) };
  }
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
  return flattenSources(
    await db.application.update({ where: { id }, data, include: applicationInclude }),
  );
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
  return inDays(days);
}

/**
 * A date N days out at 9am. The hour is the whole point: a follow-up dated
 * "now plus three days" lands mid-afternoon and reads as overdue the morning
 * you meant to do it.
 */
function inDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}

/**
 * Push a follow-up out. Deferral, honestly labelled: nothing is logged and
 * nothing moves, which is why logFollowUp exists beside it.
 */
export async function snoozeFollowUp(userId: string, id: string, days: number) {
  return updateApplication(userId, id, { nextFollowUpAt: inDays(days) });
}

/** The same for a person's ping. */
export async function snoozeContactFollowUp(userId: string, id: string, days: number) {
  return updateContact(userId, id, { nextFollowUpAt: inDays(days) });
}

/**
 * Chased it: writes the touch AND moves the date, in that order.
 *
 * The pair is the point. Snoozing on its own records nothing, so a chase list
 * emptied by snoozing looks identical to a chase list you actually worked —
 * and the timeline, which is what "when did I last talk to them" is answered
 * from, stays empty. This resets the quiet clock, which snoozing deliberately
 * does not, and never touches the stage: following up is not progress.
 */
export async function logFollowUp(
  userId: string,
  input: {
    applicationId?: string;
    contactId?: string;
    /** What happened. Defaults to a plain statement that you chased it. */
    body?: string;
    type?: ActivityType;
    /** When to come back to it. Defaults to a week out. */
    days?: number;
  },
) {
  if (Boolean(input.applicationId) === Boolean(input.contactId)) {
    throw new Error("Log a follow-up against exactly one thing: an application or a contact.");
  }
  const activity = await addActivity(userId, {
    applicationId: input.applicationId,
    contactId: input.contactId,
    type: input.type ?? "FOLLOW_UP",
    body: input.body?.trim() || "Followed up.",
  });
  const next = inDays(input.days ?? 7);
  const subject = input.applicationId
    ? await updateApplication(userId, input.applicationId, { nextFollowUpAt: next })
    : await updateContact(userId, input.contactId as string, { nextFollowUpAt: next });
  return { activity, nextFollowUpAt: next, subject };
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

  const updated = flattenSources(
    await db.application.update({ where: { id }, data, include: applicationInclude }),
  );

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

/**
 * One typed line, read against this person's live pipeline.
 *
 * The matcher itself is pure and lives in src/lib/quick-log.ts; this is the
 * read that feeds it. There is no tool for it on purpose: an assistant asked
 * "log that I spoke to Stripe" resolves the application with list_applications
 * far better than a stopword table can, and then calls log_activity or
 * move_application_stage. The table exists for the person typing into a box
 * on the dashboard, who has no assistant in the loop.
 */
export async function readQuickLogAgainstPipeline(userId: string, text: string) {
  const applications = await listApplications(userId);
  return readQuickLog(
    text,
    applications.map((application) => ({
      id: application.id,
      company: application.company.name,
      roleTitle: application.roleTitle,
      stage: application.stage,
    })),
  );
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
    twitter?: string;
    instagram?: string;
    github?: string;
    website?: string;
    otherLinks?: string[];
    relationship?: string;
    notes?: string;
    /** Company ids, when you already have them. Wins over `companies`. */
    companyIds?: string[];
    /** Company names — the ones that do not exist yet are created. */
    companies?: string[];
    /** Legacy single-company spelling. `companyIds` and `companies` both win over it. */
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
  const companyIds = (await resolveCompanyIds(userId, input)) ?? [];
  const contact = await db.contact.create({
    data: {
      userId,
      name: input.name,
      title: input.title ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      linkedin: input.linkedin ?? "",
      twitter: input.twitter ?? "",
      instagram: input.instagram ?? "",
      github: input.github ?? "",
      website: input.website ?? "",
      otherLinks: cleanLinks(input.otherLinks ?? []),
      relationship: input.relationship ?? "",
      notes: input.notes ?? "",
      companies: { create: companyIds.map((companyId) => ({ companyId })) },
      applicationId: input.applicationId ?? null,
    },
    include: contactInclude,
  });
  return flattenCompanies(contact);
}

const contactInclude = {
  // Ordered by when the link was made, so the first chip is the one a compact
  // list shows and it does not move about between renders.
  companies: { include: { company: true }, orderBy: { createdAt: "asc" as const } },
  application: {
    select: {
      id: true,
      roleTitle: true,
      stage: true,
      location: true,
      salaryRange: true,
      jobUrl: true,
      nextFollowUpAt: true,
    },
  },
} satisfies Prisma.ContactInclude;

/** Cuts of the contact list: who is owed a ping, who is tied to a live thread. */
export type ContactFilter = "ping-due" | "with-application" | "no-company";

export async function listContacts(
  userId: string,
  options?: {
    applicationId?: string;
    companyId?: string;
    search?: string;
    filter?: ContactFilter;
  },
) {
  const where: Prisma.ContactWhereInput = { userId };
  if (options?.applicationId) where.applicationId = options.applicationId;
  if (options?.companyId) where.companies = { some: { companyId: options.companyId } };
  if (options?.filter === "ping-due") where.nextFollowUpAt = { lte: new Date() };
  if (options?.filter === "with-application") where.applicationId = { not: null };
  if (options?.filter === "no-company") where.companies = { none: {} };
  if (options?.search) {
    where.OR = [
      { name: { contains: options.search, mode: "insensitive" } },
      { title: { contains: options.search, mode: "insensitive" } },
      { email: { contains: options.search, mode: "insensitive" } },
      { notes: { contains: options.search, mode: "insensitive" } },
      {
        companies: {
          some: { company: { name: { contains: options.search, mode: "insensitive" } } },
        },
      },
    ];
  }
  const contacts = await db.contact.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      ...contactInclude,
      // The most recent touch, for "when did I last talk to them" in a list.
      activities: { select: { occurredAt: true }, orderBy: { occurredAt: "desc" as const }, take: 1 },
    },
  });
  return contacts.map(flattenCompanies);
}

export async function getContact(userId: string, id: string) {
  const contact = await db.contact.findFirst({
    where: { id, userId },
    include: { ...contactInclude, activities: { orderBy: { occurredAt: "desc" as const } } },
  });
  return contact ? flattenCompanies(contact) : null;
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
    twitter: string;
    instagram: string;
    github: string;
    website: string;
    otherLinks: string[];
    relationship: string;
    notes: string;
    /** Company ids. REPLACES the whole set. Wins over `companies`. */
    companyIds: string[];
    /** Company names. REPLACES the whole set; unknown names are created. */
    companies: string[];
    /** Legacy single-company spelling. Both of the above win over it. */
    company: string;
    applicationId: string | null;
    nextFollowUpAt: Date | string | null;
  }>,
) {
  const current = await db.contact.findFirst({ where: { id, userId } });
  if (!current) throw new Error(`No contact with id ${id}`);

  const data: Prisma.ContactUpdateInput = pick(patch, CONTACT_COLUMNS);
  if (patch.nextFollowUpAt !== undefined) data.nextFollowUpAt = toDate(patch.nextFollowUpAt);
  // An array is not a column pick: it replaces wholesale, and blank rows from a
  // half-filled form should never reach the database.
  if (patch.otherLinks !== undefined) data.otherLinks = cleanLinks(patch.otherLinks);
  // Companies and application are relations, so they are resolved by hand
  // rather than picked — and both are re-checked against this user.
  const companyIds = await resolveCompanyIds(userId, patch);
  if (companyIds !== undefined) {
    // Replace, like sources on an application: the caller sends the set they
    // want, not a delta.
    data.companies = { deleteMany: {}, create: companyIds.map((companyId) => ({ companyId })) };
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
  return flattenCompanies(await db.contact.update({ where: { id }, data, include: contactInclude }));
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
  const contacts = await db.contact.findMany({
    where: { userId, nextFollowUpAt: { lte: cutoff } },
    orderBy: { nextFollowUpAt: "asc" },
    include: { companies: { include: { company: true }, orderBy: { createdAt: "asc" } } },
  });
  return contacts.map(flattenCompanies);
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
      include: { companies: { include: { company: { select: { name: true } } } } },
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
      detail: [contact.title, ...contact.companies.map((link) => link.company.name)]
        .filter(Boolean)
        .join(" · "),
      company: contact.companies[0]?.company.name ?? null,
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export async function diagnoseSearch(userId: string): Promise<SearchDiagnosis> {
  const [applications, transitions] = await Promise.all([
    db.application.findMany({
      where: { userId },
      select: {
        id: true,
        stage: true,
        roleTitle: true,
        appliedAt: true,
        createdAt: true,
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
  // The same rule the board draws on a card, from src/lib/quiet.ts. It used to
  // be a closure here that read stage transitions only and fell back to
  // updatedAt — so logging a call left an application "stalled", and dragging
  // a card past another one (which writes a sort order) made a dead thread
  // look alive.
  const touched = await lastActivityByApplication(userId, applications.map((row) => row.id));
  const stalled = applications
    .map((application) => ({
      id: application.id,
      company: application.company.name,
      roleTitle: application.roleTitle,
      stage: application.stage,
      days: quietDaysFor(
        {
          stage: application.stage,
          createdAt: application.createdAt,
          appliedAt: application.appliedAt,
          lastActivityAt: touched.get(application.id) ?? null,
          lastStageChangeAt: byApplication.get(application.id)?.at(-1)?.occurredAt ?? null,
        },
        now,
      ),
    }))
    .filter((row) => hasGoneQuiet(row.stage, row.days, TERMINAL_STAGES))
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
