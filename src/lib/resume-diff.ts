import type { ResumeDoc, ResumeSection } from "@/lib/resume-schema";

/**
 * What changed between two resume documents — typically a tailored variant
 * against the base it was duplicated from.
 *
 * Pure and client-safe on purpose, like resume-text.ts: the editor computes it
 * live as you type, the grid computes it server-side for the lineage chip, and
 * the compare_resumes tool returns it over MCP. One implementation, three
 * surfaces.
 *
 * The comparison is exact-string on bullets. A reworded bullet therefore shows
 * as one removed and one added, which is honest — the reader sees the old
 * wording and the new side by side rather than a similarity score's opinion of
 * whether they are "the same" bullet.
 */

export type ResumeItemDiff = {
  /** "Stripe — Staff Engineer" style label for the entry. */
  label: string;
  status: "added" | "removed" | "changed";
  bulletsAdded: string[];
  bulletsRemoved: string[];
  summaryChanged: boolean;
};

export type ResumeSectionDiff = {
  kind: string;
  heading: string;
  status: "added" | "removed" | "changed";
  /** Per-entry detail for experience sections. */
  items: ResumeItemDiff[];
  /** For summary sections: the text differs. */
  textChanged: boolean;
  /** One line for the list-ish kinds (skills, education, certifications…). */
  detail: string;
};

export type ResumeDiff = {
  identical: boolean;
  /** Header fields whose values differ, e.g. ["title", "location"]. */
  headerChanged: string[];
  sections: ResumeSectionDiff[];
  bulletsAdded: number;
  bulletsRemoved: number;
  /** "+4 bullets · −2 bullets · summary edited" — or "No changes from base". */
  summary: string;
};

/** Experience entries match on the brain role they came from, else company+title. */
function experienceKey(item: { roleId?: string; company: string; title: string }) {
  return item.roleId || `${item.company.trim().toLowerCase()}|${item.title.trim().toLowerCase()}`;
}

function experienceLabel(item: { company: string; title: string }) {
  return [item.title, item.company].filter(Boolean).join(" — ") || "Untitled entry";
}

/** A section's identity across the two documents: same kind, same heading. */
function sectionKey(section: ResumeSection) {
  return `${section.kind}|${section.heading.trim().toLowerCase()}`;
}

const cleaned = (bullets: string[]) => bullets.map((b) => b.trim()).filter(Boolean);

function diffBullets(base: string[], variant: string[]) {
  const baseSet = new Set(cleaned(base));
  const variantSet = new Set(cleaned(variant));
  return {
    added: [...variantSet].filter((b) => !baseSet.has(b)),
    removed: [...baseSet].filter((b) => !variantSet.has(b)),
  };
}

/** Every printable line of a list-ish section, for a coarse entry-level diff. */
function sectionEntries(section: ResumeSection): string[] {
  switch (section.kind) {
    case "education":
      return section.education.map((e) =>
        [e.degree, e.field, e.school].filter(Boolean).join(" · "),
      );
    case "projects":
      return section.projects.map((p) => p.name);
    case "skills":
      return section.skills.flatMap((g) => g.skills.map((skill) => `${g.name}: ${skill}`));
    case "certifications":
      return section.certifications.map((c) => c.name);
    case "custom":
      return section.items.map((item) => item.title);
    default:
      return [];
  }
}

