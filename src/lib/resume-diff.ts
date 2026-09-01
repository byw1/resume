import type {
  CustomItem,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ResumeDoc,
  ResumeSection,
  SectionKind,
} from "@/lib/resume-schema";

/**
 * What changed between a base resume and the copy tailored from it.
 *
 * Tailoring was already one click — duplicate, rewrite, send — and entirely
 * unreviewable: nothing recorded which bullets were dropped for this job or
 * what replaced them, so the question "what did I actually claim to these
 * people" had no answer but reading both documents side by side.
 *
 * Pure and client-safe, for the reason src/lib/resume-text.ts records in its
 * own header: the editor is a client component and importing this from the
 * data layer would drag Prisma into the browser bundle. One definition, used
 * by the panel and by diff_resume.
 */

export type ChangeStatus = "added" | "removed" | "edited" | "unchanged";

export type FieldChange = { field: string; from: string; to: string };

export type BulletChange = {
  status: ChangeStatus;
  text: string;
  /** Only on "edited": what the base said. */
  from?: string;
  /** Only on "edited": 0-1, how much of the original survived. */
  similarity?: number;
};

export type EntryDiff = {
  /** What a person calls this row: "Staff Engineer — Stripe", "MIT", "Postgres". */
  label: string;
  status: ChangeStatus;
  fields: FieldChange[];
  bullets: BulletChange[];
};

export type SectionDiff = {
  kind: SectionKind;
  heading: string;
  status: ChangeStatus;
  renamed?: { from: string; to: string };
  /** Showing or hiding a section is a tailoring decision, not a rendering one. */
  visibility?: { from: boolean; to: boolean };
  /** Summary sections only. */
  text?: { from: string; to: string };
  entries: EntryDiff[];
  counts: { bulletsAdded: number; bulletsRemoved: number; bulletsEdited: number };
};

export type ResumeDiff = {
  identical: boolean;
  header: FieldChange[];
  sections: SectionDiff[];
  totals: {
    sectionsAdded: number;
    sectionsRemoved: number;
    sectionsHidden: number;
    entriesAdded: number;
    entriesRemoved: number;
    bulletsAdded: number;
    bulletsRemoved: number;
    bulletsEdited: number;
    headerFieldsChanged: number;
  };
};

/**
 * How much of one sentence survives in another, 0-1.
 *
 * Dice rather than shared-over-longest, because tailoring a bullet usually
 * makes it longer: "Ran the Postgres migration" becoming "Led the Postgres
 * migration across six services" keeps everything that mattered and scores
 * 0.43 by the longest measure, which would report a rewrite as an unrelated
 * cut and an unrelated addition.
 *
 * Exported because the evidence tracer scores a bullet against a brain
 * highlight with the same measure a rewritten bullet is paired with — one
 * definition of "these are the same sentence, reworded".
 */
export function bulletSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((token) => token.length > 1),
  );
}

/**
 * Above this, a leftover removed bullet and a leftover added one are the same
 * bullet reworded rather than two separate decisions.
 */
const EDIT_THRESHOLD = 0.5;

export function diffResumeDocs(base: ResumeDoc, tailored: ResumeDoc): ResumeDiff {
  const header = diffFields(
    [
      ["Name", base.header.name, tailored.header.name],
      ["Title", base.header.title, tailored.header.title],
      ["Email", base.header.email, tailored.header.email],
      ["Phone", base.header.phone, tailored.header.phone],
      ["Location", base.header.location, tailored.header.location],
      [
        "Links",
        base.header.links.map((link) => link.url).join(", "),
        tailored.header.links.map((link) => link.url).join(", "),
      ],
    ],
  );

  const sections = pairSections(base.sections, tailored.sections).map(([left, right]) =>
    diffSection(left, right),
  );

  const totals = {
    sectionsAdded: sections.filter((section) => section.status === "added").length,
    sectionsRemoved: sections.filter((section) => section.status === "removed").length,
    sectionsHidden: sections.filter((section) => section.visibility?.to === false).length,
    entriesAdded: sections.reduce(
      (sum, section) => sum + section.entries.filter((entry) => entry.status === "added").length,
      0,
    ),
    entriesRemoved: sections.reduce(
      (sum, section) => sum + section.entries.filter((entry) => entry.status === "removed").length,
      0,
    ),
    bulletsAdded: sections.reduce((sum, section) => sum + section.counts.bulletsAdded, 0),
    bulletsRemoved: sections.reduce((sum, section) => sum + section.counts.bulletsRemoved, 0),
    bulletsEdited: sections.reduce((sum, section) => sum + section.counts.bulletsEdited, 0),
    headerFieldsChanged: header.length,
  };

  const identical =
    header.length === 0 &&
    sections.every(
      (section) =>
        section.status === "unchanged" &&
        !section.renamed &&
        !section.visibility &&
        !section.text &&
        section.entries.every((entry) => entry.status === "unchanged"),
    );

  return { identical, header, sections, totals };
}

