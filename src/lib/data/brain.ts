import type { NoteKind } from "@prisma/client";
import { db } from "@/lib/db";
import { pick } from "@/lib/data/patch";
import { resolvePhoto } from "@/lib/photo";

/**
 * Every function here takes the owning userId as its first argument, and every
 * query filters on it. Making it a required positional parameter rather than an
 * optional field means the compiler rejects any call site that forgets it —
 * which is the whole defence against one tenant reading another's data.
 */

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * A patch that narrows to nothing still has to say whether the record exists —
 * and say it the same way the write path does, rather than surfacing a Prisma
 * stack trace to whoever called the tool.
 */
async function existingOrThrow<T>(
  model: { findFirst: (args: { where: { id: string; userId: string } }) => Promise<T | null> },
  id: string,
  userId: string,
  label: string,
): Promise<T> {
  const found = await model.findFirst({ where: { id, userId } });
  if (!found) throw new Error(`No ${label} with id ${id}`);
  return found;
}

export async function getProfile(userId: string) {
  const existing = await db.profile.findUnique({ where: { userId } });
  if (existing) return existing;
  return db.profile.create({ data: { userId } });
}

export type ProfilePatch = Partial<{
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
  github: string;
  twitter: string;
  summary: string;
  brainDump: string;
}>;

const PROFILE_COLUMNS = [
  "fullName", "headline", "email", "phone", "location", "website",
  "linkedin", "github", "twitter", "summary", "brainDump",
] as const;

export async function updateProfile(userId: string, patch: ProfilePatch) {
  await getProfile(userId);
  return db.profile.update({ where: { userId }, data: pick(patch, PROFILE_COLUMNS) });
}

/**
 * Set or clear the profile photo.
 *
 * Takes what a person or an assistant actually has — a data URI from the file
 * picker, or a https link to a picture that already exists somewhere — and does
 * the resolving here so the settings page and `set_profile_photo` cannot end up
 * enforcing different limits. An empty string removes the photo.
 */
export async function setProfilePhoto(userId: string, input: string) {
  const resolved = await resolvePhoto(input);
  await getProfile(userId);
  await db.profile.update({ where: { userId }, data: { photo: resolved?.dataUri ?? "" } });
  return resolved
    ? { photo: true, bytes: resolved.bytes, type: resolved.type }
    : { photo: false, bytes: 0, type: "" };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type RoleInput = {
  company: string;
  title: string;
  employmentType?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  summary?: string;
  brainDump?: string;
  tags?: string[];
};

export async function listRoles(userId: string) {
  return db.role.findMany({
    where: { userId },
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { highlights: true } } },
  });
}