export function diffResumeDocs(base: ResumeDoc, variant: ResumeDoc): ResumeDiff {
  const headerChanged: string[] = [];
  const baseHeader = base.header as unknown as Record<string, unknown>;
  const variantHeader = variant.header as unknown as Record<string, unknown>;
  for (const field of ["name", "title", "email", "phone", "location"]) {
    if (String(baseHeader[field] ?? "") !== String(variantHeader[field] ?? "")) {
      headerChanged.push(field);
    }
  }
  const linkLine = (doc: ResumeDoc) => doc.header.links.map((l) => `${l.label}|${l.url}`).join(",");
  if (linkLine(base) !== linkLine(variant)) headerChanged.push("links");

  const sections: ResumeSectionDiff[] = [];
  let bulletsAdded = 0;
  let bulletsRemoved = 0;
  let summaryEdited = false;

  const baseSections = new Map(base.sections.map((s) => [sectionKey(s), s]));
  const variantSections = new Map(variant.sections.map((s) => [sectionKey(s), s]));

  const blank: Omit<ResumeSectionDiff, "kind" | "heading" | "status"> = {
    items: [],
    textChanged: false,
    detail: "",
  };

  for (const [key, variantSection] of variantSections) {
    const baseSection = baseSections.get(key);
    if (!baseSection) {
      const entryCount =
        variantSection.kind === "experience"
          ? variantSection.experience.length
          : sectionEntries(variantSection).length;
      sections.push({
        ...blank,
        kind: variantSection.kind,
        heading: variantSection.heading,
        status: "added",
        detail: entryCount ? `${entryCount} ${entryCount === 1 ? "entry" : "entries"}` : "",
      });
      continue;
    }

    if (variantSection.kind === "summary") {
      if (baseSection.text.trim() !== variantSection.text.trim()) {
        summaryEdited = true;
        sections.push({
          ...blank,
          kind: variantSection.kind,
          heading: variantSection.heading,
          status: "changed",
          textChanged: true,
        });
      }
      continue;
    }

    if (variantSection.kind === "experience") {
      const items: ResumeItemDiff[] = [];
      const baseItems = new Map(baseSection.experience.map((item) => [experienceKey(item), item]));
      const variantKeys = new Set(variantSection.experience.map((item) => experienceKey(item)));

      for (const item of variantSection.experience) {
        const baseItem = baseItems.get(experienceKey(item));
        if (!baseItem) {
          const added = cleaned(item.bullets);
          bulletsAdded += added.length;
          items.push({
            label: experienceLabel(item),
            status: "added",
            bulletsAdded: added,
            bulletsRemoved: [],
            summaryChanged: false,
          });
          continue;
        }
        const { added, removed } = diffBullets(baseItem.bullets, item.bullets);
        const summaryChanged = baseItem.summary.trim() !== item.summary.trim();
        if (added.length || removed.length || summaryChanged) {
          bulletsAdded += added.length;
          bulletsRemoved += removed.length;
          items.push({
            label: experienceLabel(item),
            status: "changed",
            bulletsAdded: added,
            bulletsRemoved: removed,
            summaryChanged,
          });
        }
      }
      for (const [key2, baseItem] of baseItems) {
        if (!variantKeys.has(key2)) {
          const removed = cleaned(baseItem.bullets);
          bulletsRemoved += removed.length;
          items.push({
            label: experienceLabel(baseItem),
            status: "removed",
            bulletsAdded: [],
            bulletsRemoved: removed,
            summaryChanged: false,
          });
        }
      }
      if (items.length) {
        sections.push({
          ...blank,
          kind: variantSection.kind,
          heading: variantSection.heading,
          status: "changed",
          items,
        });
      }
      continue;
    }

    // The list-ish kinds: education, projects, skills, certifications, custom.
    const { added, removed } = diffBullets(sectionEntries(baseSection), sectionEntries(variantSection));
    if (added.length || removed.length) {
      const parts = [
        added.length ? `+${added.length}` : "",
        removed.length ? `−${removed.length}` : "",
      ].filter(Boolean);
      sections.push({
        ...blank,
        kind: variantSection.kind,
        heading: variantSection.heading,
        status: "changed",
        detail: `${parts.join(" ")} ${added.length + removed.length === 1 ? "entry" : "entries"}`,
      });
    }
  }

  for (const [key, baseSection] of baseSections) {
    if (!variantSections.has(key)) {
      sections.push({
        ...blank,
        kind: baseSection.kind,
        heading: baseSection.heading,
        status: "removed",
      });
    }
  }

  const identical = sections.length === 0 && headerChanged.length === 0;

  const parts: string[] = [];
  if (bulletsAdded) parts.push(`+${bulletsAdded} bullet${bulletsAdded > 1 ? "s" : ""}`);
  if (bulletsRemoved) parts.push(`−${bulletsRemoved} bullet${bulletsRemoved > 1 ? "s" : ""}`);
  if (summaryEdited) parts.push("summary edited");
  const structural = sections.filter(
    (s) => s.status !== "changed" || (s.kind !== "experience" && s.kind !== "summary"),
  ).length;
  if (structural) parts.push(`${structural} section${structural > 1 ? "s" : ""} changed`);
  if (headerChanged.length) parts.push("header edited");

  return {
    identical,
    headerChanged,
    sections,
    bulletsAdded,
    bulletsRemoved,
    summary: identical ? "No changes from base" : parts.join(" · ") || "Minor changes",
  };
}