function diffFields(rows: [string, string, string][]): FieldChange[] {
  return rows
    .filter(([, from, to]) => (from ?? "") !== (to ?? ""))
    .map(([field, from, to]) => ({ field, from, to }));
}

/**
 * Pair sections in three passes: by id, then by kind and heading, then by kind
 * in document order.
 *
 * The last two are not a nicety. RESUME_DOC_SHAPE never mentions `id`, so
 * every document an assistant writes from scratch has an empty id on every
 * section — pairing on id alone would report a completely rewritten resume.
 */
function pairSections(
  base: ResumeSection[],
  tailored: ResumeSection[],
): [ResumeSection | null, ResumeSection | null][] {
  const pairs: [ResumeSection | null, ResumeSection | null][] = [];
  const leftOver = [...base];
  const takeFrom = (match: (section: ResumeSection) => boolean) => {
    const index = leftOver.findIndex(match);
    return index === -1 ? null : leftOver.splice(index, 1)[0];
  };

  for (const section of tailored) {
    const found =
      (section.id ? takeFrom((other) => other.id === section.id) : null) ??
      takeFrom(
        (other) =>
          other.kind === section.kind &&
          other.heading.trim().toLowerCase() === section.heading.trim().toLowerCase(),
      ) ??
      takeFrom((other) => other.kind === section.kind);
    pairs.push([found, section]);
  }
  for (const section of leftOver) pairs.push([section, null]);
  return pairs;
}

function diffSection(base: ResumeSection | null, tailored: ResumeSection | null): SectionDiff {
  const present = (tailored ?? base) as ResumeSection;
  const status: ChangeStatus = !base ? "added" : !tailored ? "removed" : "unchanged";
  const entries =
    base && tailored
      ? diffEntries(base, tailored)
      : listEntries(present).map((entry) => ({
          label: entry.label,
          status,
          fields: [],
          bullets: entry.bullets.map((text) => ({ status, text })),
        }));

  const counts = {
    bulletsAdded: countBullets(entries, "added"),
    bulletsRemoved: countBullets(entries, "removed"),
    bulletsEdited: countBullets(entries, "edited"),
  };

  const section: SectionDiff = {
    kind: present.kind,
    heading: present.heading || present.kind,
    status,
    entries,
    counts,
  };

  if (base && tailored) {
    if (base.heading !== tailored.heading) {
      section.renamed = { from: base.heading, to: tailored.heading };
    }
    if (base.visible !== tailored.visible) {
      section.visibility = { from: base.visible, to: tailored.visible };
    }
    if (present.kind === "summary" && base.text !== tailored.text) {
      section.text = { from: base.text, to: tailored.text };
    }
  }
  return section;
}

function countBullets(entries: EntryDiff[], status: ChangeStatus): number {
  return entries.reduce(
    (sum, entry) => sum + entry.bullets.filter((bullet) => bullet.status === status).length,
    0,
  );
}

/** One row of a section, reduced to the three things a diff needs. */
type Entry = { key: string; label: string; fields: [string, string][]; bullets: string[] };

