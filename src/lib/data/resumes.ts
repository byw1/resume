import { randomBytes } from "node:crypto";
import type { Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { pick } from "@/lib/data/patch";
import {
  blankSection,
  emptyResumeDoc,
  parseResumeDoc,
  rid,
  type ResumeDoc,
} from "@/lib/resume-schema";
import { getBrainSnapshot } from "@/lib/data/brain";

// Rendering helpers live in resume-text.ts (client-safe); re-exported so server
// callers can keep reaching them through this module.
export { resumeToText, estimateLines, estimatePages, LINES_PER_PAGE } from "@/lib/resume-text";

export type ResumeMeta = Partial<{
  name: string;
  targetRole: string;
  targetCompany: string;
  template: string;
  accent: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  pageMargin: number;
  notes: string;
  isFavorite: boolean;
  showPhoto: boolean;
}>;

export type ResumeListOpts = {
  /** Case-insensitive match against name, target role and target company. */
  search?: string;
  /** "recent" (favourites first, then latest) is the default. */
  sort?: "recent" | "name" | "used";
};

/**
 * A resume's track record, computed from the applications it went out with.
 *
 * This is the question the whole product is arranged around — "which version
 * of me gets callbacks" — and it can only be answered because the documents
 * and the pipeline share a database. An application counts as interviewed if
 * it sits at screen-or-later now, or if its timeline records an interview or
 * a move to one: current stage alone would forget every application that
 * interviewed and then closed, which is most of them.
 */
export type ResumeOutcomes = {
  /** Applications that actually went out — anything past WISHLIST. */
  sent: number;
  /** Of those, how many reached at least a screen. */
  interviewed: number;
  /** How many reached an offer. */
  offers: number;
};

const INTERVIEWED_STAGES: Stage[] = ["SCREEN", "INTERVIEW", "FINAL", "OFFER", "ACCEPTED"];
const OFFER_STAGES: Stage[] = ["OFFER", "ACCEPTED"];

export async function listResumes(userId: string, opts: ResumeListOpts = {}) {
  const search = opts.search?.trim();
  const orderBy: Prisma.ResumeOrderByWithRelationInput[] =
    opts.sort === "name"
      ? [{ name: "asc" }]
      : opts.sort === "used"
        ? [{ applications: { _count: "desc" } }, { updatedAt: "desc" }]
        : [{ isFavorite: "desc" }, { updatedAt: "desc" }];
  const rows = await db.resume.findMany({
    where: {
      userId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { targetRole: { contains: search, mode: "insensitive" as const } },
              { targetCompany: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy,
    include: {
      _count: { select: { applications: true } },
      // The base's name is what the lineage chip prints; one join beats a
      // per-card lookup.
      baseResume: { select: { id: true, name: true } },
      // Only what the outcome summary needs: the current stage, and the slice
      // of the timeline that proves an interview or an offer ever happened.
      applications: {
        select: {
          stage: true,
          activities: {
            where: {
              OR: [
                { type: "INTERVIEW" },
                { type: "OFFER" },
                { toStage: { in: INTERVIEWED_STAGES } },
              ],
            },
            select: { type: true, toStage: true },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const { applications, ...resume } = row;
    const outcomes: ResumeOutcomes = { sent: 0, interviewed: 0, offers: 0 };
    for (const application of applications) {
      if (application.stage === "WISHLIST") continue;
      outcomes.sent += 1;
      const reached = (stages: Stage[], type: "INTERVIEW" | "OFFER") =>
        stages.includes(application.stage) ||
        application.activities.some(
          (activity) =>
            activity.type === type || (activity.toStage !== null && stages.includes(activity.toStage)),
        );
      if (reached(INTERVIEWED_STAGES, "INTERVIEW")) outcomes.interviewed += 1;
      if (reached(OFFER_STAGES, "OFFER")) outcomes.offers += 1;
    }
    return { ...resume, outcomes };
  });
}

export async function getResume(userId: string, id: string) {
  const resume = await db.resume.findFirst({ where: { id, userId } });
  if (!resume) return null;
  return { ...resume, doc: parseResumeDoc(resume.data), photo: await resumePhoto(userId, resume) };
}

/**
 * The headshot a document should render, or "".
 *
 * The picture is never copied into the resume — it is read from the owner's
 * profile at render time, which is the whole point of one photo across every
 * document. Reading it here rather than in each page means the editor preview,
 * the print page, the PDF and the public link cannot disagree about whether a
 * face appears.
 */
async function resumePhoto(userId: string, resume: { showPhoto: boolean }) {
  if (!resume.showPhoto) return "";
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { photo: true },
  });
  return profile?.photo ?? "";
}

export async function createResume(
  userId: string,
  input: ResumeMeta & { data?: unknown; seedFromBrain?: boolean; baseResumeId?: string },
) {
  const doc = input.data
    ? parseResumeDoc(input.data)
    : input.seedFromBrain
      ? await buildDocFromBrain(userId)
      : emptyResumeDoc();

  // Lineage may only point at the caller's own resume — the id arrives from
  // outside, and the foreign key alone would happily cross tenants.
  if (input.baseResumeId) {
    const base = await db.resume.findFirst({
      where: { id: input.baseResumeId, userId },
      select: { id: true },
    });
    if (!base) throw new Error(`No resume with id ${input.baseResumeId}`);
  }

  return db.resume.create({
    data: {
      userId,
      baseResumeId: input.baseResumeId ?? null,
      name: input.name?.trim() || "Untitled resume",
      targetRole: input.targetRole ?? "",
      targetCompany: input.targetCompany ?? "",
      template: input.template ?? "harvard",
      accent: input.accent ?? "#000000",
      fontFamily: input.fontFamily ?? "serif",
      fontSize: input.fontSize ?? 10,
      lineHeight: input.lineHeight ?? 1.2,
      pageMargin: input.pageMargin ?? 48,
      notes: input.notes ?? "",
      showPhoto: input.showPhoto ?? false,
      data: doc as unknown as object,
    },
  });
}

const RESUME_COLUMNS = [
  "name", "targetRole", "targetCompany", "template", "accent", "fontFamily",
  "fontSize", "lineHeight", "pageMargin", "notes", "isFavorite", "showPhoto",
] as const;

export async function updateResume(
  userId: string,
  id: string,
  patch: ResumeMeta & { data?: unknown },
) {
  // slug / visibility / publishedAt are deliberately absent: publishing goes
  // through publishResume, which allocates an unguessable slug and keeps the
  // promise that a withdrawn address stays dead.
  const data: Record<string, unknown> = pick(patch, RESUME_COLUMNS);
  if (patch.data !== undefined) data.data = parseResumeDoc(patch.data) as unknown as object;
  // A patch of nothing-we-recognise leaves Prisma with no columns to write, and
  // updateMany then reports zero rows — which would raise "no such resume" for a
  // resume that plainly exists. Check ownership directly instead.
  if (Object.keys(data).length === 0) {
    const current = await db.resume.findFirst({ where: { id, userId } });
    if (!current) throw new Error(`No resume with id ${id}`);
    return current;
  }
  const { count } = await db.resume.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No resume with id ${id}`);
  return db.resume.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteResume(userId: string, id: string) {
  const { count } = await db.resume.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No resume with id ${id}`);
  return { id };
}

export async function duplicateResume(userId: string, id: string, name?: string) {
  const source = await db.resume.findFirst({ where: { id, userId } });
  if (!source) throw new Error(`No resume with id ${id}`);
  return db.resume.create({
    data: {
      userId,
      name: name ?? `${source.name} (copy)`,
      targetRole: source.targetRole,
      targetCompany: source.targetCompany,
      template: source.template,
      accent: source.accent,
      fontFamily: source.fontFamily,
      fontSize: source.fontSize,
      lineHeight: source.lineHeight,
      pageMargin: source.pageMargin,
      showPhoto: source.showPhoto,
      notes: source.notes,
      data: source.data as object,
      // The copy remembers what it was tailored from — flattened to the root,
      // so a copy of a variant still points at the base and lineage stays one
      // level deep, which is all the grid or the diff ever shows.
      baseResumeId: source.baseResumeId ?? source.id,
    },
  });
}

/**
 * Builds a complete first-draft resume document straight from the brain.
 * Every role becomes an experience entry; its strongest highlights become the
 * bullets. This is what "New resume from my brain" and the MCP
 * `create_resume(seed_from_brain: true)` call use.
 */

/**
 * A highlight's printable bullet.
 *
 * `impact` is a separate structured field, but a polished highlight almost
 * always already states its own number — people write "Cut p95 latency 40%" in
 * `text` and then fill `impact` with the same thing. Appending unconditionally
 * printed it twice, which made most seeded bullets unusable on first run. So
 * append only when it genuinely adds something.
 */
function bulletFor(text: string, impact: string) {
  const trimmed = impact.trim();
  if (!trimmed) return text;
  const flatten = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return flatten(text).includes(flatten(trimmed)) ? text : `${text} — ${trimmed}`;
}

export async function buildDocFromBrain(userId: string): Promise<ResumeDoc> {
  const { profile, roles, highlights, education, projects, skillGroups, certifications } =
    await getBrainSnapshot(userId);

  const links = [
    profile.website && { label: "Website", url: profile.website },
    profile.linkedin && { label: "LinkedIn", url: profile.linkedin },
    profile.github && { label: "GitHub", url: profile.github },
  ].filter(Boolean) as { label: string; url: string }[];

  const doc: ResumeDoc = {
    header: {
      name: profile.fullName,
      title: profile.headline,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      links,
    },
    sections: [],
  };

  const summary = blankSection("summary");
  summary.text = profile.summary;
  doc.sections.push(summary);

  const experience = blankSection("experience");
  experience.experience = roles.map((role) => ({
    id: rid("exp"),
    roleId: role.id,
    company: role.company,
    title: role.title,
    location: role.location,
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    summary: role.summary,
    bullets: highlights
      .filter((h) => h.roleId === role.id)
      .slice(0, 6)
      .map((h) => bulletFor(h.text, h.impact)),
  }));
  doc.sections.push(experience);

  if (projects.length) {
    const section = blankSection("projects");
    section.projects = projects.map((p) => ({
      id: rid("prj"),
      name: p.name,
      role: p.role,
      url: p.url,
      startDate: p.startDate,
      endDate: p.endDate,
      description: p.description,
      bullets: [],
    }));
    doc.sections.push(section);
  }

  if (education.length) {
    const section = blankSection("education");
    section.education = education.map((e) => ({
      id: rid("edu"),
      school: e.school,
      degree: e.degree,
      field: e.field,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      details: e.details ? [e.details] : [],
    }));
    doc.sections.push(section);
  }

  if (skillGroups.length) {
    const section = blankSection("skills");
    section.skills = skillGroups.map((g) => ({ name: g.name, skills: g.skills }));
    doc.sections.push(section);
  }

  if (certifications.length) {
    const section = blankSection("certifications");
    section.certifications = certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      date: c.date,
    }));
    doc.sections.push(section);
  }

  return doc;
}

/** Flat plain-text rendering — handy for Claude to review its own output. */
// ---------------------------------------------------------------------------
// Publishing — a resume gets a URL you can paste into an application form
// ---------------------------------------------------------------------------

/**
 * Slugs are the entire privacy model for an unlisted resume, so the random part
 * carries the weight: 12 base32 characters is ~60 bits, which is not guessable
 * and not enumerable. The readable stem is there so the link doesn't look like
 * spam when you paste it — it only ever contains the resume's own name, which
 * whoever you send it to is about to read anyway.
 */
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes

function randomSuffix(bytes = 12) {
  const buffer = randomBytes(bytes);
  let out = "";
  for (const byte of buffer) out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  return out;
}

function slugStem(name: string) {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return stem || "resume";
}

/**
 * Publish a resume at /r/<slug> and return the row.
 *
 * Idempotent while published: calling it again keeps the same slug, so a link
 * already sent out doesn't rot. Publishing something that was unpublished mints
 * a NEW slug, because the old link was withdrawn deliberately and reviving it
 * would undo that.
 */
export async function publishResume(userId: string, id: string) {
  const resume = await db.resume.findFirst({ where: { id, userId } });
  if (!resume) throw new Error(`No resume with id ${id}`);

  if (resume.visibility === "UNLISTED" && resume.slug) return resume;

  // The unique index is the real arbiter; retry on the (vanishingly unlikely)
  // collision rather than trusting a pre-check that another request can race.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${slugStem(resume.name)}-${randomSuffix()}`;
    try {
      const { count } = await db.resume.updateMany({
        where: { id, userId },
        data: { slug, visibility: "UNLISTED", publishedAt: new Date() },
      });
      if (count === 0) throw new Error(`No resume with id ${id}`);
      return db.resume.findFirstOrThrow({ where: { id, userId } });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "P2002") throw error;
    }
  }
  throw new Error("Could not allocate a unique link. Try again.");
}

