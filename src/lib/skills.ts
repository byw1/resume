import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * The Claude Skills that ship with an instance.
 *
 * They are real files in `skills/`, read from disk rather than pasted into a
 * TypeScript constant, so the copy someone downloads from the docs page is
 * byte-for-byte the copy in the repository. A skill duplicated into source is a
 * skill that drifts from the one people actually have installed.
 */

export type Skill = {
  slug: string;
  name: string;
  description: string;
  /** The whole file, front matter included — this is what gets installed. */
  body: string;
};

const SKILLS_DIR = path.join(process.cwd(), "skills");

/** Pull `name` and `description` out of the YAML front matter, without a parser. */
function frontMatter(body: string) {
  const match = /^---\n([\s\S]*?)\n---/.exec(body);
  const block = match?.[1] ?? "";
  const field = (key: string) => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(block);
    return line?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
  };
  return { name: field("name"), description: field("description") };
}

export async function listSkills(): Promise<Skill[]> {
  let entries: string[];
  try {
    entries = (await readdir(SKILLS_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // A deployment that somehow shipped without the folder should render an
    // empty section, not a 500 on the docs page.
    return [];
  }

  const skills = await Promise.all(
    entries.map(async (slug) => {
      try {
        const body = await readFile(path.join(SKILLS_DIR, slug, "SKILL.md"), "utf8");
        const { name, description } = frontMatter(body);
        return { slug, name: name || slug, description, body };
      } catch {
        return null;
      }
    }),
  );

  return skills
    .filter((skill): skill is Skill => skill !== null)
    .sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
}

/** Orientation first; the task skills read as if you have already seen it. */
const ORDER = ["resume-os", "tailor-a-resume", "run-the-search"];

export async function getSkill(slug: string): Promise<Skill | null> {
  // Never let a path segment escape the skills directory.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return (await listSkills()).find((skill) => skill.slug === slug) ?? null;
}
