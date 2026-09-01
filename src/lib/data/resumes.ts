import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { pick } from "@/lib/data/patch";
import {
  blankSection,
  emptyResumeDoc,
  parseResumeDoc,
  rid,
  type ResumeDoc,
} from "@/lib/resume-schema";
import { getBrainSnapshot, listHighlights } from "@/lib/data/brain";
import { bulletSimilarity, diffResumeDocs } from "@/lib/resume-diff";

// Rendering helpers live in resume-text.ts (client-safe); re-exported so server
// callers can keep reaching them through this module.
export { resumeToText, estimateLines } from "@/lib/resume-text";

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

export async function listResumes(userId: string) {
  return db.resume.findMany({
    where: { userId },
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { applications: true, variants: true } },
      // What it was tailored from, so a grid of eight documents says which one
      // is the original rather than making you open them to find out.
      base: { select: { id: true, name: true } },
    },
  });
}

export async function getResume(userId: string, id: string) {
  const resume = await db.resume.findFirst({
    where: { id, userId },
    include: {
      base: { select: { id: true, name: true } },
      variants: { select: { id: true, name: true }, orderBy: { updatedAt: "desc" } },
      // Where this document actually went. The loop was half-built: an
      // application named its resume and a resume named nothing back, so
      // "which jobs did I send this to" meant reading the pipeline.
      applications: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          roleTitle: true,
          stage: true,
          appliedAt: true,
          company: { select: { id: true, name: true, website: true } },
        },
      },
    },
  });
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
  input: ResumeMeta & { data?: unknown; seedFromBrain?: boolean },
) {
  const doc = input.data
    ? parseResumeDoc(input.data)
    : input.seedFromBrain
      ? await buildDocFromBrain(userId)
      : emptyResumeDoc();

  return db.resume.create({
    data: {
      userId,
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

/**
 * Which document somebody means by "my resume".
 *
 * The original, not a copy: something with variants hanging off it and no base
 * of its own. A favourite wins among equals, because starring one is the
 * clearest statement a person can make about which it is. Returns null for an
 * empty workspace, which the caller has to handle rather than guess around.
 */
export async function pickBaseResume(userId: string) {
  const rows = await db.resume.findMany({
    where: { userId },
    include: { _count: { select: { variants: true } } },
    orderBy: { updatedAt: "desc" },
  });
  if (rows.length === 0) return null;
  const originals = rows.filter((row) => row.baseResumeId === null);
  const pool = originals.length > 0 ? originals : rows;
  return (
    pool.find((row) => row.isFavorite) ??
    [...pool].sort((a, b) => b._count.variants - a._count.variants)[0]
  );
}

/**
 * The four-step move this app made everybody do by hand: copy the base, rename
 * it for the job, attach it, open it.
 *
 * With nothing to copy it builds the first document straight from the brain
 * rather than refusing — a new user asking for a tailored resume should get
 * one, not an error telling them to go and make a resume first.
 */
export async function createResumeForApplication(
  userId: string,
  applicationId: string,
  options?: { baseId?: string; name?: string },
) {
  const application = await db.application.findFirst({
    where: { id: applicationId, userId },
    include: { company: { select: { name: true } } },
  });
  if (!application) throw new Error(`No application with id ${applicationId}`);

  const base = options?.baseId
    ? await db.resume.findFirst({ where: { id: options.baseId, userId } })
    : await pickBaseResume(userId);
  if (options?.baseId && !base) throw new Error(`No resume with id ${options.baseId}`);

  const name = options?.name?.trim() || `${application.company.name} — ${application.roleTitle}`;

  const created = base
    ? await duplicateResume(userId, base.id, name)
    : await createResume(userId, { name, seedFromBrain: true });

  const resume = await db.resume.update({
    where: { id: created.id },
    data: { targetCompany: application.company.name, targetRole: application.roleTitle },
  });

  await db.application.update({ where: { id: applicationId }, data: { resumeId: resume.id } });

  return {
    resume,
    basedOn: base ? { id: base.id, name: base.name } : null,
    seededFromBrain: !base,
    attachedTo: { id: application.id, company: application.company.name, roleTitle: application.roleTitle },
  };
}

/**
 * Point a resume at the one it was tailored from, or unlink it.
 *
 * Refuses itself and refuses a cycle: A tailored from B tailored from A is a
 * lineage that cannot be read in either direction, and the diff panel would
 * follow it forever. Both resumes are re-checked against this user — the
 * relation has no userId of its own.
 */
export async function setResumeBase(userId: string, id: string, baseResumeId: string | null) {
  const resume = await db.resume.findFirst({ where: { id, userId } });
  if (!resume) throw new Error(`No resume with id ${id}`);
  if (baseResumeId === null) {
    return db.resume.update({ where: { id }, data: { baseResumeId: null } });
  }
  if (baseResumeId === id) throw new Error("A resume cannot be tailored from itself.");

  let cursor: string | null = baseResumeId;
  const seen = new Set<string>([id]);
  while (cursor) {
    if (seen.has(cursor)) throw new Error("That would make a loop: the two are already related.");
    seen.add(cursor);
    const next: { baseResumeId: string | null } | null = await db.resume.findFirst({
      where: { id: cursor, userId },
      select: { baseResumeId: true },
    });
    if (!next) throw new Error(`No resume with id ${cursor}`);
    cursor = next.baseResumeId;
  }
  return db.resume.update({ where: { id }, data: { baseResumeId } });
}

/**
 * What changed between a resume and the one it was tailored from.
 *
 * Pass baseId to compare against something else — two variants against each
 * other, say. Without a base on either side there is nothing to answer with,
 * and saying so is more use than an empty diff that looks like "no changes".
 */
export async function diffResume(userId: string, id: string, baseId?: string) {
  const resume = await db.resume.findFirst({
    where: { id, userId },
    include: { base: { select: { id: true, name: true } } },
  });
  if (!resume) throw new Error(`No resume with id ${id}`);

  const compareTo = baseId ?? resume.baseResumeId;
  if (!compareTo) {
    return {
      resume: { id: resume.id, name: resume.name },
      base: null,
      diff: null,
      note: "This resume has no base on file, so there is nothing to compare it against. Use set_resume_base to say which document it was tailored from, or pass baseId to compare against a specific one.",
    };
  }
  const base = await db.resume.findFirst({ where: { id: compareTo, userId } });
  if (!base) throw new Error(`No resume with id ${compareTo}`);

  return {
    resume: { id: resume.id, name: resume.name },
    base: { id: base.id, name: base.name },
    diff: diffResumeDocs(parseResumeDoc(base.data), parseResumeDoc(resume.data)),
    note: null,
  };
}

/** One bullet, and the brain material that stands behind it. */
export type BulletEvidence = {
  /** Where the bullet sits: "Staff Engineer — Stripe". */
  entry: string;
  bullet: string;
  /** Best matches first, strongest three at most. */
  evidence: {
    highlightId: string;
    text: string;
    role: string;
    /** 0-1 word overlap with the bullet. 1 means it was used verbatim. */
    similarity: number;
  }[];
};

/**
 * Which brain material backs each claim in a document.
 *
 * Derived rather than recorded, deliberately. A provenance field written when
 * a document is seeded from the brain would be right for those documents and
 * silently wrong for every one an assistant wrote or a person edited — and a
 * wrong provenance record is worse than none, because it is believed. This
 * measures instead: same similarity the diff pairs a reworded bullet with.
 *
 * A bullet with no evidence is not an accusation. It means the claim is not in
 * the brain yet — which is exactly the list worth walking before an interview,
 * since those are the lines you cannot expand on from your own notes.
 */
export async function traceResumeEvidence(userId: string, id: string) {
  const resume = await db.resume.findFirst({ where: { id, userId } });
  if (!resume) throw new Error(`No resume with id ${id}`);
  const highlights = await listHighlights(userId);
  const doc = parseResumeDoc(resume.data);

  const rows: BulletEvidence[] = [];
  for (const section of doc.sections) {
    for (const item of section.experience) {
      const entry = [item.title, item.company].filter(Boolean).join(" — ") || "Role";
      // A bullet under a role that came from the brain is scored against that
      // role's own highlights first: crediting a Stripe line to a highlight
      // from another employer is the failure that discredits the whole thing.
      // When the entry names a role, ONLY that role's material can back it.
      // Falling back to the whole brain when the role has no highlights broke
      // this in the one case the scoping exists for: a Stripe bullet credited
      // at 100% to a note recorded against another employer, and an unbacked
      // count of zero — the opposite of what the list is for.
      const candidates = item.roleId
        ? highlights.filter((highlight) => highlight.roleId === item.roleId)
        : highlights;
      for (const bullet of item.bullets) {
        const evidence = candidates
          .map((highlight) => ({
            highlightId: highlight.id,
            text: highlight.text,
            role: [highlight.role?.title, highlight.role?.company].filter(Boolean).join(" — "),
            similarity: Math.round(bulletSimilarity(highlight.text, bullet) * 100) / 100,
          }))
          .filter((row) => row.similarity >= 0.3)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 3);
        rows.push({ entry, bullet, evidence });
      }
    }
  }
  return {
    resume: { id: resume.id, name: resume.name },
    bullets: rows,
    unbacked: rows.filter((row) => row.evidence.length === 0).length,
  };
}

export async function deleteResume(userId: string, id: string) {
  const { count } = await db.resume.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No resume with id ${id}`);
  return { id };
}

/**
 * A copy that remembers where it came from.
 *
 * The base is the source itself, not the source's own base: a chain of copies
 * of copies is a chain nobody can read, and the useful comparison is always
 * against the document you started from.
 */
export async function duplicateResume(userId: string, id: string, name?: string) {
  const source = await db.resume.findFirst({ where: { id, userId } });
  if (!source) throw new Error(`No resume with id ${id}`);
  return db.resume.create({
    data: {
      userId,
      baseResumeId: source.id,
      name: name ?? `${source.name} (copy)`,
      targetRole: source.targetRole,
      targetCompany: source.targetCompany,
      template: source.template,
      accent: source.accent,
      fontFamily: source.fontFamily,
      fontSize: source.fontSize,
      lineHeight: source.lineHeight,
      pageMargin: source.pageMargin,
      // Copied like every other setting. Leaving it out meant duplicating a
      // resume that shows your face quietly produced one that does not.
      showPhoto: source.showPhoto,
      notes: source.notes,
      data: source.data as object,
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
