#!/usr/bin/env node
/**
 * Regenerates the tool tables in docs/tools/*.mdx from src/lib/mcp/tools.ts.
 *
 * The manual documents every argument of every tool. A hundred tools written
 * out by hand is a hundred things to forget when an argument changes, and the
 * README has now had its tool counts wrong twice for exactly that reason — so
 * this reads the array instead.
 *
 * It does not parse TypeScript. Each tool's `inputSchema:` expression is a call
 * to the local `object`/`str`/`num`/`bool`/`strArray` helpers, so this file
 * defines the same helpers and evaluates the expression: what comes out is the
 * real JSON Schema the server sends, not an approximation of it. The enum
 * constants those expressions close over are duplicated below and checked
 * against the source, so a stage added to the Prisma enum and forgotten here
 * fails the run rather than silently shortening a table.
 *
 * Each page keeps its hand-written introduction: everything above the first
 * `### \`` heading is left alone, everything below it is replaced. Write prose
 * in the MDX, arguments in tools.ts, and never the other way round.
 *
 * Like tools/build-site.mjs, this imports nothing. `node tools/gen-tool-docs.mjs`
 * is the whole thing, and `--check` exits non-zero when a page is out of date.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src", "lib", "mcp", "tools.ts");
const DOCS = join(ROOT, "docs", "tools");
const CHECK = process.argv.includes("--check");

/**
 * The six pages, in the order tools are declared in the array.
 *
 * Ranges rather than name lists: the array is grouped by area already, and a
 * new tool added to a group should land on that group's page without anyone
 * having to come here. `first` is the tool that opens each section — asserted
 * below, so reordering the array is caught rather than silently reshuffling
 * the manual.
 */
const SECTIONS = [
  { file: "brain.mdx", first: "search_brain", last: "delete_extra" },
  { file: "resumes.mdx", first: "get_resume_format", last: "preview_resume_text" },
  { file: "pipeline.mdx", first: "pipeline_stats", last: "complete_task" },
  { file: "crm.mdx", first: "list_companies", last: "create_contact" },
  { file: "connections.mdx", first: "whoami", last: "delete_connection" },
  { file: "admin.mdx", first: "admin_instance_stats", last: "admin_delete_variable" },
];

// ---------------------------------------------------------------------------
// Reading the array
// ---------------------------------------------------------------------------

const src = readFileSync(SOURCE, "utf8");

function slice(from, to) {
  const start = src.indexOf(from);
  const end = src.indexOf(to);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`tools.ts no longer contains "${from}" … "${to}", which this generator reads`);
  }
  return src.slice(start, end);
}

const body = slice("export const tools: McpTool[] = [", "export const prompts: McpPrompt[] = [");

/** Every top-level entry of the array, as its raw source, minus the handler. */
function entries(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== "  {") continue;
    const block = [];
    let j = i + 1;
    while (j < lines.length && lines[j] !== "  }," && lines[j] !== "  }") {
      block.push(lines[j]);
      j += 1;
    }
    i = j;
    if (block.some((line) => /^ {4}name: "/.test(line))) out.push(block);
  }
  return out;
}

// The helpers an inputSchema expression calls, reimplemented to return the same
// shapes tools.ts builds. Keep in step with the definitions at the top of it.
const str = (description) => ({ type: "string", description });
const num = (description) => ({ type: "number", description });
const bool = (description) => ({ type: "boolean", description });
const strArray = (description) => ({ type: "array", items: { type: "string" }, description });
const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

// The constants those expressions close over. Duplicated, then verified against
// the source below — a value added there and not here is an error, not a
// quietly shorter table.
const STAGE_VALUES = [
  "WISHLIST", "APPLIED", "SCREEN", "INTERVIEW", "FINAL",
  "OFFER", "ACCEPTED", "REJECTED", "WITHDRAWN", "GHOSTED",
];
const ACTIVITY_VALUES = [
  "NOTE", "STAGE_CHANGE", "EMAIL_SENT", "EMAIL_RECEIVED", "CALL", "INTERVIEW",
  "FOLLOW_UP", "APPLIED", "OFFER", "REJECTION", "REFERRAL", "OUTREACH",
];
const COMPANY_FILTERS = ["active", "applied", "never-applied", "with-contacts"];
const CONTACT_FILTERS = ["ping-due", "with-application", "no-company"];
const SOURCE_COLOR_VALUES = ["slate", "blue", "teal", "green", "amber", "red", "violet", "pink"];

for (const [name, values] of [
  ["ACTIVITY_VALUES", ACTIVITY_VALUES],
  ["COMPANY_FILTERS", COMPANY_FILTERS],
  ["CONTACT_FILTERS", CONTACT_FILTERS],
  ["SOURCE_COLOR_VALUES", SOURCE_COLOR_VALUES],
]) {
  const declared = new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(src);
  if (!declared) throw new Error(`tools.ts no longer declares ${name}`);
  const found = [...declared[1].matchAll(/"([A-Za-z_-]+)"/g)].map((m) => m[1]);
  if (found.join(",") !== values.join(",")) {
    throw new Error(`${name} changed in tools.ts (${found.join(", ")}) — update tools/gen-tool-docs.mjs`);
  }
}
{
  // STAGES lives in the data layer; tools.ts aliases it as STAGE_VALUES.
  const pipeline = readFileSync(join(ROOT, "src", "lib", "data", "pipeline.ts"), "utf8");
  const declared = /export const STAGES: Stage\[\] = \[([\s\S]*?)\]/.exec(pipeline);
  const found = declared ? [...declared[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]) : [];
  if (found.join(",") !== STAGE_VALUES.join(",")) {
    throw new Error(`STAGES changed in pipeline.ts (${found.join(", ")}) — update tools/gen-tool-docs.mjs`);
  }
}