export async function getRole(userId: string, id: string) {
  return db.role.findFirst({
    where: { id, userId },
    include: { highlights: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
}

export async function createRole(userId: string, input: RoleInput) {
  const count = await db.role.count({ where: { userId } });
  return db.role.create({
    data: {
      userId,
      company: input.company,
      title: input.title,
      employmentType: input.employmentType ?? "Full-time",
      location: input.location ?? "",
      startDate: input.startDate ?? "",
      endDate: input.endDate ?? "",
      isCurrent: input.isCurrent ?? false,
      summary: input.summary ?? "",
      brainDump: input.brainDump ?? "",
      tags: input.tags ?? [],
      sortOrder: count,
    },
  });
}

const ROLE_COLUMNS = [
  "company", "title", "employmentType", "location", "startDate", "endDate",
  "isCurrent", "summary", "brainDump", "tags",
] as const;

export async function updateRole(userId: string, id: string, patch: Partial<RoleInput>) {
  const data = pick(patch, ROLE_COLUMNS);
  if (Object.keys(data).length === 0) return existingOrThrow(db.role, id, userId, "role");
  const { count } = await db.role.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No role with id ${id}`);
  return db.role.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteRole(userId: string, id: string) {
  const { count } = await db.role.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No role with id ${id}`);
  return { id };
}

/** Non-destructive: adds text to the end of the role's brain dump. */
export async function appendToRoleBrainDump(
  userId: string,
  id: string,
  text: string,
  heading?: string,
) {
  const role = await db.role.findFirst({ where: { id, userId } });
  if (!role) throw new Error(`No role with id ${id}`);
  const stamp = heading ? `\n\n## ${heading}\n` : "\n\n";
  const next = `${role.brainDump}${role.brainDump ? stamp : heading ? `## ${heading}\n` : ""}${text}`.trim();
  return db.role.update({ where: { id: role.id }, data: { brainDump: next } });
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

export type HighlightInput = {
  roleId?: string | null;
  text: string;
  impact?: string;
  tags?: string[];
  strength?: number;
};

export async function listHighlights(userId: string, roleId?: string) {
  return db.highlight.findMany({
    where: { userId, archived: false, ...(roleId ? { roleId } : {}) },
    orderBy: [{ strength: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { role: { select: { id: true, company: true, title: true } } },
  });
}

export async function createHighlight(userId: string, input: HighlightInput) {
  // A highlight may only hang off a role the same user owns.
  if (input.roleId) {
    const role = await db.role.findFirst({ where: { id: input.roleId, userId } });
    if (!role) throw new Error(`No role with id ${input.roleId}`);
  }
  return db.highlight.create({
    data: {
      userId,
      roleId: input.roleId ?? null,
      text: input.text,
      impact: input.impact ?? "",
      tags: input.tags ?? [],
      strength: clamp(input.strength ?? 3, 1, 5),
    },
  });
}

export async function createHighlights(userId: string, inputs: HighlightInput[]) {
  const created = [];
  for (const input of inputs) created.push(await createHighlight(userId, input));
  return created;
}

const HIGHLIGHT_COLUMNS = ["roleId", "text", "impact", "tags", "strength", "archived"] as const;

export async function updateHighlight(
  userId: string,
  id: string,
  patch: Partial<HighlightInput> & { archived?: boolean },
) {
  // Re-parenting is a read of whatever it points at — listHighlights and
  // searchBrain join the role in — so the new parent must be the caller's own,
  // exactly as createHighlight already checks.
  if (patch.roleId) {
    const role = await db.role.findFirst({ where: { id: patch.roleId, userId } });
    if (!role) throw new Error(`No role with id ${patch.roleId}`);
  }
  const data = pick(patch, HIGHLIGHT_COLUMNS) as Record<string, unknown>;
  if (typeof patch.strength === "number") data.strength = clamp(patch.strength, 1, 5);
  if (Object.keys(data).length === 0) return existingOrThrow(db.highlight, id, userId, "highlight");
  const { count } = await db.highlight.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No highlight with id ${id}`);
  return db.highlight.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteHighlight(userId: string, id: string) {
  const { count } = await db.highlight.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No highlight with id ${id}`);
  return { id };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function listNotes(userId: string) {
  return db.note.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { pinned: "desc" }, { updatedAt: "desc" }],
  });
}

/**
 * The user's standing rules, for the briefing every client gets on connect.
 *
 * Kept deliberately small and ordered oldest-first so the briefing is stable
 * between sessions — a rule that moves around in the text reads as a different
 * rule. Capping happens at the call site, which knows the budget.
 */
export async function listGuardrails(userId: string) {
  return db.note.findMany({
    where: { userId, kind: "GUARDRAIL" },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, body: true },
  });
}

export async function createNote(
  userId: string,
  input: { title: string; body?: string; tags?: string[]; pinned?: boolean; kind?: NoteKind },
) {
  return db.note.create({
    data: {
      userId,
      title: input.title,
      body: input.body ?? "",
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
      kind: input.kind ?? "NOTE",
    },
  });
}

export async function updateNote(
  userId: string,
  id: string,
  patch: Partial<{ title: string; body: string; tags: string[]; pinned: boolean; kind: NoteKind }>,
) {
  const data = pick(patch, ["title", "body", "tags", "pinned", "kind"] as const);
  if (Object.keys(data).length === 0) return existingOrThrow(db.note, id, userId, "note");
  const { count } = await db.note.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No note with id ${id}`);
  return db.note.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteNote(userId: string, id: string) {
  const { count } = await db.note.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No note with id ${id}`);
  return { id };
}

// ---------------------------------------------------------------------------
// Education / Projects / Skills / Certifications
// ---------------------------------------------------------------------------

export async function listEducation(userId: string) {
  return db.education.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { endDate: "desc" }] });
}