function listEntries(section: ResumeSection): Entry[] {
  const fold = (value: string) => value.trim().toLowerCase();
  switch (section.kind) {
    case "experience":
      return section.experience.map((item: ExperienceItem) => ({
        key: item.id || item.roleId || fold(`${item.company}|${item.title}`),
        label: [item.title, item.company].filter(Boolean).join(" — ") || "Role",
        fields: [
          ["Company", item.company],
          ["Title", item.title],
          ["Location", item.location],
          ["Dates", [item.startDate, item.isCurrent ? "Present" : item.endDate].join(" – ")],
          ["Summary", item.summary],
        ] as [string, string][],
        bullets: item.bullets,
      }));
    case "education":
      return section.education.map((item: EducationItem) => ({
        key: item.id || fold(`${item.school}|${item.degree}|${item.field}`),
        label: item.school || "School",
        fields: [
          ["Degree", item.degree],
          ["Field", item.field],
          ["Dates", [item.startDate, item.endDate].join(" – ")],
        ] as [string, string][],
        bullets: item.details,
      }));
    case "projects":
      return section.projects.map((item: ProjectItem) => ({
        key: item.id || fold(item.name),
        label: item.name || "Project",
        fields: [
          ["Role", item.role],
          ["Link", item.url],
          ["Description", item.description],
        ] as [string, string][],
        bullets: item.bullets,
      }));
    case "skills":
      return section.skills.map((group) => ({
        key: fold(group.name),
        label: group.name || "Skills",
        fields: [] as [string, string][],
        bullets: group.skills,
      }));
    case "certifications":
      return section.certifications.map((item) => ({
        key: fold(`${item.name}|${item.issuer}`),
        label: item.name || "Certification",
        fields: [
          ["Issuer", item.issuer],
          ["Date", item.date],
        ] as [string, string][],
        bullets: [] as string[],
      }));
    case "custom":
      return section.items.map((item: CustomItem) => ({
        key: fold(`${item.title}|${item.subtitle}`),
        label: item.title || "Item",
        fields: [
          ["Subtitle", item.subtitle],
          ["Meta", item.meta],
        ] as [string, string][],
        bullets: item.bullets,
      }));
    case "summary":
    default:
      return [];
  }
}

function diffEntries(base: ResumeSection, tailored: ResumeSection): EntryDiff[] {
  const left = listEntries(base);
  const right = listEntries(tailored);
  const unmatched = [...left];
  const out: EntryDiff[] = [];

  for (const entry of right) {
    const index = unmatched.findIndex((other) => other.key === entry.key);
    if (index === -1) {
      out.push({
        label: entry.label,
        status: "added",
        fields: [],
        bullets: entry.bullets.map((text) => ({ status: "added" as const, text })),
      });
      continue;
    }
    const was = unmatched.splice(index, 1)[0];
    const fields = diffFields(
      entry.fields.map((pair, position) => [
        pair[0],
        was.fields[position]?.[1] ?? "",
        pair[1],
      ]) as [string, string, string][],
    );
    // A skill name is one word: pairing "Postgres" with "PostgREST" as an edit
    // is worse than reporting both, so that section never pairs.
    const bullets = diffBullets(was.bullets, entry.bullets, base.kind !== "skills");
    const changed =
      fields.length > 0 || bullets.some((bullet) => bullet.status !== "unchanged");
    out.push({ label: entry.label, status: changed ? "edited" : "unchanged", fields, bullets });
  }

  for (const entry of unmatched) {
    out.push({
      label: entry.label,
      status: "removed",
      fields: [],
      bullets: entry.bullets.map((text) => ({ status: "removed" as const, text })),
    });
  }
  return out;
}

/**
 * Exact matches first as a multiset, so reordering reads as unchanged — the
 * person who moved a bullet knows they moved it, and reporting moves triples
 * the size of a panel whose whole job is to be scannable. Then the leftovers
 * pair greedily by similarity, and whatever is still standing is a real
 * addition or a real cut.
 */
function diffBullets(base: string[], tailored: string[], pairEdits: boolean): BulletChange[] {
  const pool = [...base];
  const out: BulletChange[] = [];
  const leftoverTailored: string[] = [];

  for (const text of tailored) {
    const index = pool.indexOf(text);
    if (index === -1) leftoverTailored.push(text);
    else {
      pool.splice(index, 1);
      out.push({ status: "unchanged", text });
    }
  }

  if (pairEdits) {
    for (const text of [...leftoverTailored]) {
      let best = -1;
      let bestScore = 0;
      pool.forEach((candidate, index) => {
        const score = bulletSimilarity(candidate, text);
        if (score > bestScore) {
          bestScore = score;
          best = index;
        }
      });
      if (best !== -1 && bestScore >= EDIT_THRESHOLD) {
        const from = pool.splice(best, 1)[0];
        leftoverTailored.splice(leftoverTailored.indexOf(text), 1);
        out.push({ status: "edited", text, from, similarity: Math.round(bestScore * 100) / 100 });
      }
    }
  }

  for (const text of leftoverTailored) out.push({ status: "added", text });
  for (const text of pool) out.push({ status: "removed", text });
  return out;
}
