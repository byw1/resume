import type { ResumeImport, ResumeImportRole } from "@/lib/data/me";

/**
 * Reading a pasted resume well enough to correct.
 *
 * The conversational path is better than this and always will be: an assistant
 * reads the document and calls import_resume with what it says. This exists for
 * the person who opened the app before connecting anything, and its output is
 * never written straight to the database — it fills a form they check first.
 * Every guess it makes is one they can see and fix, which is the only reason a
 * heuristic is allowed near somebody's career history at all.
 *
 * Pure, so the dialog can re-read as you paste without a round trip. No PDF
 * parsing: a PDF's text layer arrives in column order, so a two-column resume
 * comes out interleaved, and a wrong parse of a document you cannot see the
 * parse of is worse than pasting the text yourself. The app says "paste the
 * text" and means it.
 */

export type ParsedResume = {
  /** Exactly the shape importResume takes. */
  draft: ResumeImport;
  /** The document as it arrived, filed as a note by the caller. */
  sourceText: string;
  /** Lines it could not place. Never dropped — sourceText still carries them. */
  unparsed: string[];
  /** Plain sentences for the dialog: what it guessed, what it could not read. */
  warnings: string[];
};

type Section =
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "summary"
  | "header"
  | "other";

const SECTION_ALIASES: [RegExp, Section][] = [
  [/^(work\s+)?(experience|employment|professional\s+experience|work\s+history|career)\b/i, "experience"],
  [/^education\b/i, "education"],
  [/^(technical\s+)?(skills|competencies|technologies|tools)\b/i, "skills"],
  [/^(projects|selected\s+projects|side\s+projects|open\s+source)\b/i, "projects"],
  [/^(certifications?|licen[sc]es?|awards?)\b/i, "certifications"],
  [/^(summary|profile|about|objective)\b/i, "summary"],
];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const DATE_RANGE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4})\s*(?:–|—|-|to|until)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(\d{4}|present|current|now)/i;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL = /\b((?:https?:\/\/|www\.)[^\s,;]+|[\w-]+\.(?:com|io|dev|net|org|me|co)(?:\/[^\s,;]*)?)/gi;

/** Bullet glyphs a resume actually uses, folded to one marker. */
const BULLET = /^\s*[•‣▪◦·*•▪●\-–—]\s+/;

const CONTRACT = /\b(intern(ship)?|contract(or)?|freelance|consultant|part[-\s]?time)\b/i;

function normalise(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    // LinkedIn's PDF export stamps every page and so do plenty of templates.
    // Dropped rather than blanked: a blank line separates entries here, so
    // blanking one mid-role cut the bullets below it off from their job.
    .filter((line) => !/^\s*page \d+( of \d+)?\s*$/i.test(line))
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line, index, all) => line.trim() !== "" || (all[index - 1] ?? "").trim() !== "");
}

/**
 * A heading is a line that says one word and stops.
 *
 * "Skills" is a heading. "Tools: Postgres, Kafka, Terraform" under a job is
 * not — and reading it as one swallowed every job below it into the skills
 * section. So the line has to be the heading and nothing else: no comma-
 * separated tail, no sentence hanging off it.
 */
function headingOf(line: string): Section | null {
  const clean = line.trim().replace(/[:•·]+$/, "").trim();
  if (!clean || clean.length > 40) return null;
  if (BULLET.test(line)) return null;
  for (const [pattern, section] of SECTION_ALIASES) {
    const match = clean.match(pattern);
    if (!match) continue;
    // Whatever follows the word the alias matched. A heading has nothing.
    const rest = clean.slice(match[0].length).trim();
    if (rest === "" || /^(and\s+\w+|&\s+\w+)$/i.test(rest)) return section;
  }
  return null;
}

function parseDates(line: string) {
  const match = line.match(DATE_RANGE);
  if (!match) return null;
  const month = (raw?: string) => {
    const key = raw?.trim().slice(0, 3).toLowerCase();
    return key && MONTHS[key] ? `-${MONTHS[key]}` : "";
  };
  const end = match[4].toLowerCase();
  const current = ["present", "current", "now"].includes(end);
  return {
    startDate: `${match[2]}${month(match[1])}`,
    endDate: current ? "" : `${match[4]}${month(match[3])}`,
    isCurrent: current,
  };
}