export async function createEducation(
  userId: string,
  input: {
    school: string;
    degree?: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    details?: string;
  },
) {
  const count = await db.education.count({ where: { userId } });
  return db.education.create({ data: { ...input, userId, sortOrder: count } });
}

export type EducationPatch = Partial<{
  school: string;
  degree: string;
  field: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa: string;
  details: string;
}>;

export async function updateEducation(userId: string, id: string, patch: EducationPatch) {
  const data = pick(patch, [
    "school", "degree", "field", "location", "startDate", "endDate", "gpa", "details",
  ] as const);
  if (Object.keys(data).length === 0) return existingOrThrow(db.education, id, userId, "education entry");
  const { count } = await db.education.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No education entry with id ${id}`);
  return db.education.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteEducation(userId: string, id: string) {
  const { count } = await db.education.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No education entry with id ${id}`);
  return { id };
}

export async function listProjects(userId: string) {
  return db.project.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
}

export async function createProject(
  userId: string,
  input: {
    name: string;
    role?: string;
    url?: string;
    description?: string;
    brainDump?: string;
    tags?: string[];
    startDate?: string;
    endDate?: string;
  },
) {
  const count = await db.project.count({ where: { userId } });
  return db.project.create({
    data: { ...input, userId, tags: input.tags ?? [], sortOrder: count },
  });
}

export type ProjectPatch = Partial<{
  name: string;
  role: string;
  url: string;
  description: string;
  brainDump: string;
  tags: string[];
  startDate: string;
  endDate: string;
}>;

export async function updateProject(userId: string, id: string, patch: ProjectPatch) {
  const data = pick(patch, [
    "name", "role", "url", "description", "brainDump", "tags", "startDate", "endDate",
  ] as const);
  if (Object.keys(data).length === 0) return existingOrThrow(db.project, id, userId, "project");
  const { count } = await db.project.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No project with id ${id}`);
  return db.project.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteProject(userId: string, id: string) {
  const { count } = await db.project.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No project with id ${id}`);
  return { id };
}

export async function listSkillGroups(userId: string) {
  return db.skillGroup.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } });
}

export async function createSkillGroup(userId: string, input: { name: string; skills?: string[] }) {
  const count = await db.skillGroup.count({ where: { userId } });
  return db.skillGroup.create({
    data: { userId, name: input.name, skills: input.skills ?? [], sortOrder: count },
  });
}

export async function updateSkillGroup(
  userId: string,
  id: string,
  patch: { name?: string; skills?: string[] },
) {
  const data = pick(patch, ["name", "skills"] as const);
  if (Object.keys(data).length === 0) return existingOrThrow(db.skillGroup, id, userId, "skill group");
  const { count } = await db.skillGroup.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No skill group with id ${id}`);
  return db.skillGroup.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteSkillGroup(userId: string, id: string) {
  const { count } = await db.skillGroup.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No skill group with id ${id}`);
  return { id };
}

export async function listCertifications(userId: string) {
  return db.certification.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } });
}

export async function createCertification(
  userId: string,
  input: { name: string; issuer?: string; date?: string; url?: string },
) {
  const count = await db.certification.count({ where: { userId } });
  return db.certification.create({ data: { ...input, userId, sortOrder: count } });
}

export type CertificationPatch = Partial<{
  name: string;
  issuer: string;
  date: string;
  url: string;
}>;

export async function updateCertification(userId: string, id: string, patch: CertificationPatch) {
  const data = pick(patch, ["name", "issuer", "date", "url"] as const);
  if (Object.keys(data).length === 0) return existingOrThrow(db.certification, id, userId, "certification");
  const { count } = await db.certification.updateMany({ where: { id, userId }, data });
  if (count === 0) throw new Error(`No certification with id ${id}`);
  return db.certification.findFirstOrThrow({ where: { id, userId } });
}