/**
 * Withdraw the public link. The slug is cleared, not just hidden, so the URL is
 * dead for good — publishing again gives a different one.
 */
export async function unpublishResume(userId: string, id: string) {
  const { count } = await db.resume.updateMany({
    where: { id, userId },
    data: { slug: null, visibility: "PRIVATE", publishedAt: null },
  });
  if (count === 0) throw new Error(`No resume with id ${id}`);
  return db.resume.findFirstOrThrow({ where: { id, userId } });
}

/**
 * THE ONE ANONYMOUS READ IN THIS DIRECTORY.
 *
 * Every other function here takes a userId first and filters on it, which is
 * how the compiler keeps tenants apart. A public page has no user, so this one
 * cannot — and that makes it the single place where a mistake is a data leak
 * rather than a type error. It is therefore deliberately narrow:
 *
 *   - it filters on visibility, so a correct slug for a resume that was never
 *     published (or has been withdrawn) returns null rather than the document;
 *   - it returns ONLY what the page renders. `notes` are the owner's private
 *     tailoring notes and must never appear here; nor does userId, nor the
 *     applications this resume is attached to.
 *
 * Do not widen the select. If a public page needs another field, add it here
 * explicitly and ask whether it is really safe to show a stranger.
 */
export async function getResumeBySlug(slug: string) {
  if (!slug) return null;
  const resume = await db.resume.findFirst({
    where: { slug, visibility: "UNLISTED" },
    select: {
      name: true,
      data: true,
      template: true,
      accent: true,
      fontFamily: true,
      fontSize: true,
      lineHeight: true,
      pageMargin: true,
      showPhoto: true,
      updatedAt: true,
      // Only to look up the owner's photo below, and dropped before this
      // returns: the public page renders a document, and the id of the person
      // behind it is not part of one.
      userId: true,
    },
  });
  if (!resume) return null;

  // Publishing a resume with the photo switched on is the consent, and it is
  // the only thing about the owner this reads. With it off nothing is fetched
  // at all — the picture is not loaded and then hidden.
  const photo = await resumePhoto(resume.userId, resume);
  const { userId, ...row } = resume;
  return { ...row, doc: parseResumeDoc(resume.data), photo };
}