/** Split "Staff Engineer at Stripe" / "Stripe — Staff Engineer" into its two halves. */
function splitTitleAndCompany(line: string): { company: string; title: string } | null {
  const stripped = line.replace(DATE_RANGE, "").replace(/[,–—|]+\s*$/, "").trim();
  const at = stripped.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  const parts = stripped.split(/\s+[–—|]\s+|\s{2,}|,\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { title: parts[0], company: parts[1] };
  return null;
}

export function parseResumeText(text: string): ParsedResume {
  const lines = normalise(text.slice(0, 200_000));
  const warnings: string[] = [];
  const unparsed: string[] = [];

  // --- the block above the first heading is the header --------------------
  const blocks: { section: Section; lines: string[] }[] = [{ section: "header", lines: [] }];
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) blocks.push({ section: heading, lines: [] });
    else blocks[blocks.length - 1].lines.push(line);
  }

  const header = blocks[0].lines.filter((line) => line.trim());
  const joined = header.join("  ");
  const profile: NonNullable<ResumeImport["profile"]> = {};
  const name = header[0]?.trim();
  if (name && name.length <= 60 && !EMAIL.test(name)) profile.fullName = name;
  const email = joined.match(EMAIL)?.[0];
  if (email) profile.email = email;
  const phone = joined.match(PHONE)?.[0];
  if (phone) profile.phone = phone.trim();
  for (const line of header) {
    // Emails first, or "wil@example.com" donates "example.com" as a website.
    for (const [url] of line.replace(new RegExp(EMAIL, "g"), " ").matchAll(URL)) {
      const lower = url.toLowerCase();
      if (lower.includes("linkedin.")) profile.linkedin ??= url;
      else if (lower.includes("github.")) profile.github ??= url;
      else if (lower.includes("x.com") || lower.includes("twitter.")) profile.twitter ??= url;
      else profile.website ??= url;
    }
  }
  if (!profile.fullName) warnings.push("No name found at the top — fill it in yourself.");

  const draft: ResumeImport = {
    profile,
    roles: [],
    education: [],
    projects: [],
    skillGroups: [],
    certifications: [],
  };

  for (const block of blocks.slice(1)) {
    const body = block.lines;
    switch (block.section) {
      case "summary":
        draft.profile!.summary = body.join("\n").trim();
        break;
      case "skills": {
        for (const line of body) {
          const clean = line.replace(BULLET, "").trim();
          if (!clean) continue;
          const labelled = clean.match(/^([A-Za-z][\w\s/&+-]{0,40}?)\s*[:—–]\s*(.+)$/);
          const name = labelled ? labelled[1].trim() : "Skills";
          const list = (labelled ? labelled[2] : clean)
            .split(/[,;|•·]/)
            .map((skill) => skill.trim())
            .filter((skill) => skill.length > 0 && skill.length < 60);
          if (list.length === 0) continue;
          const group = draft.skillGroups!.find((existing) => existing.name === name);
          if (group) group.skills = [...(group.skills ?? []), ...list];
          else draft.skillGroups!.push({ name, skills: list });
        }
        break;
      }
      case "certifications":
        for (const line of body) {
          const clean = line.replace(BULLET, "").trim();
          if (!clean) continue;
          const parts = clean.split(/\s+[–—|]\s+|,\s+/);
          draft.certifications!.push({
            name: parts[0].trim(),
            issuer: parts[1]?.trim(),
            date: clean.match(/\b(19|20)\d{2}\b/)?.[0],
          });
        }
        break;
      case "education":
        for (const entry of groupEntries(body)) {
          const first = entry[0] ?? "";
          const dates = parseDates(entry.join(" "));
          const degree = entry.find((line) =>
            /\b(b\.?s\.?c?|b\.?a\.?|b\.?eng|m\.?s\.?c?|m\.?eng|m\.?b\.?a\.?|ph\.?d|bachelors?|masters?|doctor|associate|diploma)\b/i.test(line),
          );
          draft.education!.push({
            school: first.replace(DATE_RANGE, "").replace(/[,–—|]\s*$/, "").trim(),
            degree: degree && degree !== first ? degree.trim() : undefined,
            startDate: dates?.startDate,
            endDate: dates?.endDate,
            details: entry.slice(1).filter((line) => line !== degree).join("\n").trim() || undefined,
          });
        }
        break;
      case "projects":
        for (const entry of groupEntries(body)) {
          const first = (entry[0] ?? "").replace(BULLET, "").trim();
          if (!first) continue;
          draft.projects!.push({
            name: first.split(/\s+[–—|:]\s+/)[0].trim(),
            description: entry.slice(1).join("\n").trim() || undefined,
            url: entry.join(" ").match(URL)?.[0],
            background: entry.join("\n"),
          });
        }
        break;
      case "experience":
        for (const entry of groupEntries(body)) {
          const role = parseRole(entry, warnings);
          if (role) draft.roles!.push(role);
          else unparsed.push(...entry);
        }
        break;
      default:
        unparsed.push(...body.filter((line) => line.trim()));
    }
  }

  if ((draft.roles ?? []).length === 0) {
    warnings.push(
      "No jobs were recognised. Check the headings — this looks for one called Experience, Employment or Work History.",
    );
  }
  if (unparsed.length > 0) {
    warnings.push(
      `${unparsed.length} line${unparsed.length > 1 ? "s" : ""} could not be placed. The whole document is saved as a note either way, so nothing is lost.`,
    );
  }

  return { draft, sourceText: text, unparsed, warnings };
}

