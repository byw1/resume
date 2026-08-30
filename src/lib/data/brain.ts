import type { NoteKind } from "@prisma/client";
import { db } from "@/lib/db";
import { pick } from "@/lib/data/patch";

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

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
