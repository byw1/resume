import { db } from "@/lib/db";
import {
  blankSection,
  emptyResumeDoc,
  parseResumeDoc,
  rid,
  type ResumeDoc,
} from "@/lib/resume-schema";
import { getBrainSnapshot } from "@/lib/data/brain";

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
}>;

export async function listResumes() {
  return db.resume.findMany({
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
    include: { _count: { select: { applications: true } } },
  });
}

export async function getResume(id: string) {
  const resume = await db.resume.findUnique({ where: { id } });
  if (!resume) return null;
  return { ...resume, doc: parseResumeDoc(resume.data) };
}

export async function createResume(input: ResumeMeta & { data?: unknown; seedFromBrain?: boolean }) {
  const doc = input.data
    ? parseResumeDoc(input.data)
    : input.seedFromBrain
      ? await buildDocFromBrain()
      : emptyResumeDoc();

  return db.resume.create({
    data: {
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
      data: doc as unknown as object,
    },
  });
}

export async function updateResume(id: string, patch: ResumeMeta & { data?: unknown }) {
  const data: Record<string, unknown> = { ...patch };
  if (patch.data !== undefined) data.data = parseResumeDoc(patch.data) as unknown as object;
  return db.resume.update({ where: { id }, data });
}

export async function deleteResume(id: string) {
  return db.resume.delete({ where: { id } });
}

export async function duplicateResume(id: string, name?: string) {
  const source = await db.resume.findUnique({ where: { id } });
  if (!source) throw new Error(`No resume with id ${id}`);
  return db.resume.create({
    data: {
      name: name ?? `${source.name} (copy)`,
      targetRole: source.targetRole,
      targetCompany: source.targetCompany,
      template: source.template,
      accent: source.accent,
      fontFamily: source.fontFamily,
      fontSize: source.fontSize,
      lineHeight: source.lineHeight,
      pageMargin: source.pageMargin,
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
export async function buildDocFromBrain(): Promise<ResumeDoc> {
  const { profile, roles, highlights, education, projects, skillGroups, certifications } =
    await getBrainSnapshot();

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
      .map((h) => (h.impact ? `${h.text} — ${h.impact}` : h.text)),
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
export function resumeToText(doc: ResumeDoc) {
  const lines: string[] = [];
  const { header } = doc;
  if (header.name) lines.push(header.name);
  if (header.title) lines.push(header.title);
  const contact = [header.email, header.phone, header.location, ...header.links.map((l) => l.url)]
    .filter(Boolean)
    .join(" | ");
  if (contact) lines.push(contact);

  for (const section of doc.sections) {
    if (!section.visible) continue;
    const body: string[] = [];
    if (section.kind === "summary" && section.text) body.push(section.text);
    if (section.kind === "experience") {
      for (const item of section.experience) {
        body.push(
          `${item.title} — ${item.company}${item.location ? `, ${item.location}` : ""} (${item.startDate} – ${item.isCurrent ? "Present" : item.endDate})`,
        );
        if (item.summary) body.push(`  ${item.summary}`);
        for (const b of item.bullets.filter(Boolean)) body.push(`  • ${b}`);
      }
    }
    if (section.kind === "education") {
      for (const item of section.education) {
        body.push(
          `${item.degree}${item.field ? ` in ${item.field}` : ""} — ${item.school} (${item.startDate} – ${item.endDate})`,
        );
        for (const d of item.details.filter(Boolean)) body.push(`  • ${d}`);
      }
    }
    if (section.kind === "projects") {
      for (const item of section.projects) {
        body.push(`${item.name}${item.role ? ` — ${item.role}` : ""}${item.url ? ` (${item.url})` : ""}`);
        if (item.description) body.push(`  ${item.description}`);
        for (const b of item.bullets.filter(Boolean)) body.push(`  • ${b}`);
      }
    }
    if (section.kind === "skills") {
      for (const g of section.skills) body.push(`${g.name}: ${g.skills.join(", ")}`);
    }
    if (section.kind === "certifications") {
      for (const c of section.certifications)
        body.push([c.name, c.issuer, c.date].filter(Boolean).join(" — "));
    }
    if (section.kind === "custom") {
      for (const item of section.items) {
        body.push([item.title, item.subtitle, item.meta].filter(Boolean).join(" — "));
        for (const b of item.bullets.filter(Boolean)) body.push(`  • ${b}`);
      }
    }
    if (body.length) {
      lines.push("", section.heading.toUpperCase(), ...body);
    }
  }
  return lines.join("\n");
}

/** Rough one-page pressure gauge shown in the editor. */
export function estimateLines(doc: ResumeDoc) {
  let lines = 5; // header
  for (const section of doc.sections) {
    if (!section.visible) continue;
    lines += 2;
    if (section.kind === "summary") lines += Math.ceil(section.text.length / 110);
    if (section.kind === "experience")
      for (const item of section.experience) {
        lines += 2;
        lines += Math.ceil(item.summary.length / 110);
        for (const b of item.bullets.filter(Boolean)) lines += Math.ceil(b.length / 105);
      }
    if (section.kind === "education") lines += section.education.length * 2;
    if (section.kind === "projects")
      for (const item of section.projects) {
        lines += 1 + Math.ceil(item.description.length / 110);
        for (const b of item.bullets.filter(Boolean)) lines += Math.ceil(b.length / 105);
      }
    if (section.kind === "skills")
      for (const g of section.skills) lines += Math.ceil(g.skills.join(", ").length / 95) || 1;
    if (section.kind === "certifications") lines += section.certifications.length;
    if (section.kind === "custom")
      for (const item of section.items) lines += 1 + item.bullets.filter(Boolean).length;
  }
  return lines;
}