/** Blank lines separate entries; so does a line that starts a new dated header. */
function groupEntries(lines: string[]): string[][] {
  const entries: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length > 0) entries.push(current);
      current = [];
      continue;
    }
    // A dated line after another dated line is the next job, whether or not
    // the one before it had bullets — plenty of resumes list three stints at
    // one company with no bullets at all, and they were collapsing into one.
    const lastDated = current.findLastIndex((row) => DATE_RANGE.test(row));
    if (!BULLET.test(line) && DATE_RANGE.test(line) && lastDated !== -1) {
      // The title line already read belongs to the entry this date opens, not
      // to the one it closes: a header is usually "Title" then "Dates".
      const carried = current.slice(lastDated + 1);
      entries.push(current.slice(0, lastDated + 1));
      current = [...carried, line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) entries.push(current);
  return entries;
}

function parseRole(entry: string[], warnings: string[]): ResumeImportRole | null {
  const headerLines = entry.filter((line) => !BULLET.test(line));
  const bullets = entry
    .filter((line) => BULLET.test(line))
    .map((line) => line.replace(BULLET, "").trim());
  if (headerLines.length === 0) return null;

  const dates = parseDates(headerLines.join(" "));
  const split = splitTitleAndCompany(headerLines[0]);
  let company = "";
  let title = "";
  if (split) {
    company = split.company;
    title = split.title;
  } else if (headerLines.length >= 2) {
    // Two plain lines: the one that reads like a job is the title.
    const looksLikeTitle = /\b(engineer|manager|director|designer|analyst|lead|head|intern|consultant|founder|vp|president|officer|scientist|developer|architect|principal|staff)\b/i;
    const [first, second] = headerLines;
    if (looksLikeTitle.test(first) && !looksLikeTitle.test(second)) {
      title = first;
      company = second;
    } else {
      company = first;
      title = second;
    }
    warnings.push(`Guessed which of "${first.trim()}" and "${second.trim()}" is the employer — check it.`);
  } else {
    company = headerLines[0];
  }

  const clean = (value: string) => value.replace(DATE_RANGE, "").replace(/[,–—|]\s*$/, "").trim();
  company = clean(company);
  title = clean(title);
  if (!company && !title) return null;

  const type = entry.join(" ").match(CONTRACT)?.[0];

  return {
    company: company || title,
    title: title || "Role",
    employmentType: type ? type[0].toUpperCase() + type.slice(1).toLowerCase() : undefined,
    startDate: dates?.startDate,
    endDate: dates?.endDate,
    isCurrent: dates?.isCurrent,
    // Bullets become highlights AND stay in the background: the background is
    // the raw material, and losing the original wording is how detail goes.
    background: entry.join("\n"),
    bullets: bullets.map((text) => ({ text })),
  };
}
