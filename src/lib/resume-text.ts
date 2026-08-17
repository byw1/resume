import type { ResumeDoc } from "@/lib/resume-schema";

/**
 * Pure rendering helpers for a resume document — no database, no Node built-ins.
 *
 * They live outside `src/lib/data/` on purpose. The editor is a client component
 * and needs `estimateLines` to show a live page count, and importing that from
 * the data layer dragged the whole module — Prisma and `node:crypto` included —
 * into the browser bundle. It only ever worked by accident; adding one Node
 * import to `resumes.ts` broke the build. Keeping these here means the client
 * imports exactly what it uses.
 */

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