const scope = {
  str, num, bool, strArray, object,
  STAGE_VALUES, ACTIVITY_VALUES, COMPANY_FILTERS, CONTACT_FILTERS, SOURCE_COLOR_VALUES,
};
const scopeKeys = Object.keys(scope);
const scopeValues = Object.values(scope);

const tools = entries(body).map((block) => {
  const text = block.join("\n");
  const name = /^ {4}name: "([a-z_]+)",$/m.exec(text)?.[1];
  const title = /^ {4}title: "(.*?)",$/m.exec(text)?.[1] ?? "";
  // Descriptions are string literals, sometimes concatenated across lines.
  const description = /^ {4}description:\s*\n?\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+),\n/m.exec(text)?.[1];
  const schemaSource = text
    .slice(text.indexOf("    inputSchema:"), text.indexOf("    annotations:"))
    .split("inputSchema:")[1]
    .trim()
    .replace(/,$/, "");

  if (!name || !description) throw new Error(`Could not read a name and description out of:\n${text.slice(0, 200)}`);

  return {
    name,
    title,
    description: new Function(`return (${description});`)(),
    schema: new Function(...scopeKeys, `return (${schemaSource});`)(...scopeValues),
    adminOnly: /^ {4}adminOnly: true,$/m.test(text),
    destructive: /destructiveHint: true/.test(text),
    openWorld: /openWorldHint: true/.test(text),
  };
});

// ---------------------------------------------------------------------------
// Writing the pages
// ---------------------------------------------------------------------------

const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

function typeName(property) {
  if (property.type === "array") {
    const item = property.items ?? {};
    return item.type === "object" ? "object[]" : `${item.type ?? "string"}[]`;
  }
  if (property.enum) return "enum";
  return property.type ?? "object";
}

function render(tool) {
  const properties = tool.schema.properties ?? {};
  const required = new Set(tool.schema.required ?? []);
  const flags = [
    tool.adminOnly && "**Admin only.**",
    tool.destructive && "**Overwrites or deletes.**",
    tool.openWorld && "**Reaches outside this instance.**",
  ].filter(Boolean);

  const lines = [`### \`${tool.name}\``, "", `_${tool.title}_`, "", tool.description, ""];
  if (flags.length) lines.push(flags.join(" "), "");

  const names = Object.keys(properties);
  if (!names.length) return [...lines, "No arguments.", ""].join("\n");

  lines.push("| Argument | Type | |", "| --- | --- | --- |");
  for (const key of names) {
    const property = properties[key];
    let note = cell(property.description);
    if (property.enum) note = `${note ? `${note}  ` : ""}\`${property.enum.join("` · `")}\``;
    if (required.has(key)) note = note ? `**required** — ${note}` : "**required**";
    lines.push(`| \`${key}\` | ${typeName(property)} | ${note} |`);
  }
  return [...lines, ""].join("\n");
}

let stale = 0;
let cursor = 0;

for (const section of SECTIONS) {
  if (tools[cursor]?.name !== section.first) {
    throw new Error(`Expected ${section.file} to start at ${section.first}, found ${tools[cursor]?.name}`);
  }
  const end = tools.findIndex((tool, i) => i >= cursor && tool.name === section.last);
  if (end < 0) throw new Error(`${section.last} is no longer in tools.ts, so ${section.file} has no end`);

  const owned = tools.slice(cursor, end + 1);
  cursor = end + 1;

  const path = join(DOCS, section.file);
  const page = readFileSync(path, "utf8");
  const marker = page.indexOf("### `");
  if (marker < 0) throw new Error(`${section.file} has no generated section to replace`);

  const next = page.slice(0, marker) + owned.map(render).join("\n");
  if (next === page) {
    console.log(`  ${relative(ROOT, path)}  ${owned.length} tools, unchanged`);
    continue;
  }
  stale += 1;
  if (CHECK) {
    console.error(`  ${relative(ROOT, path)}  OUT OF DATE`);
    continue;
  }
  writeFileSync(path, next);
  console.log(`  ${relative(ROOT, path)}  ${owned.length} tools, rewritten`);
}

if (cursor !== tools.length) {
  throw new Error(`${tools.length - cursor} tools after ${SECTIONS.at(-1).last} have no page: ${tools.slice(cursor).map((t) => t.name).join(", ")}`);
}

const members = tools.filter((tool) => !tool.adminOnly).length;
console.log(`\n${tools.length} tools — ${members} visible to a member, ${tools.length} to an admin, before the workflows are added.`);

if (CHECK && stale) {
  console.error("\nRun `node tools/gen-tool-docs.mjs` and commit the result.");
  process.exit(1);
}
