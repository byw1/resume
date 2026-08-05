import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile() {
  const existing = await db.profile.findUnique({ where: { id: "me" } });
  if (existing) return existing;
  return db.profile.create({ data: { id: "me" } });
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

export async function updateProfile(patch: ProfilePatch) {
  await getProfile();
  return db.profile.update({ where: { id: "me" }, data: patch });
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

export async function listRoles() {
  return db.role.findMany({
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { highlights: true } } },
  });
}

export async function getRole(id: string) {
  return db.role.findUnique({
    where: { id },
    include: { highlights: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
}

export async function createRole(input: RoleInput) {
  const count = await db.role.count();
  return db.role.create({
    data: {
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

export async function updateRole(id: string, patch: Partial<RoleInput>) {
  return db.role.update({ where: { id }, data: patch });
}

export async function deleteRole(id: string) {
  return db.role.delete({ where: { id } });
}

/** Non-destructive: adds text to the end of the role's brain dump. */
export async function appendToRoleBrainDump(id: string, text: string, heading?: string) {
  const role = await db.role.findUnique({ where: { id } });
  if (!role) throw new Error(`No role with id ${id}`);
  const stamp = heading ? `\n\n## ${heading}\n` : "\n\n";
  const next = `${role.brainDump}${role.brainDump ? stamp : heading ? `## ${heading}\n` : ""}${text}`.trim();
  return db.role.update({ where: { id }, data: { brainDump: next } });
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

export async function listHighlights(roleId?: string) {
  return db.highlight.findMany({
    where: { archived: false, ...(roleId ? { roleId } : {}) },
    orderBy: [{ strength: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { role: { select: { id: true, company: true, title: true } } },
  });
}

export async function createHighlight(input: HighlightInput) {
  return db.highlight.create({
    data: {
      roleId: input.roleId ?? null,
      text: input.text,
      impact: input.impact ?? "",
      tags: input.tags ?? [],
      strength: clamp(input.strength ?? 3, 1, 5),
    },
  });
}

export async function createHighlights(inputs: HighlightInput[]) {
  const created = [];
  for (const input of inputs) created.push(await createHighlight(input));
  return created;
}

export async function updateHighlight(id: string, patch: Partial<HighlightInput> & { archived?: boolean }) {
  const data = { ...patch } as Record<string, unknown>;
  if (typeof patch.strength === "number") data.strength = clamp(patch.strength, 1, 5);
  return db.highlight.update({ where: { id }, data });
}

export async function deleteHighlight(id: string) {
  return db.highlight.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function listNotes() {
  return db.note.findMany({ orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] });
}

export async function createNote(input: { title: string; body?: string; tags?: string[]; pinned?: boolean }) {
  return db.note.create({
    data: {
      title: input.title,
      body: input.body ?? "",
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
    },
  });
}

export async function updateNote(
  id: string,
  patch: Partial<{ title: string; body: string; tags: string[]; pinned: boolean }>,
) {
  return db.note.update({ where: { id }, data: patch });
}

export async function deleteNote(id: string) {
  return db.note.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Education / Projects / Skills / Certifications
// ---------------------------------------------------------------------------

export async function listEducation() {
  return db.education.findMany({ orderBy: [{ sortOrder: "asc" }, { endDate: "desc" }] });
}

export async function createEducation(input: {
  school: string;
  degree?: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  details?: string;
}) {
  const count = await db.education.count();
  return db.education.create({ data: { ...input, sortOrder: count } });
}

export async function updateEducation(id: string, patch: Record<string, unknown>) {
  return db.education.update({ where: { id }, data: patch });
}

export async function deleteEducation(id: string) {
  return db.education.delete({ where: { id } });
}

export async function listProjects() {
  return db.project.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
}

export async function createProject(input: {
  name: string;
  role?: string;
  url?: string;
  description?: string;
  brainDump?: string;
  tags?: string[];
  startDate?: string;
  endDate?: string;
}) {
  const count = await db.project.count();
  return db.project.create({ data: { ...input, tags: input.tags ?? [], sortOrder: count } });
}

export async function updateProject(id: string, patch: Record<string, unknown>) {
  return db.project.update({ where: { id }, data: patch });
}

export async function deleteProject(id: string) {
  return db.project.delete({ where: { id } });
}

export async function listSkillGroups() {
  return db.skillGroup.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function createSkillGroup(input: { name: string; skills?: string[] }) {
  const count = await db.skillGroup.count();
  return db.skillGroup.create({
    data: { name: input.name, skills: input.skills ?? [], sortOrder: count },
  });
}

export async function updateSkillGroup(id: string, patch: { name?: string; skills?: string[] }) {
  return db.skillGroup.update({ where: { id }, data: patch });
}

export async function deleteSkillGroup(id: string) {
  return db.skillGroup.delete({ where: { id } });
}

export async function listCertifications() {
  return db.certification.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function createCertification(input: {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}) {
  const count = await db.certification.count();
  return db.certification.create({ data: { ...input, sortOrder: count } });
}

export async function deleteCertification(id: string) {
  return db.certification.delete({ where: { id } });
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
 * Ranked full-text search across everything in the brain. Deliberately done in
 * application code rather than Postgres FTS so it works identically on a fresh
 * database with zero extensions or migrations to configure.
 */
export async function searchBrain(query: string, limit = 25): Promise<BrainHit[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9+#.-]/g, ""))
    .filter((t) => t.length > 1);

  const [profile, roles, highlights, notes, projects] = await Promise.all([
    getProfile(),
    db.role.findMany(),
    db.highlight.findMany({
      where: { archived: false },
      include: { role: { select: { company: true, title: true } } },
    }),
    db.note.findMany(),
    db.project.findMany(),
  ]);

  const hits: BrainHit[] = [];

  if (terms.length === 0) {
    // No query: return the most recently touched material.
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
      id: "me",
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

/** Everything in one payload — used to seed a resume and by the MCP `get_brain_snapshot` tool. */
export async function getBrainSnapshot() {
  const [profile, roles, highlights, education, projects, skillGroups, certifications, notes] =
    await Promise.all([
      getProfile(),
      listRoles(),
      listHighlights(),
      listEducation(),
      listProjects(),
      listSkillGroups(),
      listCertifications(),
      listNotes(),
    ]);
  return { profile, roles, highlights, education, projects, skillGroups, certifications, notes };
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