export async function deleteCertification(userId: string, id: string) {
  const { count } = await db.certification.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No certification with id ${id}`);
  return { id };
}

// ---------------------------------------------------------------------------
// Search — the function Claude leans on hardest
// ---------------------------------------------------------------------------

export type BrainHit = {
  kind: "profile" | "role" | "highlight" | "note" | "project";
  id: string;
  title: string;
  subtitle: string;
  excerpt: string;
  score: number;
};

function scoreText(haystack: string, terms: string[]) {
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const term of terms) {
    let index = lower.indexOf(term);
    while (index !== -1) {
      score += 1;
      index = lower.indexOf(term, index + term.length);
    }
  }
  return score;
}

function excerptAround(haystack: string, terms: string[], radius = 180) {
  const lower = haystack.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1 && (at === -1 || index < at)) at = index;
  }
  if (at === -1) return haystack.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius / 2);
  const slice = haystack.slice(start, start + radius * 2).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + radius * 2 < haystack.length ? "…" : ""}`;
}

/**
 * Ranked full-text search across everything in one user's brain. Deliberately
 * done in application code rather than Postgres FTS so it works identically on
 * a fresh database with zero extensions to configure.
 */
export async function searchBrain(userId: string, query: string, limit = 25): Promise<BrainHit[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9+#.-]/g, ""))
    .filter((t) => t.length > 1);

  const [profile, roles, highlights, notes, projects] = await Promise.all([
    getProfile(userId),
    db.role.findMany({ where: { userId } }),
    db.highlight.findMany({
      where: { userId, archived: false },
      include: { role: { select: { company: true, title: true } } },
    }),
    db.note.findMany({ where: { userId } }),
    db.project.findMany({ where: { userId } }),
  ]);

  const hits: BrainHit[] = [];

  if (terms.length === 0) {
    for (const role of roles.slice(0, limit)) {
      hits.push({
        kind: "role",
        id: role.id,
        title: `${role.title} @ ${role.company}`,
        subtitle: [role.startDate, role.isCurrent ? "Present" : role.endDate]
          .filter(Boolean)
          .join(" – "),
        excerpt: role.brainDump.slice(0, 240),
        score: 1,
      });
    }
    return hits;
  }

  const profileBlob = [profile.summary, profile.brainDump, profile.headline].join("\n");
  const profileScore = scoreText(profileBlob, terms);
  if (profileScore > 0) {
    hits.push({
      kind: "profile",
      id: profile.id,
      title: profile.fullName || "Profile",
      subtitle: profile.headline,
      excerpt: excerptAround(profileBlob, terms),
      score: profileScore,
    });
  }

  for (const role of roles) {
    const blob = [role.company, role.title, role.summary, role.brainDump, role.tags.join(" ")].join(
      "\n",
    );
    const score = scoreText(blob, terms) + scoreText(`${role.company} ${role.title}`, terms) * 3;
    if (score > 0) {
      hits.push({
        kind: "role",
        id: role.id,
        title: `${role.title} @ ${role.company}`,
        subtitle: [role.startDate, role.isCurrent ? "Present" : role.endDate]
          .filter(Boolean)
          .join(" – "),
        excerpt: excerptAround(blob, terms),
        score,
      });
    }
  }

  for (const h of highlights) {
    const blob = [h.text, h.impact, h.tags.join(" ")].join("\n");
    const score = scoreText(blob, terms) * 2 + h.strength * 0.1;
    if (scoreText(blob, terms) > 0) {
      hits.push({
        kind: "highlight",
        id: h.id,
        title: h.text,
        subtitle: h.role ? `${h.role.title} @ ${h.role.company}` : "Unassigned",
        excerpt: h.impact,
        score,
      });
    }
  }

  for (const n of notes) {
    const blob = [n.title, n.body, n.tags.join(" ")].join("\n");
    const score = scoreText(blob, terms);
    if (score > 0) {
      hits.push({
        kind: "note",
        id: n.id,
        title: n.title,
        subtitle: n.tags.join(", "),
        excerpt: excerptAround(blob, terms),
        score,
      });
    }
  }

  for (const p of projects) {
    const blob = [p.name, p.role, p.description, p.brainDump, p.tags.join(" ")].join("\n");
    const score = scoreText(blob, terms);
    if (score > 0) {
      hits.push({
        kind: "project",
        id: p.id,
        title: p.name,
        subtitle: p.role,
        excerpt: excerptAround(blob, terms),
        score,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Everything in one payload — used to seed a resume and by `get_brain_snapshot`. */
export async function getBrainSnapshot(userId: string) {
  const [profile, roles, highlights, education, projects, skillGroups, certifications, notes] =
    await Promise.all([
      getProfile(userId),
      listRoles(userId),
      listHighlights(userId),
      listEducation(userId),
      listProjects(userId),
      listSkillGroups(userId),
      listCertifications(userId),
      listNotes(userId),
    ]);
  return { profile, roles, highlights, education, projects, skillGroups, certifications, notes };
}

/**
 * Whether there is anything here yet.
 *
 * The briefing every MCP client receives branches on this, so it runs on every
 * `initialize` — which is why it asks for one id per table rather than counting,
 * and why it is a single round trip.
 *
 * It reads the Profile row directly rather than through `getProfile`, which
 * creates one when it finds none. A predicate whose whole job is to report that
 * nothing exists must not bring something into existence to answer, and it must
 * not then read its own row back as evidence of a filled-in workspace. The row
 * is judged on its contents for the same reason: blank fields are not a career.
 *
 * Deliberately brain-only. Someone can have applications and no brain — that is
 * exactly the person this predicate exists to catch, because they have a
 * pipeline and nothing to build a resume out of.
 */
export async function brainIsEmpty(userId: string) {
  const id = { select: { id: true } };
  const where = { where: { userId } };
  const [profile, role, highlight, note, education, project, skillGroup, certification] =
    await Promise.all([
      db.profile.findFirst({ where: { userId }, select: { fullName: true, headline: true, summary: true, brainDump: true } }),
      db.role.findFirst({ ...where, ...id }),
      db.highlight.findFirst({ ...where, ...id }),
      db.note.findFirst({ ...where, ...id }),
      db.education.findFirst({ ...where, ...id }),
      db.project.findFirst({ ...where, ...id }),
      db.skillGroup.findFirst({ ...where, ...id }),
      db.certification.findFirst({ ...where, ...id }),
    ]);

  const profileIsBlank = !profile || ![profile.fullName, profile.headline, profile.summary, profile.brainDump].some((field) => field?.trim());

  return profileIsBlank && !role && !highlight && !note && !education && !project && !skillGroup && !certification;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportedRole = {
  company: string;
  title: string;
  employmentType?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  summary?: string;
  brainDump?: string;
  /** Resume bullets. Each becomes a highlight on this role. */
  bullets?: string[];
  tags?: string[];
};

export type ImportedEducation = {
  school: string;
  degree?: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  details?: string;
};

export type ImportedProject = {
  name: string;
  role?: string;
  url?: string;
  description?: string;
  brainDump?: string;
  startDate?: string;
  endDate?: string;
  tags?: string[];
};

export type ImportedSkillGroup = { name: string; skills: string[] };
export type ImportedCertification = { name: string; issuer?: string; date?: string; url?: string };

export type BrainImport = {
  profile?: ProfilePatch;
  roles?: ImportedRole[];
  education?: ImportedEducation[];
  projects?: ImportedProject[];
  skills?: ImportedSkillGroup[];
  certifications?: ImportedCertification[];
  /** The document as it arrived, filed as one note so nothing is lost. */
  sourceText?: string;
  /** What it was — "resume", "LinkedIn export". Titles that note. */
  source?: string;
};

export type ImportOutcome = {
  /** How a person would say it: "Staff Engineer @ Stripe". */
  label: string;
  action: "created" | "matched" | "merged";
  /** Null on a dry run and on anything that was not written. */
  id: string | null;
  highlightsAdded?: number;
  highlightsSkipped?: number;
  skillsAdded?: number;
};

export type ImportReport = {
  dryRun: boolean;
  profile: { filled: string[]; kept: string[] };
  roles: ImportOutcome[];
  education: ImportOutcome[];
  projects: ImportOutcome[];
  skills: ImportOutcome[];
  certifications: ImportOutcome[];
  sourceNote: { id: string | null; action: "created" | "matched" } | null;
  warnings: string[];
};

/**
 * Caps live here rather than in the parser, because the MCP door never touches
 * the parser: neither entrance may be the lenient one.
 */
export const IMPORT_LIMITS = {
  roles: 40,
  bulletsPerRole: 60,
  education: 20,
  projects: 40,
  skillGroups: 30,
  skillsPerGroup: 120,
  certifications: 40,
  textChars: 4_000,
  sourceTextChars: 200_000,
} as const;

/** "Stripe, Inc." and "stripe inc" are one employer. */
function importKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|the|gmbh|plc|sa|ag)\b/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function text(value: string | undefined, limit: number = IMPORT_LIMITS.textChars): string {
  return (value ?? "").trim().slice(0, limit);
}

/**
 * Everything a person has already written down, from a document they wrote
 * once. This is the adoption blocker made small: without it a new workspace is
 * an empty form and the product does nothing until a career has been retyped
 * into it.
 *
 * Three rules, and they are the whole design:
 *
 * 1. It ADDS. Nothing already on file is overwritten — a matched role is left
 *    exactly as it is, and a profile field with anything in it is kept. The
 *    one exception is a skill group, where a second import unions the lists,
 *    because that is the one collection where "and also these" is what a
 *    person means.
 * 2. It is idempotent. Importing the same document twice reports every row as
 *    matched and writes nothing, which is what makes the tool safe to retry
 *    when a connection drops halfway.
 * 3. It never invents. Only fields present in the input are written; a missing
 *    date stays empty and is reported as a warning rather than guessed.
 *
 * dryRun runs the same code path as a read, so a preview cannot disagree with
 * what the write would do.
 */
export async function importIntoBrain(
  userId: string,
  input: BrainImport,
  options: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const dryRun = options.dryRun ?? true;
  const warnings: string[] = [];

  const roles = (input.roles ?? []).slice(0, IMPORT_LIMITS.roles);
  const education = (input.education ?? []).slice(0, IMPORT_LIMITS.education);
  const projects = (input.projects ?? []).slice(0, IMPORT_LIMITS.projects);
  const skills = (input.skills ?? []).slice(0, IMPORT_LIMITS.skillGroups);
  const certifications = (input.certifications ?? []).slice(0, IMPORT_LIMITS.certifications);
  const sourceText = text(input.sourceText, IMPORT_LIMITS.sourceTextChars);

  const nothing =
    roles.length === 0 &&
    education.length === 0 &&
    projects.length === 0 &&
    skills.length === 0 &&
    certifications.length === 0 &&
    !sourceText &&
    Object.keys(input.profile ?? {}).length === 0;
  if (nothing) throw new Error("There is nothing in this import.");

  for (const [name, list, limit] of [
    ["roles", input.roles, IMPORT_LIMITS.roles],
    ["education entries", input.education, IMPORT_LIMITS.education],
    ["projects", input.projects, IMPORT_LIMITS.projects],
    ["skill groups", input.skills, IMPORT_LIMITS.skillGroups],
    ["certifications", input.certifications, IMPORT_LIMITS.certifications],
  ] as const) {
    if ((list?.length ?? 0) > limit) {
      warnings.push(`Only the first ${limit} ${name} were taken; ${list!.length} were sent.`);
    }
  }

  // --- profile: fill blanks, keep everything else ---------------------------
  const stored = await getProfile(userId);
  const filled: string[] = [];
  const kept: string[] = [];
  const profilePatch: ProfilePatch = {};
  for (const column of PROFILE_COLUMNS) {
    const incoming = text(input.profile?.[column]);
    if (!incoming) continue;
    if (stored[column]) kept.push(column);
    else {
      filled.push(column);
      profilePatch[column] = incoming;
    }
  }
  if (kept.length > 0) {
    warnings.push(
      `Kept what was already on the profile: ${kept.join(", ")}. Change those by hand or with update_profile.`,
    );
  }
  if (!dryRun && filled.length > 0) await updateProfile(userId, profilePatch);

  // --- roles ----------------------------------------------------------------
  const storedRoles = await db.role.findMany({
    where: { userId },
    select: { id: true, company: true, title: true },
  });
  const roleIndex = new Map(
    storedRoles.map((role) => [`${importKey(role.company)}|${importKey(role.title)}`, role.id]),
  );

  const roleOutcomes: ImportOutcome[] = [];
  for (const role of roles) {
    const company = text(role.company, 200);
    const title = text(role.title, 200);
    if (!company && !title) continue;
    const label = `${title || "Role"} @ ${company || "somewhere"}`;
    const key = `${importKey(company)}|${importKey(title)}`;
    const bullets = (role.bullets ?? [])
      .map((bullet) => text(bullet))
      .filter(Boolean)
      .slice(0, IMPORT_LIMITS.bulletsPerRole);

    if (!role.startDate) warnings.push(`${label} came with no dates.`);
    for (const bullet of bullets) {
      if (bullet.length > 400) {
        warnings.push(`A very long bullet on ${label} may be a paragraph read as one line.`);
        break;
      }
    }

    let roleId = roleIndex.get(key) ?? null;
    const matched = roleId !== null;
    if (!matched && !dryRun) {
      // A matched role is left exactly as it is. Enriching one that exists is
      // what append_role_brain_dump is for, and it is one call away.
      const created = await createRole(userId, {
        company,
        title,
        employmentType: role.employmentType ? text(role.employmentType, 60) : undefined,
        location: text(role.location, 200),
        startDate: text(role.startDate, 40),
        endDate: text(role.endDate, 40),
        isCurrent: role.isCurrent ?? false,
        summary: text(role.summary),
        brainDump: text(role.brainDump),
        tags: (role.tags ?? []).map((tag) => text(tag, 60)).filter(Boolean),
      });
      roleId = created.id;
      roleIndex.set(key, created.id);
    }

    let added = 0;
    let skipped = 0;
    if (bullets.length > 0) {
      const existing = roleId
        ? await db.highlight.findMany({
            where: { userId, roleId, archived: false },
            select: { text: true },
          })
        : [];
      const seen = new Set(existing.map((highlight) => importKey(highlight.text)));
      for (const bullet of bullets) {
        const bulletKey = importKey(bullet);
        if (seen.has(bulletKey)) {
          skipped += 1;
          continue;
        }
        seen.add(bulletKey);
        added += 1;
        if (!dryRun && roleId) {
          await createHighlight(userId, { roleId, text: bullet, tags: ["imported"], strength: 3 });
        }
      }
    }

    roleOutcomes.push({
      label,
      action: matched ? "matched" : "created",
      id: dryRun ? null : roleId,
      highlightsAdded: added,
      highlightsSkipped: skipped,
    });
  }

  // --- education, projects, certifications ----------------------------------
  const storedEducation = await db.education.findMany({
    where: { userId },
    select: { id: true, school: true, degree: true },
  });
  const educationIndex = new Map(
    storedEducation.map((row) => [`${importKey(row.school)}|${importKey(row.degree)}`, row.id]),
  );
  const educationOutcomes: ImportOutcome[] = [];
  for (const entry of education) {
    const school = text(entry.school, 200);
    if (!school) continue;
    const key = `${importKey(school)}|${importKey(entry.degree ?? "")}`;
    const found = educationIndex.get(key);
    if (found) {
      educationOutcomes.push({ label: school, action: "matched", id: dryRun ? null : found });
      continue;
    }
    let id: string | null = null;
    if (!dryRun) {
      const created = await createEducation(userId, {
        school,
        degree: text(entry.degree, 200),
        field: text(entry.field, 200),
        location: text(entry.location, 200),
        startDate: text(entry.startDate, 40),
        endDate: text(entry.endDate, 40),
        gpa: text(entry.gpa, 40),
        details: text(entry.details),
      });
      id = created.id;
      educationIndex.set(key, created.id);
    }
    educationOutcomes.push({ label: school, action: "created", id });
  }

  const storedProjects = await db.project.findMany({ where: { userId }, select: { id: true, name: true } });
  const projectIndex = new Map(storedProjects.map((row) => [importKey(row.name), row.id]));
  const projectOutcomes: ImportOutcome[] = [];
  for (const entry of projects) {
    const name = text(entry.name, 200);
    if (!name) continue;
    const found = projectIndex.get(importKey(name));
    if (found) {
      projectOutcomes.push({ label: name, action: "matched", id: dryRun ? null : found });
      continue;
    }
    let id: string | null = null;
    if (!dryRun) {
      const created = await createProject(userId, {
        name,
        role: text(entry.role, 200),
        url: text(entry.url, 500),
        description: text(entry.description),
        brainDump: text(entry.brainDump),
        startDate: text(entry.startDate, 40),
        endDate: text(entry.endDate, 40),
        tags: (entry.tags ?? []).map((tag) => text(tag, 60)).filter(Boolean),
      });
      id = created.id;
      projectIndex.set(importKey(name), created.id);
    }
    projectOutcomes.push({ label: name, action: "created", id });
  }

  const storedCerts = await db.certification.findMany({
    where: { userId },
    select: { id: true, name: true, issuer: true },
  });
  const certIndex = new Map(
    storedCerts.map((row) => [`${importKey(row.name)}|${importKey(row.issuer)}`, row.id]),
  );
  const certOutcomes: ImportOutcome[] = [];
  for (const entry of certifications) {
    const name = text(entry.name, 200);
    if (!name) continue;
    const key = `${importKey(name)}|${importKey(entry.issuer ?? "")}`;
    const found = certIndex.get(key);
    if (found) {
      certOutcomes.push({ label: name, action: "matched", id: dryRun ? null : found });
      continue;
    }
    let id: string | null = null;
    if (!dryRun) {
      const created = await createCertification(userId, {
        name,
        issuer: text(entry.issuer, 200),
        date: text(entry.date, 40),
        url: text(entry.url, 500),
      });
      id = created.id;
      certIndex.set(key, created.id);
    }
    certOutcomes.push({ label: name, action: "created", id });
  }

  // --- skills: the one collection where a second import legitimately adds ---
  const storedGroups = await db.skillGroup.findMany({
    where: { userId },
    select: { id: true, name: true, skills: true },
  });
  const skillOutcomes: ImportOutcome[] = [];
  for (const group of skills) {
    const name = text(group.name, 120);
    const incoming = (group.skills ?? [])
      .map((skill) => text(skill, 120))
      .filter(Boolean)
      .slice(0, IMPORT_LIMITS.skillsPerGroup);
    if (!name || incoming.length === 0) continue;

    const found = storedGroups.find((row) => importKey(row.name) === importKey(name));
    if (!found) {
      let id: string | null = null;
      if (!dryRun) {
        const created = await createSkillGroup(userId, { name, skills: incoming });
        id = created.id;
        storedGroups.push({ id: created.id, name, skills: incoming });
      }
      skillOutcomes.push({ label: name, action: "created", id, skillsAdded: incoming.length });
      continue;
    }

    const have = new Set(found.skills.map((skill) => skill.toLowerCase()));
    const fresh = incoming.filter((skill) => !have.has(skill.toLowerCase()));
    if (fresh.length > 0 && !dryRun) {
      await updateSkillGroup(userId, found.id, {
        skills: [...found.skills, ...fresh].slice(0, IMPORT_LIMITS.skillsPerGroup),
      });
    }
    skillOutcomes.push({
      label: name,
      action: fresh.length > 0 ? "merged" : "matched",
      id: dryRun ? null : found.id,
      skillsAdded: fresh.length,
    });
  }

  // --- the document itself --------------------------------------------------
  let sourceNote: ImportReport["sourceNote"] = null;
  if (sourceText) {
    const duplicate = await db.note.findFirst({
      where: { userId, body: sourceText },
      select: { id: true },
    });
    if (duplicate) {
      sourceNote = { id: dryRun ? null : duplicate.id, action: "matched" };
    } else if (dryRun) {
      sourceNote = { id: null, action: "created" };
    } else {
      const note = await createNote(userId, {
        title: `Imported ${input.source?.trim() || "resume"} — ${new Date().toISOString().slice(0, 10)}`,
        body: sourceText,
        tags: ["imported"],
      });
      sourceNote = { id: note.id, action: "created" };
    }
  }

  const matchedRoles = roleOutcomes.filter((outcome) => outcome.action === "matched").length;
  if (matchedRoles > 0) {
    warnings.push(
      `${matchedRoles} role${matchedRoles > 1 ? "s were" : " was"} already on file and left untouched. Bullets were still added where they were new.`,
    );
  }

  return {
    dryRun,
    profile: { filled, kept },
    roles: roleOutcomes,
    education: educationOutcomes,
    projects: projectOutcomes,
    skills: skillOutcomes,
    certifications: certOutcomes,
    sourceNote,
    warnings,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
