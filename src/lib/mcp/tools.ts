import type { ActivityType, NoteKind, Stage, User, UserRole } from "@prisma/client";
import * as brain from "@/lib/data/brain";
import * as resumes from "@/lib/data/resumes";
import * as pipeline from "@/lib/data/pipeline";
import * as views from "@/lib/data/views";
import * as audit from "@/lib/data/audit";
import * as system from "@/lib/data/system";
import * as pipelineShare from "@/lib/data/pipeline-share";
import * as users from "@/lib/data/users";
import * as waitlist from "@/lib/data/waitlist";
import * as connections from "@/lib/data/connections";
import {
  getSettings,
  updateSettings,
  emailIsConfigured,
  billingIsConfigured,
  maskSecret,
  listVariables,
  setVariables,
  deleteVariable,
} from "@/lib/settings";
import { billedUserCount, linkBillingCustomer, syncAllBilling } from "@/lib/billing";
import { sendEmail, testEmail } from "@/lib/email";
import { isAdmin, createEphemeralSession, destroySession, SESSION_COOKIE } from "@/lib/auth";
import { parseResumeDoc, RESUME_DOC_SHAPE } from "@/lib/resume-schema";
import { renderPdf, pdfRenderingAvailable } from "@/lib/pdf";
import { clientName, clientsById, guessClient } from "@/lib/mcp/clients";

type Json = Record<string, unknown>;

/**
 * Every tool call runs as exactly one user. The token in the connection URL
 * resolves to them, and `ctx.userId` is threaded into every data call, so a
 * connector can only ever reach its own owner's data.
 */
export type McpContext = {
  userId: string;
  user: User;
  /** The connection this call arrived on, so connection tools can tell which. */
  connectionId: string;
  /** Where this instance is reachable, for building invite links. */
  baseUrl: string;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  /** Admin-only tools are hidden from tools/list for members, not just refused. */
  adminOnly?: boolean;
  handler: (args: Json, ctx: McpContext) => Promise<unknown>;
};

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const bool = (description: string) => ({ type: "boolean", description });
const strArray = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

function object(properties: Json, required: string[] = []): Json {
  return { type: "object", properties, required, additionalProperties: false };
}

const s = (args: Json, key: string) => (typeof args[key] === "string" ? (args[key] as string) : undefined);
const n = (args: Json, key: string) => (typeof args[key] === "number" ? (args[key] as number) : undefined);
const b = (args: Json, key: string) => (typeof args[key] === "boolean" ? (args[key] as boolean) : undefined);
const a = (args: Json, key: string) =>
  Array.isArray(args[key]) ? (args[key] as string[]).map(String) : undefined;

function required(args: Json, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required string argument "${key}"`);
  }
  return value;
}

/**
 * A bare `YYYY-MM-DD` parses as midnight, so an inclusive end date would drop
 * everything that actually happened on it. Push it to the last millisecond.
 */
function endOfDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`"${value}" is not a date I can read`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) date.setUTCHours(23, 59, 59, 999);
  return date;
}

/** Where a published resume lives. Null slug means it isn't published. */
function publicResumeUrl(baseUrl: string, slug: string | null) {
  return slug ? `${baseUrl}/r/${slug}` : null;
}

/** Note kind, validated against the enum rather than trusted. */
function noteKind(args: Json): NoteKind | undefined {
  const value = s(args, "kind");
  return value === "GUARDRAIL" || value === "NOTE" ? value : undefined;
}

/**
 * An enum argument that fails loudly. The transport does not validate schemas,
 * and a filter the data layer doesn't recognise would otherwise return the
 * UNFILTERED list — an assistant asking for "companies I never applied to"
 * must not be handed all of them as if that were the answer.
 */
function enumArg<T extends string>(args: Json, key: string, allowed: readonly T[]): T | undefined {
  const value = s(args, key);
  if (value === undefined) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unknown ${key} "${value}". Use one of: ${allowed.join(", ")}.`);
}

const COMPANY_FILTERS = ["active", "applied", "never-applied", "with-contacts"] as const;
const CONTACT_FILTERS = ["ping-due", "with-application", "no-company"] as const;

/**
 * The profile as a tool should see it.
 *
 * `photo` is hundreds of kilobytes of base64. Returning it would flood an
 * assistant's context with a picture it cannot look at, so every tool that
 * hands back a profile reports whether one is set and leaves the bytes here.
 */
function withoutPhotoBytes<T extends { photo: string }>(profile: T) {
  const { photo, ...rest } = profile;
  return { ...rest, hasPhoto: Boolean(photo) };
}


/** Strip undefined keys so Prisma doesn't try to write them. */
function defined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const STAGE_VALUES = pipeline.STAGES;
const ACTIVITY_VALUES: ActivityType[] = [
  "NOTE",
  "STAGE_CHANGE",
  "EMAIL_SENT",
  "EMAIL_RECEIVED",
  "CALL",
  "INTERVIEW",
  "FOLLOW_UP",
  "APPLIED",
  "OFFER",
  "REJECTION",
  "REFERRAL",
  "OUTREACH",
];

export const tools: McpTool[] = [
  // -------------------------------------------------------------------------
  // BRAIN — read
  // -------------------------------------------------------------------------
  {
    name: "search_brain",
    title: "Search the brain",
    description:
      "Ranked keyword search across everything the user has written about themselves: role brain dumps, achievement highlights, notes, projects and their profile. This is the FIRST tool to call when tailoring a resume or answering a question about their experience. Returns excerpts with the id and kind of each hit so you can fetch the full record.",
    inputSchema: object(
      {
        query: str("Keywords to search for, e.g. 'kubernetes cost savings' or 'led a team'"),
        limit: num("Max results (default 25)"),
      },
      ["query"],
    ),
    handler: async (args, ctx) => brain.searchBrain(ctx.userId, required(args, "query"), n(args, "limit") ?? 25),
  },
  {
    name: "get_brain_snapshot",
    title: "Get the whole brain",
    description:
      "Returns EVERYTHING in the knowledge base at once: profile, all roles with their full brain dumps, all highlights, education, projects, skills, certifications and notes. Use when you need complete context (e.g. writing a resume from scratch). Can be large — prefer search_brain for targeted lookups.",
    inputSchema: object({
      include_brain_dumps: bool(
        "Include the full long-form brain dump text for each role (default true). Set false for a lighter payload.",
      ),
    }),
    handler: async (args, ctx) => {
      const snapshot = await brain.getBrainSnapshot(ctx.userId);
      const profile = withoutPhotoBytes(snapshot.profile);
      if (b(args, "include_brain_dumps") === false) {
        return {
          ...snapshot,
          profile: { ...profile, brainDump: "[omitted]" },
          roles: snapshot.roles.map((r) => ({ ...r, brainDump: "[omitted]" })),
        };
      }
      return { ...snapshot, profile };
    },
  },
  {
    name: "get_profile",
    title: "Get profile",
    description:
      "The user's identity block: name, headline, contact details, links, career summary and their personal brain dump (values, what they want next, comp expectations, non-negotiables). `hasPhoto` says whether a profile photo is set; the picture itself is not returned because it is hundreds of kilobytes of base64 — use set_profile_photo to change it.",
    inputSchema: object({}),
    handler: async (_args, ctx) => withoutPhotoBytes(await brain.getProfile(ctx.userId)),
  },
  {
    name: "update_profile",
    title: "Update profile",
    description:
      "Update any subset of the user's profile fields. Only pass the fields you want to change; omitted fields are left untouched.",
    inputSchema: object({
      fullName: str("Full name"),
      headline: str("Professional headline, e.g. 'Senior Platform Engineer'"),
      email: str("Email address"),
      phone: str("Phone number"),
      location: str("City, State/Country"),
      website: str("Personal website URL"),
      linkedin: str("LinkedIn URL"),
      github: str("GitHub URL"),
      twitter: str("X/Twitter URL"),
      summary: str("Career summary used as the default resume summary"),
      brainDump: str(
        "Long-form personal brain dump. REPLACES the existing text — read it first if you intend to add to it.",
      ),
    }),
    handler: async (args, ctx) =>
      withoutPhotoBytes(await brain.updateProfile(ctx.userId,
        defined({
          fullName: s(args, "fullName"),
          headline: s(args, "headline"),
          email: s(args, "email"),
          phone: s(args, "phone"),
          location: s(args, "location"),
          website: s(args, "website"),
          linkedin: s(args, "linkedin"),
          github: s(args, "github"),
          twitter: s(args, "twitter"),
          summary: s(args, "summary"),
          brainDump: s(args, "brainDump"),
        }),
      )),
  },
  {
    name: "set_profile_photo",
    title: "Set the profile photo",
    description:
      "Give the user a headshot, or remove the one they have. One picture serves the whole app: it is their avatar in the interface, and every resume whose design has the photo switched on renders this exact image — so replacing it here updates every document at once, and there is never a second copy to keep in sync. Pass `url` for a picture that already exists on the web (an https link to a JPEG, PNG or WebP — a GitHub avatar, a personal site) and the server fetches it. Pass `data_uri` when you actually hold the bytes, e.g. after reading a local file: 'data:image/jpeg;base64,…'. Pass remove: true to clear it. Anything over 400KB is refused, so downscale first — a resume prints the photo about an inch square and a 512px original is already more than that needs. Turning the photo ON for a given resume is a separate step: update_resume with showPhoto: true. Never invent a picture of somebody: use only a URL or file the user has given you.",
    inputSchema: object({
      url: str("https link to an image to fetch and store"),
      data_uri: str("The image inline, e.g. 'data:image/jpeg;base64,…'"),
      remove: bool("Remove the existing photo"),
    }),
    handler: async (args, ctx) => {
      if (b(args, "remove")) {
        await brain.setProfilePhoto(ctx.userId, "");
        return { photo: false, message: "Photo removed. Resumes that showed it now render without one." };
      }
      const source = s(args, "data_uri")?.trim() || s(args, "url")?.trim() || "";
      if (!source) throw new Error("Pass a url, a data_uri, or remove: true.");
      const result = await brain.setProfilePhoto(ctx.userId, source);
      return {
        ...result,
        message:
          "Saved. It shows in the app straight away; a resume also needs showPhoto: true, and the Harvard template never renders one.",
      };
    },
  },
  {
    name: "list_roles",
    title: "List roles",
    description:
      "List every job/role in the knowledge base with dates and how many highlights each has. Does not include the full brain dump — use get_role for that.",
    inputSchema: object({}),
    handler: async (_args, ctx) => brain.listRoles(ctx.userId),
  },
  {
    name: "get_role",
    title: "Get a role",
    description:
      "Full detail for one role including its complete brain dump text and all of its achievement highlights.",
    inputSchema: object({ id: str("Role id") }, ["id"]),
    handler: async (args, ctx) => {
      const role = await brain.getRole(ctx.userId, required(args, "id"));
      if (!role) throw new Error(`No role with id ${required(args, "id")}`);
      return role;
    },
  },
  {
    name: "create_role",
    title: "Create a role",
    description:
      "Add a job to the knowledge base. Put every raw detail you were given into brainDump — it is unlimited and is the raw material for future resumes.",
    inputSchema: object(
      {
        company: str("Company name"),
        title: str("Job title"),
        employmentType: str("Full-time, Contract, Internship, Freelance…"),
        location: str("City, State or 'Remote'"),
        startDate: str("Start date as YYYY-MM"),
        endDate: str("End date as YYYY-MM. Leave empty if current."),
        isCurrent: bool("True if this is their current job"),
        summary: str("One or two sentences describing the scope of the role"),
        brainDump: str(
          "THE BRAIN DUMP. Everything raw: projects, metrics, technologies, stories, praise, failures, org context. Markdown welcome. No length limit.",
        ),
        tags: strArray("Freeform tags, e.g. ['fintech','ic','python']"),
      },
      ["company", "title"],
    ),
    handler: async (args, ctx) =>
      brain.createRole(ctx.userId, {
        company: required(args, "company"),
        title: required(args, "title"),
        ...defined({
          employmentType: s(args, "employmentType"),
          location: s(args, "location"),
          startDate: s(args, "startDate"),
          endDate: s(args, "endDate"),
          isCurrent: b(args, "isCurrent"),
          summary: s(args, "summary"),
          brainDump: s(args, "brainDump"),
          tags: a(args, "tags"),
        }),
      }),
  },
  {
    name: "update_role",
    title: "Update a role",
    description:
      "Update fields on an existing role. WARNING: passing brainDump REPLACES the whole dump — use append_role_brain_dump to add to it safely.",
    inputSchema: object(
      {
        id: str("Role id"),
        company: str("Company name"),
        title: str("Job title"),
        employmentType: str("Employment type"),
        location: str("Location"),
        startDate: str("Start date as YYYY-MM"),
        endDate: str("End date as YYYY-MM"),
        isCurrent: bool("Is this the current job"),
        summary: str("Scope summary"),
        brainDump: str("Replaces the entire brain dump"),
        tags: strArray("Tags"),
      },
      ["id"],
    ),
    handler: async (args, ctx) =>
      brain.updateRole(ctx.userId, 
        required(args, "id"),
        defined({
          company: s(args, "company"),
          title: s(args, "title"),
          employmentType: s(args, "employmentType"),
          location: s(args, "location"),
          startDate: s(args, "startDate"),
          endDate: s(args, "endDate"),
          isCurrent: b(args, "isCurrent"),
          summary: s(args, "summary"),
          brainDump: s(args, "brainDump"),
          tags: a(args, "tags"),
        }),
      ),
  },
  {
    name: "append_role_brain_dump",
    title: "Append to a role's brain dump",
    description:
      "Safely ADD text to the end of a role's brain dump without touching what is already there. This is the right tool when the user tells you something new about a job they already have on file.",
    inputSchema: object(
      {
        id: str("Role id"),
        text: str("The new material to append. Markdown welcome."),
        heading: str("Optional markdown H2 heading to file it under, e.g. 'Q3 platform migration'"),
      },
      ["id", "text"],
    ),
    handler: async (args, ctx) =>
      brain.appendToRoleBrainDump(ctx.userId, required(args, "id"), required(args, "text"), s(args, "heading")),
  },
  {
    name: "delete_role",
    title: "Delete a role",
    description: "Permanently delete a role and all of its highlights.",
    inputSchema: object({ id: str("Role id") }, ["id"]),
    handler: async (args, ctx) => brain.deleteRole(ctx.userId, required(args, "id")),
  },

  // -------------------------------------------------------------------------
  // BRAIN — highlights
  // -------------------------------------------------------------------------
  {
    name: "list_highlights",
    title: "List highlights",
    description:
      "Reusable, polished achievement bullets, strongest first. These are the distilled lines you pull from when assembling a resume.",
    inputSchema: object({ roleId: str("Only return highlights for this role id") }),
    handler: async (args, ctx) => brain.listHighlights(ctx.userId, s(args, "roleId")),
  },
  {
    name: "create_highlights",
    title: "Create highlights",
    description:
      "Distil raw brain-dump material into one or more reusable achievement bullets. Write them in resume voice: strong verb, specific scope, quantified outcome. Create several at once.",
    inputSchema: object(
      {
        highlights: {
          type: "array",
          description: "The highlights to create",
          items: object(
            {
              roleId: str("Role this belongs to (omit for a standalone highlight)"),
              text: str("The bullet, in resume voice"),
              impact: str("The quantified outcome if it is not already inside `text`"),
              tags: strArray("Tags for retrieval, e.g. ['leadership','cost']"),
              strength: num("1-5 how strong this bullet is. Default 3."),
            },
            ["text"],
          ),
        },
      },
      ["highlights"],
    ),
    handler: async (args, ctx) => {
      const items = Array.isArray(args.highlights) ? (args.highlights as Json[]) : [];
      return brain.createHighlights(ctx.userId, 
        items.map((item) => ({
          roleId: s(item, "roleId") ?? null,
          text: required(item, "text"),
          impact: s(item, "impact"),
          tags: a(item, "tags"),
          strength: n(item, "strength"),
        })),
      );
    },
  },
  {
    name: "update_highlight",
    title: "Update a highlight",
    description: "Edit or archive one achievement bullet.",
    inputSchema: object(
      {
        id: str("Highlight id"),
        text: str("New bullet text"),
        impact: str("New impact"),
        tags: strArray("New tags"),
        strength: num("1-5"),
        archived: bool("Archive it instead of deleting"),
      },
      ["id"],
    ),
    handler: async (args, ctx) =>
      brain.updateHighlight(ctx.userId, 
        required(args, "id"),
        defined({
          text: s(args, "text"),
          impact: s(args, "impact"),
          tags: a(args, "tags"),
          strength: n(args, "strength"),
          archived: b(args, "archived"),
        }),
      ),
  },
  {
    name: "delete_highlight",
    title: "Delete a highlight",
    description: "Permanently delete an achievement bullet.",
    inputSchema: object({ id: str("Highlight id") }, ["id"]),
    handler: async (args, ctx) => brain.deleteHighlight(ctx.userId, required(args, "id")),
  },

  // -------------------------------------------------------------------------
  // BRAIN — notes and extras
  // -------------------------------------------------------------------------
  {
    name: "list_notes",
    title: "List notes",
    description:
      "Free-floating notes not tied to any single job: STAR stories, interview prep, references, compensation history, anything.",
    inputSchema: object({}),
    handler: async (_args, ctx) => brain.listNotes(ctx.userId),
  },
  {
    name: "create_note",
    title: "Create a note",
    description:
      "Save a free-floating note. Use this for brain-dump material that does not belong to one specific job. Set kind: GUARDRAIL to make it a standing rule instead — see the kind field.",
    inputSchema: object(
      {
        title: str("Short title"),
        body: str("The note body. Markdown welcome, no length limit."),
        tags: strArray("Tags"),
        pinned: bool("Pin to the top of the notes list"),
        kind: {
          type: "string",
          enum: ["NOTE", "GUARDRAIL"],
          description:
            "GUARDRAIL makes this a standing rule: it is prepended to the briefing every AI client receives on connect, so it constrains work before any tool is called. Use it for things that must never be got wrong — how they may and may not be described, numbers that are unsettled and must not be cited, credit that must not be overstated. Everything else is a NOTE (the default), which is only found by searching.",
        },
      },
      ["title"],
    ),
    handler: async (args, ctx) =>
      brain.createNote(ctx.userId, {
        title: required(args, "title"),
        ...defined({
          body: s(args, "body"),
          tags: a(args, "tags"),
          pinned: b(args, "pinned"),
          kind: noteKind(args),
        }),
      }),
  },
  {
    name: "update_note",
    title: "Update a note",
    description:
      "Edit an existing note. Passing `body` replaces the whole body. Promote a note to a standing rule, or demote one, with `kind`.",
    inputSchema: object(
      {
        id: str("Note id"),
        title: str("New title"),
        body: str("New body (replaces existing)"),
        tags: strArray("New tags"),
        pinned: bool("Pinned state"),
        kind: {
          type: "string",
          enum: ["NOTE", "GUARDRAIL"],
          description:
            "GUARDRAIL makes this a standing rule: it is prepended to the briefing every AI client receives on connect, so it constrains work before any tool is called. Use it for things that must never be got wrong — how they may and may not be described, numbers that are unsettled and must not be cited, credit that must not be overstated. Everything else is a NOTE (the default), which is only found by searching.",
        },
      },
      ["id"],
    ),
    handler: async (args, ctx) =>
      brain.updateNote(ctx.userId, 
        required(args, "id"),
        defined({
          title: s(args, "title"),
          body: s(args, "body"),
          tags: a(args, "tags"),
          pinned: b(args, "pinned"),
          kind: noteKind(args),
        }),
      ),
  },
  {
    name: "list_extras",
    title: "List education / projects / skills / certifications",
    description:
      "Read one of the supporting knowledge-base collections: education history, side projects, skill groups, or certifications.",
    inputSchema: object(
      {
        kind: {
          type: "string",
          enum: ["education", "projects", "skills", "certifications"],
          description: "Which collection to read",
        },
      },
      ["kind"],
    ),
    handler: async (args, ctx) => {
      switch (required(args, "kind")) {
        case "education":
          return brain.listEducation(ctx.userId);
        case "projects":
          return brain.listProjects(ctx.userId);
        case "skills":
          return brain.listSkillGroups(ctx.userId);
        case "certifications":
          return brain.listCertifications(ctx.userId);
        default:
          throw new Error("kind must be education | projects | skills | certifications");
      }
    },
  },
  {
    name: "create_extra",
    title: "Add education / project / skill group / certification",
    description:
      "Add an item to one of the supporting collections. Only the fields relevant to `kind` are read — see each field's description for which kind it belongs to.",
    inputSchema: object(
      {
        kind: {
          type: "string",
          enum: ["education", "projects", "skills", "certifications"],
          description: "Which collection to add to",
        },
        school: str("[education] School name"),
        degree: str("[education] e.g. 'B.S.'"),
        field: str("[education] e.g. 'Computer Science'"),
        gpa: str("[education] GPA"),
        details: str("[education] Honours, coursework, activities"),
        name: str("[projects] project name · [skills] group name · [certifications] cert name"),
        role: str("[projects] Your role on the project"),
        url: str("[projects | certifications] Link"),
        description: str("[projects] One-line description"),
        brainDump: str("[projects] Long-form raw detail about the project"),
        skills: strArray("[skills] The skills in this group, e.g. ['Python','Go','Rust']"),
        issuer: str("[certifications] Issuing body"),
        date: str("[certifications] Date earned"),
        location: str("[education] Location"),
        startDate: str("[education | projects] YYYY-MM"),
        endDate: str("[education | projects] YYYY-MM"),
        tags: strArray("[projects] Tags"),
      },
      ["kind"],
    ),
    handler: async (args, ctx) => {
      switch (required(args, "kind")) {
        case "education":
          return brain.createEducation(ctx.userId, {
            school: required(args, "school"),
            ...defined({
              degree: s(args, "degree"),
              field: s(args, "field"),
              location: s(args, "location"),
              startDate: s(args, "startDate"),
              endDate: s(args, "endDate"),
              gpa: s(args, "gpa"),
              details: s(args, "details"),
            }),
          });
        case "projects":
          return brain.createProject(ctx.userId, {
            name: required(args, "name"),
            ...defined({
              role: s(args, "role"),
              url: s(args, "url"),
              description: s(args, "description"),
              brainDump: s(args, "brainDump"),
              tags: a(args, "tags"),
              startDate: s(args, "startDate"),
              endDate: s(args, "endDate"),
            }),
          });
        case "skills":
          return brain.createSkillGroup(ctx.userId, {
            name: required(args, "name"),
            skills: a(args, "skills") ?? [],
          });
        case "certifications":
          return brain.createCertification(ctx.userId, {
            name: required(args, "name"),
            ...defined({ issuer: s(args, "issuer"), date: s(args, "date"), url: s(args, "url") }),
          });
        default:
          throw new Error("kind must be education | projects | skills | certifications");
      }
    },
  },
  {
    name: "update_extra",
    title: "Update an education / project / skill group / certification",
    description:
      "Change fields on an item in one of the supporting collections. Reach for this instead of deleting and re-creating — that would hand the item a new id and break anything referring to it. Only the fields you pass are changed; everything you leave out keeps its current value, so you do not need to read the item first. Fields not relevant to `kind` are ignored.",
    inputSchema: object(
      {
        kind: {
          type: "string",
          enum: ["education", "projects", "skills", "certifications"],
          description: "Which collection the item is in",
        },
        id: str("Id of the item to change"),
        school: str("[education] School name"),
        degree: str("[education] e.g. 'B.S.'"),
        field: str("[education] e.g. 'Computer Science'"),
        gpa: str("[education] GPA"),
        details: str("[education] Honours, coursework, activities"),
        name: str("[projects] project name · [skills] group name · [certifications] cert name"),
        role: str("[projects] Your role on the project"),
        url: str("[projects | certifications] Link"),
        description: str("[projects] One-line description"),
        brainDump: str("[projects] Long-form raw detail about the project"),
        skills: strArray("[skills] REPLACES the whole list, e.g. ['Python','Go','Rust']"),
        issuer: str("[certifications] Issuing body"),
        date: str("[certifications] Date earned"),
        location: str("[education] Location"),
        startDate: str("[education | projects] YYYY-MM"),
        endDate: str("[education | projects] YYYY-MM"),
        tags: strArray("[projects] REPLACES the whole list"),
      },
      ["kind", "id"],
    ),
    handler: async (args, ctx) => {
      const id = required(args, "id");
      switch (required(args, "kind")) {
        case "education":
          return brain.updateEducation(ctx.userId, id, 
            defined({
              school: s(args, "school"),
              degree: s(args, "degree"),
              field: s(args, "field"),
              location: s(args, "location"),
              startDate: s(args, "startDate"),
              endDate: s(args, "endDate"),
              gpa: s(args, "gpa"),
              details: s(args, "details"),
            }),
          );
        case "projects":
          return brain.updateProject(ctx.userId, id, 
            defined({
              name: s(args, "name"),
              role: s(args, "role"),
              url: s(args, "url"),
              description: s(args, "description"),
              brainDump: s(args, "brainDump"),
              tags: a(args, "tags"),
              startDate: s(args, "startDate"),
              endDate: s(args, "endDate"),
            }),
          );
        case "skills":
          return brain.updateSkillGroup(ctx.userId, id, 
            defined({ name: s(args, "name"), skills: a(args, "skills") }),
          );
        case "certifications":
          return brain.updateCertification(ctx.userId, id, 
            defined({
              name: s(args, "name"),
              issuer: s(args, "issuer"),
              date: s(args, "date"),
              url: s(args, "url"),
            }),
          );
        default:
          throw new Error("kind must be education | projects | skills | certifications");
      }
    },
  },
  {
    name: "delete_extra",
    title: "Delete an education / project / skill group / certification",
    description: "Remove an item from one of the supporting collections.",
    inputSchema: object(
      {
        kind: {
          type: "string",
          enum: ["education", "projects", "skills", "certifications"],
          description: "Which collection the item is in",
        },
        id: str("Item id"),
      },
      ["kind", "id"],
    ),
    handler: async (args, ctx) => {
      const id = required(args, "id");
      switch (required(args, "kind")) {
        case "education":
          return brain.deleteEducation(ctx.userId, id);
        case "projects":
          return brain.deleteProject(ctx.userId, id);
        case "skills":
          return brain.deleteSkillGroup(ctx.userId, id);
        case "certifications":
          return brain.deleteCertification(ctx.userId, id);
        default:
          throw new Error("kind must be education | projects | skills | certifications");
      }
    },
  },

  // -------------------------------------------------------------------------
  // RESUMES
  // -------------------------------------------------------------------------
  {
    name: "get_resume_format",
    title: "Get the resume document format",
    description:
      "Returns the exact JSON shape of a resume document plus the available templates, fonts and writing guidance. Call this once before your first create_resume or update_resume so the document you build validates.",
    inputSchema: object({}),
    handler: async (_args, ctx) => ({
      documentShape: RESUME_DOC_SHAPE,
      defaultTemplate: "harvard",
      templates: [
        {
          key: "harvard",
          description:
            "DEFAULT. The Harvard OCS format: Times-metric serif, everything one size, name and section headings centred over full-width rules, each entry two justified lines (organisation/location, then role/dates). Dense, black-and-white, maximally ATS-safe. Use this unless asked otherwise.",
        },
        { key: "classic", description: "Serif headings, centred header. Timeless, ATS-safe. Takes a photo, centred above the name." },
        { key: "modern", description: "Sans-serif, accent rules, left-aligned header. Takes a photo, beside the name." },
        { key: "compact", description: "Tight leading, two-column skills. Fits the most content. Takes a photo, beside the name." },
        { key: "editorial", description: "Large display name, generous whitespace, magazine feel. Takes a photo, squared off beside the name." },
      ],
      fonts: ["serif", "inter", "mono"],
      defaults: {
        template: "harvard",
        fontFamily: "serif",
        accent: "#000000",
        fontSize: 10,
        lineHeight: 1.2,
        pageMargin: 48,
        showPhoto: false,
      },
      guidance: [
        "Dates use YYYY-MM. Set isCurrent: true instead of an endDate for the current job.",
        "Bullets: strong verb first, specific scope, quantified outcome. One line each where possible.",
        "Harvard house style: no personal pronouns, each bullet a phrase rather than a full sentence, quantified wherever the brain dump gives you a number.",
        "Harvard renders the organisation on line one and the role on line two, so fill in BOTH `company` and `title` on every experience entry, plus `location`.",
        "Section order: experience-first for anyone with real work history. Education-first is the Harvard student convention — use it only for students and recent graduates.",
        "For a 'Leadership & Activities' section, use an experience-kind section with that heading — organisation, role, location and dates all lay out correctly.",
        "In Harvard, education `details` render as plain lines (thesis, relevant coursework, honours), not bullets.",
        "Set visible: false to keep a section in the document but off the page.",
        "Aim for roughly 40-48 rendered lines per page; call preview_resume_text to sanity-check length before saving.",
        "Photos: off unless asked. showPhoto draws the user's profile picture (set_profile_photo), never one you supply per document. Harvard never renders one — it is a US academic format and a face on it is wrong. US and UK applications generally omit photos; much of Europe and Latin America expects one.",
      ],
    }),
  },
  {
    name: "list_resumes",
    title: "List resumes",
    description:
      "All saved resumes with their target role/company, how many applications each is attached to, and publicUrl — the shareable link, or null if that resume isn't published.",
    inputSchema: object({}),
    handler: async (_args, ctx) => {
      const all = await resumes.listResumes(ctx.userId);
      return all.map((resume) => ({
        ...resume,
        publicUrl: publicResumeUrl(ctx.baseUrl, resume.slug),
      }));
    },
  },
  {
    name: "get_resume",
    title: "Get a resume",
    description:
      "Fetch one resume: its settings, its full document JSON, and publicUrl — the shareable link, or null if it isn't published. Read this before update_resume, which replaces the whole document.",
    inputSchema: object(
      {
        id: str("Resume id"),
        as_text: bool("Also return a flat plain-text rendering, useful for reviewing length and flow"),
      },
      ["id"],
    ),
    handler: async (args, ctx) => {
      const resume = await resumes.getResume(ctx.userId, required(args, "id"));
      if (!resume) throw new Error("Resume not found");
      // `photo` is the resolved image itself; showPhoto already says whether
      // this document uses one, and the base64 helps nobody reading this.
      const { photo, ...row } = resume;
      const withUrl = { ...row, publicUrl: publicResumeUrl(ctx.baseUrl, resume.slug) };
      if (b(args, "as_text")) {
        return {
          ...withUrl,
          text: resumes.resumeToText(resume.doc),
          estimatedLines: resumes.estimateLines(resume.doc),
        };
      }
      return withUrl;
    },
  },
  {
    name: "create_resume",
    title: "Create a resume",
    description:
      "Create a resume. Either pass a complete `data` document you have written (call get_resume_format first), or pass seed_from_brain: true to auto-populate a first draft from the knowledge base and then refine it with update_resume.",
    inputSchema: object(
      {
        name: str("What to call this resume, e.g. 'Stripe — Staff Engineer'"),
        targetRole: str("The role being targeted"),
        targetCompany: str("The company being targeted"),
        template: str("harvard (default) | classic | modern | compact | editorial"),
        accent: str("Accent colour as a hex string. Defaults to '#000000', which is what Harvard expects."),
        fontFamily: str("serif (default) | inter | mono"),
        fontSize: num("Base font size in points, 9-12. Default 10."),
        lineHeight: num("Line height, 1.15-1.6. Default 1.35."),
        notes: str("Private notes about this version — what you tailored and why"),
        showPhoto: bool(
          "Render the user's profile photo in the header. Needs a photo set (see set_profile_photo) and a template that takes one — harvard never does.",
        ),
        seedFromBrain: bool("Auto-build a first draft from the knowledge base"),
        data: {
          type: "object",
          description:
            "The full resume document. See get_resume_format for the exact shape. Omit if using seedFromBrain.",
          additionalProperties: true,
        },
      },
      ["name"],
    ),
    handler: async (args, ctx) =>
      resumes.createResume(ctx.userId, {
        name: required(args, "name"),
        seedFromBrain: b(args, "seedFromBrain"),
        data: args.data,
        ...defined({
          targetRole: s(args, "targetRole"),
          targetCompany: s(args, "targetCompany"),
          template: s(args, "template"),
          accent: s(args, "accent"),
          fontFamily: s(args, "fontFamily"),
          fontSize: n(args, "fontSize"),
          lineHeight: n(args, "lineHeight"),
          notes: s(args, "notes"),
          showPhoto: b(args, "showPhoto"),
        }),
      }),
  },
  {
    name: "update_resume",
    title: "Update a resume",
    description:
      "Update a resume's settings and/or replace its document. Passing `data` replaces the ENTIRE document, so call get_resume first, modify the JSON you get back, and send the whole thing.",
    inputSchema: object(
      {
        id: str("Resume id"),
        name: str("New name"),
        targetRole: str("Target role"),
        targetCompany: str("Target company"),
        template: str("harvard | classic | modern | compact | editorial"),
        accent: str("Accent colour hex"),
        fontFamily: str("serif | inter | mono"),
        fontSize: num("Base font size in points"),
        lineHeight: num("Line height"),
        notes: str("Private notes"),
        isFavorite: bool("Pin this resume to the top"),
        showPhoto: bool(
          "Render the user's profile photo in the header. The picture is the one on their profile, so this only switches it on or off for this document. Harvard ignores it by convention.",
        ),
        data: {
          type: "object",
          description: "The complete replacement resume document",
          additionalProperties: true,
        },
      },
      ["id"],
    ),
    handler: async (args, ctx) =>
      resumes.updateResume(ctx.userId, required(args, "id"), {
        ...(args.data !== undefined ? { data: args.data } : {}),
        ...defined({
          name: s(args, "name"),
          targetRole: s(args, "targetRole"),
          targetCompany: s(args, "targetCompany"),
          template: s(args, "template"),
          accent: s(args, "accent"),
          fontFamily: s(args, "fontFamily"),
          fontSize: n(args, "fontSize"),
          lineHeight: n(args, "lineHeight"),
          notes: s(args, "notes"),
          isFavorite: b(args, "isFavorite"),
          showPhoto: b(args, "showPhoto"),
        }),
      }),
  },
  {
    name: "export_resume_pdf",
    title: "Export a resume as a PDF",
    description:
      "Render a resume to a real PDF on the server and return a download url, plus how many pages it actually came out to. Reach for this when the user wants a FILE to attach to an email or upload to a form — use publish_resume instead when they want a link. The page count is measured from the rendered document rather than estimated, so it is the reliable way to answer 'does this fit on one page?' before they send it. The url opens in their browser, where they are already signed in; it is not a public link and nobody else can fetch it. If this instance has no headless browser the tool says so and points at the print page, which produces the same document through the browser's own print dialog.",
    inputSchema: object({ id: str("Resume id") }, ["id"]),
    handler: async (args, ctx) => {
      const id = required(args, "id");
      const resume = await resumes.getResume(ctx.userId, id);
      if (!resume) throw new Error(`No resume with id ${id}`);

      const downloadUrl = `${ctx.baseUrl}/api/resumes/${id}/pdf`;
      if (!pdfRenderingAvailable()) {
        return {
          available: false,
          printUrl: `${ctx.baseUrl}/print/${id}`,
          message:
            "This instance has no headless browser, so it cannot render PDFs server-side. Open the print url and use the browser's Save as PDF.",
        };
      }

      // Render once here so the answer is "it worked, and it is N pages",
      // not "here is a url, hope it works".
      const token = await createEphemeralSession(ctx.userId);
      try {
        const { bytes, pages } = await renderPdf({
          url: `${ctx.baseUrl}/print/${id}`,
          sessionCookie: {
            name: SESSION_COOKIE,
            value: token,
            domain: new URL(ctx.baseUrl).hostname,
            secure: ctx.baseUrl.startsWith("https:"),
          },
        });
        return {
          available: true,
          url: downloadUrl,
          pages,
          sizeKb: Math.round(bytes.length / 1024),
          name: resume.name,
        };
      } finally {
        await destroySession(token);
      }
    },
  },
  {
    name: "publish_resume",
    title: "Publish a resume to a public link",
    description:
      "Give a resume a shareable web address. Reach for this whenever the user needs a LINK rather than a file — an application form with a 'portfolio or resume URL' field, a recruiter asking them to send something over, a message where attaching a PDF would be awkward. Returns publicUrl, which is the whole point: hand it straight to the user. Anyone with the link can read the resume without signing in, and the link is the only protection, so it is long and random — it cannot be guessed or found by searching, and the page tells search engines not to index it. The user's private notes on the resume are never shown — but if this resume has showPhoto on, their face is on that page, visible to anyone holding the link. Say so before publishing one, or offer to turn the photo off first. Calling this again while the resume is already published returns the SAME url, so it is safe to repeat. If the resume was previously unpublished, publishing mints a brand new url and the old one stays dead.",
    inputSchema: object({ id: str("Resume id") }, ["id"]),
    handler: async (args, ctx) => {
      const resume = await resumes.publishResume(ctx.userId, required(args, "id"));
      return { ...resume, publicUrl: publicResumeUrl(ctx.baseUrl, resume.slug) };
    },
  },
  {
    name: "unpublish_resume",
    title: "Withdraw a resume's public link",
    description:
      "Turn off a resume's public link. Reach for this when the user is done with a link, or has sent one somewhere they regret. The page starts returning 'not found' immediately for everyone who has the url. This is PERMANENT for that address: the link is not parked or paused, it is destroyed, and publishing the same resume later produces a different url. Say so before doing it if the user might still need the old link working. Does not touch the resume itself — nothing is deleted.",
    inputSchema: object({ id: str("Resume id") }, ["id"]),
    handler: async (args, ctx) => resumes.unpublishResume(ctx.userId, required(args, "id")),
  },
  {
    name: "duplicate_resume",
    title: "Duplicate a resume",
    description:
      "Copy an existing resume so you can tailor a variant without losing the original. The usual flow for a new application.",
    inputSchema: object({ id: str("Resume id to copy"), name: str("Name for the copy") }, ["id"]),
    handler: async (args, ctx) => resumes.duplicateResume(ctx.userId, required(args, "id"), s(args, "name")),
  },
  {
    name: "delete_resume",
    title: "Delete a resume",
    description: "Permanently delete a resume.",
    inputSchema: object({ id: str("Resume id") }, ["id"]),
    handler: async (args, ctx) => resumes.deleteResume(ctx.userId, required(args, "id")),
  },
  {
    name: "preview_resume_text",
    title: "Preview a resume document as text",
    description:
      "Render a resume document JSON to plain text WITHOUT saving it, and estimate how many lines it will occupy. Use it to check length and flow before committing with create_resume or update_resume.",
    inputSchema: object(
      {
        data: {
          type: "object",
          description: "A resume document to render",
          additionalProperties: true,
        },
      },
      ["data"],
    ),
    handler: async (args, ctx) => {
      const doc = parseResumeDoc(args.data);
      return {
        text: resumes.resumeToText(doc),
        estimatedLines: resumes.estimateLines(doc),
        approxPages: Math.max(1, Math.ceil(resumes.estimateLines(doc) / 46)),
      };
    },
  },

  // -------------------------------------------------------------------------
  // PIPELINE
  // -------------------------------------------------------------------------
  {
    name: "pipeline_stats",
    title: "Pipeline stats",
    description:
      "Counts by stage, active applications, applications sent this week, interviews, offers, open tasks, follow-ups due and response rate. Start here for any 'how is my search going' question.",
    inputSchema: object({}),
    handler: async (_args, ctx) => pipeline.pipelineStats(ctx.userId),
  },
  {
    name: "list_applications",
    title: "List applications",
    description:
      "List job applications. By default the closed ones (accepted, rejected, withdrawn, ghosted) are excluded. Every row carries daysInStage — how long it has sat where it is, measured from the last stage change rather than the last edit — which is the field to sort on when someone asks what has gone quiet or what needs chasing.",
    inputSchema: object({
      stage: { type: "string", enum: STAGE_VALUES, description: "Only this stage" },
      includeClosed: bool("Include accepted / rejected / withdrawn"),
      search: str("Filter by company, role title or notes"),
    }),
    handler: async (args, ctx) =>
      pipeline.listApplications(ctx.userId, {
        stage: s(args, "stage") as Stage | undefined,
        includeClosed: b(args, "includeClosed"),
        search: s(args, "search"),
      }),
  },
  {
    name: "get_application",
    title: "Get an application",
    description:
      "Full detail for one application including the job description, the complete activity timeline, contacts and tasks.",
    inputSchema: object({ id: str("Application id") }, ["id"]),
    handler: async (args, ctx) => {
      const application = await pipeline.getApplication(ctx.userId, required(args, "id"));
      if (!application) throw new Error(`No application with id ${required(args, "id")}`);
      return application;
    },
  },
  {
    name: "capture_job_posting",
    title: "Capture a job posting from its URL",
    description:
      "The FIRST tool to call when someone shares a link to a job posting. Fetches the page server-side, reads the structured posting data most job boards publish, and creates the application in one move: company matched or created (with its own website when the posting names one, which puts their logo on the pipeline), role title, full description, location, compensation and source all filled, starting on the wishlist. Returns captured true with the new application and its id. When the page doesn't state the employer or the role readably, returns captured false plus whatever WAS parsed and creates NOTHING — in that case show the person what was found, ask for the missing pieces, and use create_application. Never guess an employer's name from a URL. If they applied already, follow with move_application_stage.",
    inputSchema: object({ url: str("The posting's URL, e.g. a Greenhouse, Lever, Ashby, Workday or LinkedIn job link") }, ["url"]),
    handler: async (args, ctx) => pipeline.captureJobPosting(ctx.userId, required(args, "url")),
  },
  {
    name: "list_application_sources",
    title: "List the source channels on file",
    description:
      "The source labels this person already uses ('LinkedIn', 'Referral from Dana', …), most-used first, followed by the standard starters. Call it before writing sources on create_application or update_application so you reuse their exact spellings instead of minting near-duplicates — it covers every application including closed ones, which list_applications hides by default. Read-only.",
    inputSchema: object({}),
    handler: async (_args, ctx) => pipeline.listSourceOptions(ctx.userId),
  },
  {
    name: "create_application",
    title: "Create an application",
    description:
      "Track a new job. Paste the full posting into jobDescription — it is what you will tailor the resume against later. The company is created automatically if it does not exist. Pass companyWebsite when you know it — it is what makes the company's logo appear in the pipeline, and it costs nothing to include. A job link and description are OPTIONAL: an application that started as a LinkedIn message with no listing is still an application — track it with just company and roleTitle, put 'Cold outreach' in sources, and attach the person messaged with create_contact.",
    inputSchema: object(
      {
        company: str("Company name"),
        companyWebsite: str("The company's own site, e.g. stripe.com. Shows their logo in the pipeline."),
        roleTitle: str("Job title"),
        stage: { type: "string", enum: STAGE_VALUES, description: "Starting stage. Default WISHLIST." },
        jobUrl: str("Link to the posting"),
        jobDescription: str("The full job posting text"),
        location: str("Job location"),
        workMode: str("Remote | Hybrid | On-site"),
        salaryRange: str("Advertised or expected compensation"),
        sources: strArray(
          "Where it came from, and several at once is normal: ['LinkedIn', 'Referral'] for a posting a friend also flagged. Free strings; call list_application_sources first and reuse the person's existing spellings where they fit.",
        ),
        source: str("Legacy single-source spelling. Prefer sources; ignored when sources is passed."),
        excitement: num("1-5 how much they want this"),
        fit: num("1-5 how strong a fit they are"),
        notes: str("Any notes"),
        appliedAt: str("ISO date they applied"),
        nextFollowUpAt: str("ISO date to follow up. Auto-set from the stage if omitted."),
        resumeId: str("Id of the resume used"),
      },
      ["company", "roleTitle"],
    ),
    handler: async (args, ctx) =>
      pipeline.createApplication(ctx.userId, {
        company: required(args, "company"),
        roleTitle: required(args, "roleTitle"),
        ...defined({
          companyWebsite: s(args, "companyWebsite"),
          stage: s(args, "stage") as Stage | undefined,
          jobUrl: s(args, "jobUrl"),
          jobDescription: s(args, "jobDescription"),
          location: s(args, "location"),
          workMode: s(args, "workMode"),
          salaryRange: s(args, "salaryRange"),
          sources: a(args, "sources"),
          source: s(args, "source"),
          excitement: n(args, "excitement"),
          fit: n(args, "fit"),
          notes: s(args, "notes"),
          appliedAt: s(args, "appliedAt"),
          nextFollowUpAt: s(args, "nextFollowUpAt"),
          resumeId: s(args, "resumeId"),
        }),
      }),
  },
  {
    name: "update_application",
    title: "Update an application",
    description:
      "Update fields on an application. Changing `stage` here also writes a timeline entry and resets the follow-up date. `sources` REPLACES the whole list — read the current one from get_application, add or remove, and pass the full list back.",
    inputSchema: object(
      {
        id: str("Application id"),
        company: str("Company name"),
        companyWebsite: str("The company's own site, e.g. stripe.com. Shows their logo in the pipeline."),
        roleTitle: str("Job title"),
        stage: { type: "string", enum: STAGE_VALUES, description: "New stage" },
        jobUrl: str("Posting link"),
        jobDescription: str("Job posting text"),
        location: str("Location"),
        workMode: str("Remote | Hybrid | On-site"),
        salaryRange: str("Compensation"),
        sources: strArray("The full list of where it came from — replaces what is there"),
        source: str(
          "Legacy single-source spelling. WARNING: this also REPLACES the entire sources list with just this one value — read the current list from get_application first, or use sources to write the full list. Ignored when sources is passed.",
        ),
        excitement: num("1-5"),
        fit: num("1-5"),
        notes: str("Notes"),
        appliedAt: str("ISO date applied"),
        nextFollowUpAt: str("ISO date of next follow-up, or empty string to clear"),
        resumeId: str("Attach this resume id, or empty string to detach"),
      },
      ["id"],
    ),
    handler: async (args, ctx) =>
      pipeline.updateApplication(ctx.userId, required(args, "id"), {
        ...defined({
          company: s(args, "company"),
          companyWebsite: s(args, "companyWebsite"),
          roleTitle: s(args, "roleTitle"),
          stage: s(args, "stage") as Stage | undefined,
          jobUrl: s(args, "jobUrl"),
          jobDescription: s(args, "jobDescription"),
          location: s(args, "location"),
          workMode: s(args, "workMode"),
          salaryRange: s(args, "salaryRange"),
          sources: a(args, "sources"),
          source: s(args, "source"),
          excitement: n(args, "excitement"),
          fit: n(args, "fit"),
          notes: s(args, "notes"),
          appliedAt: s(args, "appliedAt"),
          nextFollowUpAt: s(args, "nextFollowUpAt"),
          resumeId: s(args, "resumeId"),
        }),
      }),
  },
  {
    name: "move_applications_stage",
    title: "Move several applications to one stage",
    description:
      "Move a batch of applications to the same stage — the tool for 'close out everything I never heard back from' or 'mark these four as applied'. Each one gets its own timeline entry and follow-up date, exactly as if it had been moved on its own, so the funnel history stays intact. Ids that no longer exist are skipped rather than failing the batch; the result lists what moved and what was skipped. Read the ids from list_applications first, and for silence use GHOSTED rather than REJECTED.",
    inputSchema: object(
      {
        ids: strArray("The application ids to move"),
        stage: { type: "string", enum: STAGE_VALUES, description: "The stage they all move to" },
      },
      ["ids", "stage"],
    ),
    handler: async (args, ctx) => {
      const ids = a(args, "ids");
      if (!ids?.length) throw new Error("ids is required: pass at least one application id");
      return pipeline.moveApplicationsStage(ctx.userId, ids, required(args, "stage") as Stage);
    },
  },
  {
    name: "move_application_stage",
    title: "Move an application to a new stage",
    description:
      "Advance or close an application. Automatically logs the change to the timeline and schedules the next follow-up. On the four endings: REJECTED is for when they said no, WITHDRAWN for when the user pulled out, ACCEPTED for a signed offer, and GHOSTED for the far more common ending where nobody ever replied. Use GHOSTED rather than REJECTED when there was no answer — the funnel counts a rejection as a decision against the user and a ghosting as a non-response, and the advice that falls out of those is different.",
    inputSchema: object(
      {
        id: str("Application id"),
        stage: { type: "string", enum: STAGE_VALUES, description: "The new stage" },
        note: str("Optional note for the timeline entry"),
      },
      ["id", "stage"],
    ),
    handler: async (args, ctx) =>
      pipeline.moveApplicationStage(ctx.userId, 
        required(args, "id"),
        required(args, "stage") as Stage,
        s(args, "note"),
      ),
  },
  {
    name: "delete_application",
    title: "Delete an application",
    description: "Permanently delete an application and its timeline.",
    inputSchema: object({ id: str("Application id") }, ["id"]),
    handler: async (args, ctx) => pipeline.deleteApplication(ctx.userId, required(args, "id")),
  },
  {
    name: "log_activity",
    title: "Log activity on an application or a contact",
    description:
      "Append to a timeline. Pass applicationId for things that happened on an application — a recruiter call about the role, an interview, a note to self. Pass contactId for things that happened with a PERSON — a coffee, a call, a reply — and it becomes their history: the contact's page shows it and their 'last touched' date moves. Exactly one of the two, never both. When someone mentions talking to a person they know, this with contactId is how it gets remembered. Type OUTREACH is for messages the user sent first — a LinkedIn DM to a hiring manager, a cold email — which is how many applications actually start.",
    inputSchema: object(
      {
        applicationId: str("Application id — for events on an application"),
        contactId: str("Contact id — for events with a person"),
        type: { type: "string", enum: ACTIVITY_VALUES, description: "Kind of activity. Default NOTE." },
        body: str("What happened"),
        occurredAt: str("ISO datetime it happened. Defaults to now."),
      },
      ["body"],
    ),
    handler: async (args, ctx) =>
      pipeline.addActivity(ctx.userId, {
        applicationId: s(args, "applicationId"),
        contactId: s(args, "contactId"),
        body: required(args, "body"),
        type: s(args, "type") as ActivityType | undefined,
        occurredAt: s(args, "occurredAt"),
      }),
  },
  {
    name: "list_activities",
    title: "List recent activity",
    description:
      "Recent timeline entries across the whole search, or for one application. Good for 'what happened this week'.",
    inputSchema: object({
      applicationId: str("Limit to one application"),
      limit: num("Max entries, default 40"),
    }),
    handler: async (args, ctx) => pipeline.listActivities(ctx.userId, s(args, "applicationId"), n(args, "limit") ?? 40),
  },
  {
    name: "list_follow_ups",
    title: "List follow-ups that are due",
    description:
      "The 'who do I need to chase today' tool. Returns two lists: applications whose follow-up date has arrived or passed, and contacts whose ping date has — the people you meant to get back in touch with. Both are due work; plan a day from the pair.",
    inputSchema: object({
      withinDays: num("Look ahead this many days. 0 = due now, 7 = due within a week."),
    }),
    handler: async (args, ctx) => {
      const withinDays = n(args, "withinDays") ?? 0;
      const [applications, contacts] = await Promise.all([
        pipeline.followUpsDue(ctx.userId, withinDays),
        pipeline.contactFollowUpsDue(ctx.userId, withinDays),
      ]);
      return { applications, contacts };
    },
  },
  {
    name: "diagnose_search",
    title: "Diagnose the job search",
    description:
      "Works out what is actually going wrong with the search, rather than reporting counts. Returns a one-sentence verdict naming which step of the funnel is losing people — no responses at all is a resume or targeting problem, responses that die at the phone screen is a story problem, interviews that do not convert is something else again — plus per-step conversion, median days spent in each stage, weekly volume for the last six weeks, applications that have gone quiet, and the response rate of each resume so you can see which one is working. Progress is measured by the furthest stage an application ever reached, so a rejection after a final round counts as having got that far. Reach for this before giving advice about a search: it is the difference between 'send more applications' and 'stop sending, the resume is the problem'. Says so plainly when there is not enough data yet. Read-only.",
    inputSchema: object({}),
    handler: async (args, ctx) => pipeline.diagnoseSearch(ctx.userId),
  },
  {
    name: "share_pipeline",
    title: "Get a read-only link to the pipeline",
    description:
      "Mint a link that shows this person's pipeline to anyone holding it, without a login — for a friend, a coach or a former manager who is helping review the search. Returns the slug; the full URL is the instance address plus /p/<slug>. Calling it twice returns the same link rather than a second one. What a viewer sees is deliberately narrow: company, role, stage, location, how long each has been sitting and when a follow-up is due. They do NOT see notes, job descriptions, salary, contacts or the activity timeline — say so if someone asks what will be visible, because a share link is consent to show a search, not to publish the people in it. Set include_closed to show finished applications too.",
    inputSchema: object({
      include_closed: bool("Show accepted / rejected / withdrawn / ghosted applications too. Default false."),
    }),
    handler: async (args, ctx) =>
      pipelineShare.sharePipeline(ctx.userId, { includeClosed: b(args, "include_closed") }),
  },
  {
    name: "unshare_pipeline",
    title: "Revoke the pipeline link",
    description:
      "Stop sharing the pipeline. This DESTROYS the address rather than pausing it — anyone holding the old link gets nothing, and sharing again later mints a completely different URL. That is deliberate: the reason to revoke is usually that a link reached someone it should not have, and a pause that can be undone does not fix that.",
    inputSchema: object({}),
    handler: async (_args, ctx) => pipelineShare.unsharePipeline(ctx.userId),
  },
  {
    name: "get_pipeline_share",
    title: "Check whether the pipeline is shared",
    description:
      "Whether a read-only pipeline link currently exists, what it shows, and when it was last opened. Returns null when nothing is shared. Use it before minting a link so you can tell someone they already have one, and to answer 'has anyone actually looked at it'.",
    inputSchema: object({}),
    handler: async (_args, ctx) => pipelineShare.getPipelineShare(ctx.userId),
  },
  {
    name: "list_saved_views",
    title: "List saved pipeline views",
    description:
      "The cuts of the pipeline this person has named and kept — 'Chasing', 'Dream jobs', 'Gone quiet'. Each one returns a name and a query string like \"view=list&f=SCREEN,INTERVIEW&sort=waiting\". Call this when someone refers to a view by name, then use the query to work out what they mean: f is a comma-separated list of stages, sort and dir order the table, q is a search. Reading a view tells you what they consider one job; it is a good place to look before asking what they want reviewed.",
    inputSchema: object({}),
    handler: async (_args, ctx) => views.listSavedViews(ctx.userId),
  },
  {
    name: "save_view",
    title: "Save a pipeline view under a name",
    description:
      "Name a cut of the pipeline so it can be reopened in one click. The query is the pipeline URL's own parameters without the leading '?': view (board | list | calendar), f (comma-separated stages, or 'overdue' / 'closed'), sort, dir, q (search). Example: name 'Gone quiet', query 'view=list&f=APPLIED,SCREEN&sort=waiting&dir=desc'. Saving under a name that already exists REPLACES that view rather than creating a second one, which is how you edit one. Anything outside those parameters is dropped.",
    inputSchema: object(
      {
        name: str("What to call it, e.g. 'Chasing'"),
        query: str("The pipeline query string, without the leading '?'"),
      },
      ["name", "query"],
    ),
    handler: async (args, ctx) =>
      views.saveView(ctx.userId, required(args, "name"), s(args, "query") ?? ""),
  },
  {
    name: "delete_saved_view",
    title: "Delete a saved view",
    description:
      "Remove a saved pipeline view. Only the view goes — nothing about the applications it was showing is touched. Get the id from list_saved_views.",
    inputSchema: object({ id: str("Saved view id") }, ["id"]),
    handler: async (args, ctx) => views.deleteSavedView(ctx.userId, required(args, "id")),
  },
  {
    name: "list_schedule",
    title: "List everything dated in a window",
    description:
      "Everything with a date attached between two dates, merged into one list sorted earliest first: follow-ups that come due, tasks with a due date, and activity already logged (calls, interviews, emails, stage changes). This is the tool for 'what does my week look like', 'what happened last month' or 'what is coming up' — anything where the question is about a period of time rather than about one application. Each entry says its kind (FOLLOW_UP, TASK or ACTIVITY), the date, a title, the company and the applicationId, so you can call get_application for the full picture. Reach for list_follow_ups instead when you only want what is already overdue, and list_tasks when the date does not matter. Read-only; it saves nothing.",
    inputSchema: object(
      {
        from: str("Start of the window, ISO date (YYYY-MM-DD). Inclusive."),
        to: str("End of the window, ISO date (YYYY-MM-DD). Inclusive."),
      },
      ["from", "to"],
    ),
    handler: async (args, ctx) =>
      pipeline.listSchedule(ctx.userId, required(args, "from"), endOfDay(required(args, "to"))),
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description: "To-dos, optionally attached to an application.",
    inputSchema: object({ done: bool("Filter by completion state. Omit for all.") }),
    handler: async (args, ctx) => pipeline.listTasks(ctx.userId, { done: b(args, "done") }),
  },
  {
    name: "create_task",
    title: "Create a task",
    description: "Add a to-do, optionally attached to an application and with a due date.",
    inputSchema: object(
      {
        title: str("What needs doing"),
        detail: str("Any extra detail"),
        dueAt: str("ISO date it is due"),
        applicationId: str("Attach to this application"),
      },
      ["title"],
    ),
    handler: async (args, ctx) =>
      pipeline.createTask(ctx.userId, {
        title: required(args, "title"),
        ...defined({
          detail: s(args, "detail"),
          dueAt: s(args, "dueAt"),
          applicationId: s(args, "applicationId"),
        }),
      }),
  },
  {
    name: "complete_task",
    title: "Complete or reopen a task",
    description: "Mark a task done, or reopen it with done: false.",
    inputSchema: object({ id: str("Task id"), done: bool("Default true") }, ["id"]),
    handler: async (args, ctx) => pipeline.setTaskDone(ctx.userId, required(args, "id"), b(args, "done") ?? true),
  },
  // --- CRM: companies and the people at them -------------------------------
  {
    name: "list_companies",
    title: "List companies",
    description:
      "Every company on file, with how many applications and contacts each one has, plus lastAppliedAt (when you last applied there) and openApplications (how many are still live). Use this to answer 'who have I applied to', to find a companyId before calling get_company, or to spot companies missing a website — the website is what makes their logo appear in the pipeline. Pass search to match on name, industry, location or notes; pass filter to cut the list: 'active' = something still in flight, 'applied' = ever applied, 'never-applied' = researched but never sent anything, 'with-contacts' = you know someone there.",
    inputSchema: object({
      search: str("Match name, industry, location or notes"),
      filter: {
        type: "string",
        enum: [...COMPANY_FILTERS],
        description: "Cut the list: active | applied | never-applied | with-contacts",
      },
    }),
    handler: async (args, ctx) =>
      pipeline.listCompanies(ctx.userId, {
        search: s(args, "search"),
        filter: enumArg(args, "filter", COMPANY_FILTERS),
      }),
  },
  {
    name: "get_company",
    title: "Get a company",
    description:
      "Everything on file for one company: website, industry, size, location, your research notes, every application you have with them, and every contact who works there. This is the tool to call before writing anything about a company, so you add to what is known rather than replacing it.",
    inputSchema: object({ id: str("Company id") }, ["id"]),
    handler: async (args, ctx) => {
      // Every other get_* raises here rather than returning null, and it has to:
      // a null serialises as {"ok": true}, which reads like a hit.
      const company = await pipeline.getCompany(ctx.userId, required(args, "id"));
      if (!company) throw new Error(`No company with id ${required(args, "id")}`);
      return company;
    },
  },
  {
    name: "create_company",
    title: "Create a company",
    description:
      "Add a company before you have applied to them — somewhere to keep research while you decide. Applications create their company automatically, so reach for this only when there is no application yet. Names are unique per person; creating one that already exists is an error rather than a silent merge.",
    inputSchema: object(
      {
        name: str("Company name"),
        website: str("Their own site, e.g. stripe.com. This is what the logo comes from."),
        industry: str("e.g. 'Fintech', 'Developer tools'"),
        size: str("e.g. '200-500', 'Series B'"),
        location: str("Headquarters or main office"),
        notes: str("Anything you have learned about them"),
      },
      ["name"],
    ),
    handler: async (args, ctx) =>
      pipeline.createCompany(ctx.userId, {
        name: required(args, "name"),
        ...defined({
          website: s(args, "website"),
          industry: s(args, "industry"),
          size: s(args, "size"),
          location: s(args, "location"),
          notes: s(args, "notes"),
        }),
      }),
  },
  {
    name: "update_company",
    title: "Update a company",
    description:
      "Change what you know about a company. Only the fields you pass are touched, but each one REPLACES what was there — notes especially, so call get_company first and write back the whole thing if you are adding to research rather than replacing it. Setting website is the single thing that makes their logo show in the pipeline; a job board URL is not their website.",
    inputSchema: object(
      {
        id: str("Company id"),
        name: str("Company name"),
        website: str("Their own site, e.g. stripe.com"),
        industry: str("Industry"),
        size: str("Headcount or funding stage"),
        location: str("Headquarters"),
        notes: str("Research notes — replaces what is there"),
      },
      ["id"],
    ),
    handler: async (args, ctx) =>
      pipeline.updateCompany(
        ctx.userId,
        required(args, "id"),
        defined({
          name: s(args, "name"),
          website: s(args, "website"),
          industry: s(args, "industry"),
          size: s(args, "size"),
          location: s(args, "location"),
          notes: s(args, "notes"),
        }),
      ),
  },
  {
    name: "delete_company",
    title: "Delete a company",
    description:
      "Remove a company record. Refuses while applications still point at it — move or delete those first, so tidying up a company can never take an application with it. Contacts survive and simply lose their employer.",
    inputSchema: object({ id: str("Company id") }, ["id"]),
    handler: async (args, ctx) => pipeline.deleteCompany(ctx.userId, required(args, "id")),
  },
  {
    name: "list_contacts",
    title: "List contacts",
    description:
      "Recruiters, hiring managers and referrals. Narrow by application, by company, by a search across name, title, email, notes and employer, or by filter: 'ping-due' = their follow-up date has arrived, 'with-application' = attached to an application, 'no-company' = no employer on file. Returns each person with their company and the application they are attached to.",
    inputSchema: object({
      applicationId: str("Limit to one application"),
      companyId: str("Limit to people at one company"),
      search: str("Match name, title, email, notes or company"),
      filter: {
        type: "string",
        enum: [...CONTACT_FILTERS],
        description: "Cut the list: ping-due | with-application | no-company",
      },
    }),
    handler: async (args, ctx) =>
      pipeline.listContacts(ctx.userId, {
        ...defined({
          applicationId: s(args, "applicationId"),
          companyId: s(args, "companyId"),
          search: s(args, "search"),
          filter: enumArg(args, "filter", CONTACT_FILTERS),
        }),
      }),
  },
  {
    name: "get_contact",
    title: "Get a contact",
    description:
      "One person in full, with their company and the application they belong to. Call this before update_contact so you know what you are about to overwrite. Also returns their timeline — every call, coffee and reply logged with log_activity, newest first — so 'when did I last talk to them' is answered from here.",
    inputSchema: object({ id: str("Contact id") }, ["id"]),
    handler: async (args, ctx) => {
      const contact = await pipeline.getContact(ctx.userId, required(args, "id"));
      if (!contact) throw new Error(`No contact with id ${required(args, "id")}`);
      return contact;
    },
  },
  {
    name: "update_contact",
    title: "Update a contact",
    description:
      "Change a person's details. Only the fields you pass are touched, and each REPLACES what was there — read first with get_contact if you are adding to notes rather than replacing them. Pass company to move them to a different employer (created if it does not exist), or an empty string to detach; same for applicationId.",
    inputSchema: object(
      {
        id: str("Contact id"),
        name: str("Their name"),
        title: str("Their job title"),
        email: str("Email"),
        phone: str("Phone"),
        linkedin: str("LinkedIn URL"),
        relationship: str("e.g. 'recruiter', 'hiring manager', 'referral'"),
        notes: str("Notes — replaces what is there"),
        company: str("Employer, or empty string to detach"),
        applicationId: str("Application to attach to, or empty string to detach"),
        nextFollowUpAt: str("ISO date to next get in touch — 'ping Sarah in two weeks' lives here. Empty string clears it. Due pings surface in list_follow_ups and on the dashboard."),
      },
      ["id"],
    ),
    handler: async (args, ctx) =>
      pipeline.updateContact(
        ctx.userId,
        required(args, "id"),
        defined({
          name: s(args, "name"),
          title: s(args, "title"),
          email: s(args, "email"),
          phone: s(args, "phone"),
          linkedin: s(args, "linkedin"),
          relationship: s(args, "relationship"),
          notes: s(args, "notes"),
          company: s(args, "company"),
          applicationId: s(args, "applicationId"),
          nextFollowUpAt: s(args, "nextFollowUpAt"),
        }),
      ),
  },
  {
    name: "delete_contact",
    title: "Delete a contact",
    description: "Remove a person. Their company and any application they were attached to stay.",
    inputSchema: object({ id: str("Contact id") }, ["id"]),
    handler: async (args, ctx) => pipeline.deleteContact(ctx.userId, required(args, "id")),
  },
  {
    name: "create_contact",
    title: "Create a contact",
    description: "Save a person: recruiter, hiring manager, referral, friend at the company.",
    inputSchema: object(
      {
        name: str("Their name"),
        title: str("Their job title"),
        email: str("Email"),
        phone: str("Phone"),
        linkedin: str("LinkedIn URL"),
        relationship: str("e.g. 'recruiter', 'hiring manager', 'referral'"),
        notes: str("Notes"),
        company: str("Company they work at"),
        applicationId: str("Attach to this application"),
      },
      ["name"],
    ),
    handler: async (args, ctx) =>
      pipeline.createContact(ctx.userId, {
        name: required(args, "name"),
        ...defined({
          title: s(args, "title"),
          email: s(args, "email"),
          phone: s(args, "phone"),
          linkedin: s(args, "linkedin"),
          relationship: s(args, "relationship"),
          notes: s(args, "notes"),
          company: s(args, "company"),
          applicationId: s(args, "applicationId"),
        }),
      }),
  },

  // -------------------------------------------------------------------------
  // ACCOUNT
  // -------------------------------------------------------------------------
  {
    name: "whoami",
    title: "Who am I connected as",
    description:
      "The account this connection belongs to: name, email, role, and whether it can administer the instance. Every other tool acts as this person and can only see their data.",
    inputSchema: object({}),
    handler: async (_args, ctx) => ({
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
      isAdmin: isAdmin(ctx.user),
      memberSince: ctx.user.createdAt,
    }),
  },
  {
    name: "list_connections",
    title: "List AI connections",
    description:
      "Every assistant wired to this workspace: what it is called, which client it was set up for, when it last called in and from what. Reach for it to answer 'which of these am I still using?' or before rotating something — the ids come back here. Tokens deliberately do not: they are credentials, they would sit in this transcript forever, and the only place a person needs to see one is the client they are pasting it into. `isThisOne` marks the connection you are calling through right now.",
    inputSchema: object({}),
    handler: async (_args, ctx) => {
      const rows = await connections.listConnections(ctx.userId);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        client: row.client,
        clientName: clientName(row.client),
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        lastUsedFrom: guessClient(row.lastUsedFrom) || null,
        isThisOne: row.id === ctx.connectionId,
      }));
    },
  },
  {
    name: "create_connection",
    title: "Connect another assistant",
    description:
      "Mint a new connection URL so a second client — the laptop's editor, a phone app, a terminal — can reach this workspace too. Returns the URL and the exact steps for that client, so you can hand somebody a copy-paste answer to 'how do I add this to Cursor?'. Give every client its own rather than sharing one: that is what lets a single laptop be disconnected later without breaking everything else. The URL is a credential with full read and write over this person's brain, resumes and pipeline — say so when you hand it over, and never post it anywhere it will be stored.",
    inputSchema: object({
      client: str(
        "Which client it is for: claude | claude-code | chatgpt | cursor | vscode | windsurf | generic-http | stdio-bridge | raw. Sets the setup steps returned.",
      ),
      name: str("What to call it in the list, e.g. 'Cursor — work laptop'. Defaults to the client's name."),
    }),
    handler: async (args, ctx) => {
      const client = s(args, "client") ?? "generic-http";
      const row = await connections.createConnection(ctx.userId, {
        client,
        ...defined({ name: s(args, "name") }),
      });
      const url = `${ctx.baseUrl}/api/mcp/${row.token}`;
      const recipe = clientsById.get(row.client);
      return {
        id: row.id,
        name: row.name,
        client: row.client,
        url,
        setup: recipe?.steps(url) ?? [],
        docs: recipe?.docs ?? null,
        warning: "This URL is a password. Anyone holding it can read and write this workspace.",
      };
    },
  },
  {
    name: "rename_connection",
    title: "Rename a connection",
    description:
      "Change what a connection is called in the list. Names are for the person, not the machine — 'Cursor — old laptop' is what makes it obvious later which one to revoke. Get the id from list_connections.",
    inputSchema: object({ id: str("Connection id"), name: str("The new name") }, ["id", "name"]),
    handler: async (args, ctx) => {
      await connections.renameConnection(ctx.userId, required(args, "id"), required(args, "name"));
      return { id: required(args, "id"), renamed: true };
    },
  },
  {
    name: "rotate_connection",
    title: "Issue a new token for a connection",
    description:
      "Kill a connection's URL and issue a fresh one on the same row, keeping its name and place in the list. This is the answer to 'I sold that laptop' or 'I pasted the URL in a chat by mistake' — the old address stops working the moment this returns, and nothing else is affected. It also means the client that was using it goes dark until somebody pastes the new URL in, so say that before doing it. Returns the new URL; treat it like the password it is.",
    inputSchema: object({ id: str("Connection id, from list_connections") }, ["id"]),
    handler: async (args, ctx) => {
      const id = required(args, "id");
      const token = await connections.rotateConnection(ctx.userId, id);
      return {
        id,
        url: `${ctx.baseUrl}/api/mcp/${token}`,
        warning:
          "The old URL is dead. Paste this one into that client or it stays disconnected. It is a password.",
      };
    },
  },
  {
    name: "delete_connection",
    title: "Disconnect an assistant",
    description:
      "Remove a connection for good. Its URL stops working immediately and cannot be brought back — a replacement is a new connection with a new URL. Prefer rotate_connection when the client is still in use and only the URL has leaked. Check list_connections first: deleting the one you are calling through ends this session mid-conversation.",
    inputSchema: object({ id: str("Connection id, from list_connections") }, ["id"]),
    handler: async (args, ctx) => {
      const id = required(args, "id");
      if (id === ctx.connectionId) {
        throw new Error(
          "That is the connection you are talking through. Delete it from Settings, or delete a different one.",
        );
      }
      await connections.deleteConnection(ctx.userId, id);
      return { id, deleted: true };
    },
  },

  // -------------------------------------------------------------------------
  // ADMIN — hidden entirely from members
  // -------------------------------------------------------------------------
  {
    name: "admin_instance_stats",
    title: "Instance overview",
    description:
      "How many people are on this instance, how many are active, how many invites are outstanding, and how much material exists across all accounts. Aggregate counts only — never another person's content.",
    inputSchema: object({}),
    adminOnly: true,
    handler: async () => {
      const [stats, settings] = await Promise.all([users.instanceStats(), getSettings()]);
      return { ...stats, instanceName: settings.instanceName, companyLogos: settings.companyLogos };
    },
  },
  {
    name: "admin_set_company_logos",
    title: "Turn company logos on or off",
    description:
      "Controls whether the pipeline shows a company's favicon next to its name. When on, each person's browser asks twenty-icons.com for the logo, which means that service can see which companies are in their pipeline — turn it off for an instance where that matters and everyone gets initials on a coloured tile instead. Nothing else changes; no data is stored or deleted either way. Call admin_instance_stats to read the current state.",
    inputSchema: object({ enabled: bool("On shows logos, off shows initials only") }, ["enabled"]),
    adminOnly: true,
    handler: async (args, ctx) => {
      const enabled = b(args, "enabled");
      if (enabled === undefined) throw new Error('Missing required boolean argument "enabled"');
      await updateSettings(ctx.user, { companyLogos: enabled });
      return { companyLogos: enabled };
    },
  },
  {
    name: "admin_list_users",
    title: "List members",
    description:
      "Everyone on the instance with their role, whether they are active, when they last signed in, and how much they have built. Does not expose anyone's brain, resumes or applications.",
    inputSchema: object({}),
    adminOnly: true,
    handler: async () => users.listUsers(),
  },
  {
    name: "admin_user_detail",
    title: "Look up one account",
    description:
      "Everything known about a single account, for when someone asks for help: when they joined, who invited them, whether that invitation email actually went out, when they last signed in, which assistants they have connected and when each last called, whether they are being billed, how much they have built, every administrative change made to their account, and anything the instance recorded against their address — a bounced invite, a tool call that threw. Start here before admin_reset_user_password or admin_set_user_active, because it tells you whether the problem is the account or the email. Takes a user id from admin_list_users. Returns counts of what is in their workspace, never its contents: no brain, no resumes, no applications, and never a connection token. `manageable` says whether you are allowed to act on this account at all — it is false for the instance owner, for yourself, and for another admin when you are not the owner.",
    inputSchema: object({ user_id: str("The user's id, from admin_list_users") }, ["user_id"]),
    adminOnly: true,
    handler: async (args, ctx) => {
      const id = required(args, "user_id");
      const detail = await users.getUserDetail(ctx.user, id);
      if (!detail) throw new Error("No such user.");
      const [history, events] = await Promise.all([
        audit.listAudit({ targetId: id, limit: 50 }),
        system.listSystemEvents({ limit: 25, userEmail: detail.email }),
      ]);
      return { ...detail, history, events };
    },
  },
  {
    name: "admin_invite_user",
    title: "Invite someone",
    description:
      "Create an invitation and email it through Resend. If email is not configured yet, the invite is still created and the reply includes a link you can send by hand — so this works before Resend is set up.",
    inputSchema: object(
      {
        email: str("Who to invite"),
        role: {
          type: "string",
          enum: ["MEMBER", "ADMIN"],
          description: "MEMBER by default. Only the super admin may create ADMINs.",
        },
      },
      ["email"],
    ),
    adminOnly: true,
    handler: async (args, ctx) => {
      const result = await users.createInvite({
        actor: ctx.user,
        email: required(args, "email"),
        role: (s(args, "role") as UserRole | undefined) ?? "MEMBER",
        baseUrl: ctx.baseUrl,
      });
      return {
        email: result.invite.email,
        expiresAt: result.invite.expiresAt,
        emailSent: result.emailSent,
        emailError: result.emailError,
        acceptUrl: result.acceptUrl,
        note: result.emailSent
          ? "Invitation emailed."
          : "Invitation created but NOT emailed — send them the acceptUrl yourself, or configure Resend with admin_set_email_config.",
      };
    },
  },
  {
    name: "admin_list_invites",
    title: "List outstanding invites",
    description: "Invitations that have not been accepted yet, with their links and expiry.",
    inputSchema: object({}),
    adminOnly: true,
    handler: async () => users.listInvites(),
  },
  {
    name: "admin_revoke_invite",
    title: "Revoke an invite",
    description: "Cancel an outstanding invitation so its link stops working.",
    inputSchema: object({ id: str("Invite id") }, ["id"]),
    adminOnly: true,
    handler: async (args, ctx) => users.revokeInvite(ctx.user, required(args, "id")),
  },
  {
    name: "admin_reset_user_password",
    title: "Reset a member's password",
    description:
      "Generate a new password for a member who is locked out, and return it once so it can be passed on. Every session they had is ended, so an old browser stays logged out. Cannot be used on the instance owner, and an admin cannot reset another admin's password — that restriction is what stops this being a way to take over an instance. The reset is written to the audit log; the password itself never is.",
    inputSchema: object({ user_id: str("The user's id, from admin_list_users") }, ["user_id"]),
    adminOnly: true,
    handler: async (args, ctx) => users.adminResetPassword(ctx.user, required(args, "user_id")),
  },
  {
    name: "admin_audit_log",
    title: "Read the admin audit log",
    description:
      "What admins have done on this instance, newest first: invitations, role changes, suspensions, deletions, password resets, billing links and changes to the instance's own configuration, each with who did it, to whom, and when. Rows survive the deletion of the account they describe. Use it to answer 'who suspended this person', 'who changed the Resend key', or to review what happened while you were away. Narrow with group (accounts, invites, passwords, billing, settings) and search, which matches either side of a row — the admin who acted or the account acted on — and page with offset. Nothing here touches anyone's brain, resumes or applications, and a secret is recorded as having been set, never as its value.",
    inputSchema: object({
      limit: num("How many entries, newest first. Default 100, max 500."),
      offset: num("Skip this many before returning, for paging through a long log."),
      group: {
        type: "string",
        enum: ["accounts", "invites", "passwords", "billing", "settings"],
        description: "Only one kind of change. Omit for everything.",
      },
      search: str("An email address, whole or partial. Matches the admin who acted or the account acted on."),
    }),
    adminOnly: true,
    handler: async (args) =>
      audit.listAudit(
        defined({
          limit: n(args, "limit") ?? 100,
          offset: n(args, "offset"),
          group: s(args, "group"),
          search: s(args, "search"),
        }),
      ),
  },
  {
    name: "admin_health",
    title: "Check whether the instance is working",
    description:
      "This is the FIRST tool to call when something is reported broken, and the one to call on a schedule if you check on this instance at all. Returns a short list of checks — database reachability and response time, whether every migration finished, whether email is configured and whether the last send actually succeeded, whether Stripe is still calling the webhook, when an assistant last made a tool call, and how many errors were recorded in the last 24 hours. Each check has a status of ok, warn or down plus a plain-language summary you can read out as-is. Nothing here touches anyone's brain, resumes or applications. A 'down' on billing usually means the signing secret in Admin → Billing is wrong; a billing check that says Stripe has never called means the webhook endpoint was never added on Stripe's side. Follow up with admin_recent_errors for the specifics behind an error count.",
    inputSchema: object({}),
    adminOnly: true,
    handler: async () => system.instanceHealth(),
  },
  {
    name: "admin_recent_errors",
    title: "Read what has failed recently",
    description:
      "The instance's own event stream, newest first: failed emails, Stripe webhooks that did not verify or did not sync, tool calls that threw, and pages that errored. Use it after admin_health reports errors, or to answer 'did that invite actually send'. Each entry has a level (INFO, WARN or ERROR), a source, a one-line message, and the address of whoever's request hit it. Pass level ERROR for failures only — the default includes INFO entries such as successful webhook deliveries, which are what prove Stripe is still reaching this instance at all. Entries older than 30 days are removed automatically. This never contains anyone's content: the arguments that caused a failure are deliberately not recorded, only the failure.",
    inputSchema: object({
      limit: num("How many entries, newest first. Default 50, max 200."),
      level: {
        type: "string",
        enum: ["INFO", "WARN", "ERROR"],
        description: "Only entries at this level. Omit for everything.",
      },
      source: {
        type: "string",
        enum: ["stripe.webhook", "billing.sync", "email.send", "mcp.tool", "app"],
        description: "Only entries from this part of the app. Omit for everything.",
      },
    }),
    adminOnly: true,
    handler: async (args) =>
      system.listSystemEvents(
        defined({
          limit: n(args, "limit") ?? 50,
          level: s(args, "level") as "INFO" | "WARN" | "ERROR" | undefined,
          source: s(args, "source") as system.SystemEventSource | undefined,
        }),
      ),
  },
  {
    name: "admin_list_waitlist",
    title: "See who asked for access",
    description:
      "People who requested access from the marketing site and have not been invited yet. Start here when you're deciding who to let in next: each entry has the address, what they said they're looking for, which site they came from, and when they asked. Entries already turned into invites are included with an invitedAt date, so you can see the whole history — pass pendingOnly true for just the queue. Reading this does not tell anyone anything; use admin_invite_waitlist_signup to actually let someone in.",
    inputSchema: object({
      pendingOnly: bool("Only the people still waiting. Defaults to false, which returns everyone who ever asked."),
    }),
    adminOnly: true,
    handler: async (args) => {
      const [entries, stats] = await Promise.all([
        waitlist.listWaitlist({ pendingOnly: b(args, "pendingOnly") ?? false }),
        waitlist.waitlistStats(),
      ]);
      return { ...stats, entries };
    },
  },
  {
    name: "admin_invite_waitlist_signup",
    title: "Invite someone off the waitlist",
    description:
      "Turn a waitlist request into a real invitation: creates the invite, emails it through Resend, and marks the request as invited so it leaves the queue. Takes the signup id from admin_list_waitlist, not an email address. If email is not configured the invite is still created and the reply carries a link you can send by hand. The request stays on the list afterwards, stamped with the date, so the list remains a record of who asked and when.",
    inputSchema: object(
      {
        id: str("The signup id from admin_list_waitlist"),
        role: {
          type: "string",
          enum: ["MEMBER", "ADMIN"],
          description: "MEMBER by default. Only the super admin may create ADMINs.",
        },
      },
      ["id"],
    ),
    adminOnly: true,
    handler: async (args, ctx) => {
      const result = await waitlist.inviteFromWaitlist({
        actor: ctx.user,
        id: required(args, "id"),
        role: (s(args, "role") as UserRole | undefined) ?? "MEMBER",
        baseUrl: ctx.baseUrl,
      });
      return {
        email: result.invite.email,
        expiresAt: result.invite.expiresAt,
        emailSent: result.emailSent,
        emailError: result.emailError,
        acceptUrl: result.acceptUrl,
        note: result.emailSent
          ? "Invitation emailed and the request marked as invited."
          : "Invitation created but NOT emailed — send them the acceptUrl yourself, or configure Resend with admin_set_email_config.",
      };
    },
  },
  {
    name: "admin_remove_waitlist_signup",
    title: "Remove a waitlist request",
    description:
      "Delete a request from the waitlist for good — spam, a duplicate, or someone who asked to be taken off. This does not revoke an invitation that was already sent; use admin_revoke_invite for that. Irreversible, so read admin_list_waitlist first and remove by id.",
    inputSchema: object({ id: str("The signup id from admin_list_waitlist") }, ["id"]),
    adminOnly: true,
    handler: async (args) => {
      await waitlist.removeWaitlistSignup(required(args, "id"));
      return { removed: true };
    },
  },
  {
    name: "admin_set_user_role",
    title: "Change someone's role",
    description:
      "Promote a member to admin or demote an admin to member. The super admin cannot be changed, and admins can only act on members.",
    inputSchema: object(
      {
        userId: str("User id"),
        role: { type: "string", enum: ["MEMBER", "ADMIN"], description: "The new role" },
      },
      ["userId", "role"],
    ),
    adminOnly: true,
    handler: async (args, ctx) =>
      users.setUserRole(ctx.user, required(args, "userId"), required(args, "role") as UserRole),
  },
  {
    name: "admin_set_user_active",
    title: "Activate or suspend someone",
    description:
      "Suspending signs the person out everywhere and blocks their login and their MCP connection. Their data is kept.",
    inputSchema: object(
      { userId: str("User id"), isActive: bool("true to reactivate, false to suspend") },
      ["userId", "isActive"],
    ),
    adminOnly: true,
    handler: async (args, ctx) =>
      users.setUserActive(ctx.user, required(args, "userId"), b(args, "isActive") ?? true),
  },
  {
    name: "admin_delete_user",
    title: "Delete someone",
    description:
      "PERMANENT. Removes the account and everything it owns: brain, resumes, applications. Confirm with the person you are talking to before calling this.",
    inputSchema: object({ userId: str("User id") }, ["userId"]),
    adminOnly: true,
    handler: async (args, ctx) => users.deleteUser(ctx.user, required(args, "userId")),
  },
  {
    name: "admin_get_email_config",
    title: "Check email configuration",
    description:
      "Whether Resend is wired up, and the from address invitations will come from. The API key is returned masked.",
    inputSchema: object({}),
    adminOnly: true,
    handler: async () => {
      const settings = await getSettings();
      return {
        configured: emailIsConfigured(settings),
        instanceName: settings.instanceName,
        resendApiKey: maskSecret(settings.resendApiKey),
        resendFromEmail: settings.resendFromEmail,
        resendFromName: settings.resendFromName,
        publicUrl: settings.publicUrl,
        help: "The from address must be on a domain you have verified in Resend, otherwise sends are rejected.",
      };
    },
  },
  {
    name: "admin_set_email_config",
    title: "Configure email",
    description:
      "Set the Resend API key and the address invitations are sent from. Only the fields you pass are changed. Follow with admin_send_test_email to prove it works. instanceName and publicUrl are instance-wide rather than email-only — they are what the sign-in page, invitation links and the Stripe webhook URL are built from — and they can also be set on their own with admin_set_variable.",
    inputSchema: object({
      resendApiKey: str("Resend API key, starts with re_"),
      resendFromEmail: str("From address on a domain verified in Resend, e.g. hello@yourdomain.com"),
      resendFromName: str("Display name on outgoing mail"),
      instanceName: str("What this instance is called, used in invitation emails"),
      publicUrl: str("Public base URL, used to build invite links, e.g. https://you.up.railway.app"),
    }),
    adminOnly: true,
    handler: async (args, ctx) => {
      await updateSettings(
        ctx.user,
        defined({
          resendApiKey: s(args, "resendApiKey"),
          resendFromEmail: s(args, "resendFromEmail"),
          resendFromName: s(args, "resendFromName"),
          instanceName: s(args, "instanceName"),
          publicUrl: s(args, "publicUrl"),
        }),
      );
      const settings = await getSettings();
      return { configured: emailIsConfigured(settings), resendFromEmail: settings.resendFromEmail };
    },
  },
  {
    name: "admin_send_test_email",
    title: "Send a test email",
    description: "Proves the Resend configuration actually delivers. Returns the exact error if it does not.",
    inputSchema: object({ to: str("Where to send it. Defaults to your own address.") }),
    adminOnly: true,
    handler: async (args, ctx) => {
      const settings = await getSettings();
      const to = s(args, "to") || ctx.user.email;
      const result = await sendEmail({ to, ...testEmail(settings.instanceName), settings });
      return result.ok
        ? { ok: true, to, id: result.id }
        : { ok: false, to, error: result.error };
    },
  },
  {
    name: "admin_get_billing_config",
    title: "Check billing configuration",
    description:
      "Whether Stripe billing is wired up for hosting other people on this instance for a fee, how many users currently pay, and the exact webhook URL to paste into the Stripe Dashboard. Keys come back masked. Billing only governs users who arrived through a Stripe checkout — the owner and free invitees are never touched by it.",
    inputSchema: object({}),
    adminOnly: true,
    handler: async (_args, ctx) => {
      const settings = await getSettings();
      return {
        configured: billingIsConfigured(settings),
        stripeSecretKey: maskSecret(settings.stripeSecretKey),
        stripeWebhookSecret: maskSecret(settings.stripeWebhookSecret),
        paymentLink: settings.stripePaymentLink,
        billedUsers: await billedUserCount(),
        webhookUrl: `${ctx.baseUrl}/api/stripe/webhook`,
        help: "In Stripe: create a Product with a recurring Price and a Payment Link for it, then a webhook pointed at webhookUrl with the events checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted and invoice.payment_failed. Someone who pays through the link is invited automatically; a lapsed subscription suspends them, and paying again reactivates the same workspace.",
      };
    },
  },
  {
    name: "admin_set_billing_config",
    title: "Configure billing",
    description:
      "Set the Stripe API key, the webhook signing secret, and the public Payment Link for this instance. Only the fields you pass are changed. Prefer a RESTRICTED key (rk_...) with read-only Customers and Subscriptions over the full secret key — reading those two things is all this app ever does with Stripe, and a restricted key that leaks cannot move money or alter the Stripe account. Follow with admin_get_billing_config to see the webhook URL to register in Stripe.",
    inputSchema: object({
      stripeSecretKey: str("Stripe API key — a restricted rk_ key with read-only Customers and Subscriptions is enough and safer than the full sk_ key"),
      stripeWebhookSecret: str("Webhook signing secret, starts with whsec_"),
      stripePaymentLink: str("The Stripe Payment Link people pay through, e.g. https://buy.stripe.com/..."),
    }),
    adminOnly: true,
    handler: async (args, ctx) => {
      await updateSettings(
        ctx.user,
        defined({
          stripeSecretKey: s(args, "stripeSecretKey"),
          stripeWebhookSecret: s(args, "stripeWebhookSecret"),
          stripePaymentLink: s(args, "stripePaymentLink"),
        }),
      );
      const settings = await getSettings();
      return { configured: billingIsConfigured(settings), paymentLink: settings.stripePaymentLink };
    },
  },
  {
    name: "admin_sync_billing",
    title: "Resync billing from Stripe",
    description:
      "Asks Stripe for the current subscription state and reconciles this instance against it — the recovery path for a missed webhook. Pass an email to sync one billed user, or nothing to sync everyone with a Stripe customer attached. Reports what changed per person: activated, suspended, or unchanged. Safe to run any time.",
    inputSchema: object({ email: str("One billed user's email. Omit to sync all billed users.") }),
    adminOnly: true,
    handler: async (args, ctx) => {
      const results = await syncAllBilling(ctx.baseUrl, s(args, "email") || undefined);
      return { synced: results.length, results };
    },
  },
  {
    name: "admin_link_billing",
    title: "Link or unlink a member and their Stripe customer",
    description:
      "Attaches an EXISTING member to their Stripe customer so billing starts governing their access. This never happens automatically: a checkout email is whatever the payer typed, so the unattended webhook only ever invites strangers — connecting a current member to a subscription is a deliberate admin act, and this tool is that act. Pass their email; their Stripe customer is found by the same email in Stripe's records, or pass customerId when Stripe holds several. Pass unlink true to detach someone from billing entirely — the recovery hatch if a link was wrong; it also ends billing's authority over their account. The owner can never be linked.",
    inputSchema: object(
      {
        email: str("The member's email on this instance"),
        customerId: str("A specific Stripe customer id (cus_...), when email alone is ambiguous"),
        unlink: bool("True to detach this member from billing instead of linking"),
      },
      ["email"],
    ),
    adminOnly: true,
    handler: async (args, ctx) =>
      linkBillingCustomer({
        email: required(args, "email"),
        customerId: s(args, "customerId") || undefined,
        unlink: b(args, "unlink") ?? false,
        baseUrl: ctx.baseUrl,
      }),
  },
  {
    name: "admin_list_variables",
    title: "List instance variables",
    description:
      "Every configurable value on this instance in one list: its key, what it does, what it is set to now, and whether it is still on the built-in default. This is the whole of what a self-hosted instance stores as configuration, so start here when someone asks where a setting lives or why the app is behaving a certain way. Secrets come back masked — no tool ever returns a raw key. Variables an admin added by hand are marked known:false; they have no form in the app and are read by whatever feature asked for them.",
    inputSchema: object({}),
    adminOnly: true,
    handler: async () => ({ variables: await listVariables() }),
  },
  {
    name: "admin_set_variable",
    title: "Set an instance variable",
    description:
      "Changes one instance setting by key — the general way in, for anything without a tool of its own. Take the key from admin_list_variables and send the new value as a string; an on-off variable takes \"1\" or \"0\". Prefer admin_set_email_config or admin_set_billing_config where they apply, because they also report whether that area now works. Sending an empty value for a secret leaves it alone rather than clearing it — admin_delete_variable is how you clear one. A key nothing recognises creates a new variable, which is how a setting exists before it has a screen: lowercase letters, numbers and underscores. Every change is written to the audit log against your name, values included, so never put a secret in a key that is not declared as one.",
    inputSchema: object(
      {
        key: str("The variable's key, e.g. instance_name — from admin_list_variables"),
        value: str('The new value as a string. "1" or "0" for an on-off variable.'),
      },
      ["key", "value"],
    ),
    adminOnly: true,
    handler: async (args, ctx) => {
      const key = required(args, "key");
      const value = s(args, "value");
      if (value === undefined) throw new Error('Missing required string argument "value"');
      const changed = await setVariables(ctx.user, { [key]: value });
      const after = (await listVariables()).find((variable) => variable.key === key);
      return { key, changed: changed.length > 0, value: after?.value ?? value, variable: after };
    },
  },
  {
    name: "admin_delete_variable",
    title: "Clear an instance variable",
    description:
      "Removes a variable's stored value. A setting the app declares falls back to its built-in default — clearing the Resend key stops every invitation email, clearing company_logos turns logos back on — and a variable an admin added disappears entirely. Call admin_list_variables first to see what the default would be, because this is the one settings call with no undo. Recorded in the audit log.",
    inputSchema: object({ key: str("The variable's key, from admin_list_variables") }, ["key"]),
    adminOnly: true,
    handler: async (args, ctx) => deleteVariable(ctx.user, required(args, "key")),
  },
];

/** Members never even see the admin tools in tools/list. */

// ---------------------------------------------------------------------------
// Prompts — these surface in Claude as ready-made workflows
// ---------------------------------------------------------------------------

export type McpPrompt = {
  name: string;
  title: string;
  description: string;
  adminOnly?: boolean;
  arguments: { name: string; description: string; required?: boolean }[];
  build: (args: Record<string, string>) => string;
};

export const prompts: McpPrompt[] = [
  {
    name: "tailor_resume",
    title: "Tailor a resume to a job",
    description:
      "Read a job description, mine the knowledge base for the most relevant evidence, and produce a tailored resume.",
    arguments: [
      { name: "job_description", description: "The full job posting", required: true },
      { name: "company", description: "Company name" },
    ],
    build: (args) => `Tailor a resume for this job.

<job_posting company="${args.company ?? ""}">
${args.job_description ?? ""}
</job_posting>

Work in this order:
1. Call get_resume_format so you know the document shape.
2. Pull out the 8-12 requirements the posting actually cares about, in priority order.
3. For each one, call search_brain to find real evidence. Do not invent anything — if there is no evidence, say so and leave it out.
4. Call get_brain_snapshot for the profile, dates and education you need.
5. Draft the document, then call preview_resume_text to check it lands near one page.
6. Save it with create_resume, naming it "<Company> — <Role>", and set targetRole/targetCompany.
7. Tell me what you emphasised, what you cut, and which requirements you could not evidence.

Bullets must lead with a strong verb, name the specific scope, and end in a measurable outcome pulled from the brain dump.

Finish with a gap report: which of the posting's requirements the resume evidences, which it half-covers, and which have nothing behind them. Never paper over the third list — it is what the person needs to see.`,
  },
  {
    name: "gap_report",
    title: "Gap report: a posting against the brain",
    description:
      "Before tailoring — or before deciding whether to apply at all — check a job posting against the evidence that actually exists in the brain. Returns three lists: requirements with real evidence behind them, requirements with only thin or indirect signal, and requirements with nothing. Nothing is written or saved; this is the reading that decides what happens next.",
    arguments: [
      { name: "job_description", description: "The full job posting, or an application id whose stored posting to use" },
    ],
    build: (args) => `Check this posting against what the brain can actually evidence.

<job_posting>
${args.job_description ?? "No posting pasted — if this looks like an application id, call get_application and use its jobDescription; otherwise ask for the posting."}
</job_posting>

The rule that governs everything here: nothing goes on a resume that the brain cannot back.
The quiet upgrade — "helped with" becoming "led", a credit becoming a hire — is the way
resumes actually go wrong, and this report exists to make that impossible to do by accident.

1. Pull out the 8-12 requirements the posting actually rewards, in priority order. Read
   past the boilerplate: "5+ years of X" and "strong communication" matter less than the
   two or three lines that describe the actual job.
2. For each requirement, call search_brain with the terms a person would have used when
   dumping — the tool searches raw notes, not polished bullets, so search for the work,
   not the buzzword.
3. Sort every requirement into exactly one of three lists:
   BACKED — direct evidence exists. Quote the strongest piece and name the role it came from.
   THIN — something adjacent exists but it would be a stretch to claim the requirement
   outright. Say precisely what exists and what the gap is.
   MISSING — the brain has nothing. Say so plainly.
4. Report the three lists in that order, then say what the report means: roughly how much
   of the posting's core is covered, and whether tailoring is worth it or the fit isn't there.
5. For each MISSING and THIN item, ask one concrete question that would surface the
   evidence if it exists — people forget their own work constantly. Anything they answer
   goes into the brain with append_role_brain_dump, and then it is BACKED for every future
   application, not just this one.

Never move an item to BACKED to be encouraging. A gap named now costs a rewrite; a gap
discovered in an interview costs the interview.`,
  },
  {
    name: "mine_brain_dump",
    title: "Mine a brain dump into highlights",
    description:
      "Read a role's raw brain dump and distil it into polished, reusable achievement bullets.",
    arguments: [{ name: "role_id", description: "The role id to mine (omit to be asked)" }],
    build: (args) => `Turn a raw brain dump into reusable resume bullets.

${args.role_id ? `Use role id ${args.role_id}.` : "Call list_roles first and ask me which role to mine."}

1. Call get_role to read the full brain dump.
2. Call list_highlights for that role so you do not duplicate what already exists.
3. Extract every distinct accomplishment. For each, write one bullet: strong verb, specific scope, quantified outcome. Keep the real numbers from the dump.
4. Rate each 1-5 on strength and tag it for retrieval.
5. Save them in one create_highlights call.
6. Show me the list and flag anything where the dump hints at impact but does not give a number, so I can fill it in.`,
  },
  {
    name: "pipeline_review",
    title: "Weekly pipeline review",
    description: "Review the job search: what is stalled, who needs chasing, what to do next.",
    arguments: [],
    build: () => `Run my weekly job search review.

1. Call diagnose_search FIRST. It tells you which step of the funnel is losing people, and the
   whole review should be built around that answer rather than around the counts.
2. Call pipeline_stats for the shape of the search, and list_follow_ups with withinDays: 7.
3. Call list_applications and list_activities to see what has actually moved.
4. Call list_tasks with done: false.
5. Call list_companies to see who I am talking to, and note any without a website on file.

Then give me:
- A two-line summary of where the search stands.
- Anything stalled: applied over 10 days ago with no movement, or a follow-up date that has passed.
- A prioritised list of what to do this week, most important first, each tied to a specific company.
- Draft the follow-up messages for anything overdue. Use the timeline so each one refers to what
  was actually said — a follow-up that mentions the thing the recruiter told me gets answered.
- Create tasks for the actions I should take, with due dates.

Lead with what diagnose_search found. If it says the problem is the resume or the targeting, do not
give me a list of follow-ups as though volume were the answer — tell me the thing that is broken and
what to do about it this week. Be direct about the bad news; I would rather hear it than have it
phrased kindly. If it says there is not enough data yet, say that and keep the review short.`,
  },
  {
    name: "research_company",
    title: "Research a company into the CRM",
    description:
      "Gather what is known about a company, work out what is missing, and write it back to their record without losing what was already there.",
    arguments: [
      { name: "company", description: "Company name", required: true },
      { name: "focus", description: "Anything specific to dig into, e.g. 'the interview loop'" },
    ],
    build: (args) => `Research ${args.company ?? "this company"} and put what you find on their record.

1. Call list_companies with search: "${args.company ?? ""}" to find their id, then get_company for
   everything already on file — including every application and contact I have there.
2. Tell me what is already known and what is missing.${
      args.focus ? `
3. Focus especially on: ${args.focus}` : ""
    }

Then write it back with update_company. This is the part to get right:

- update_company REPLACES the notes field. Take what get_company returned, combine it with what is
  new, and write the whole thing back. Do not send only the new part.
- Set website to their OWN domain if it is missing — not a Greenhouse, Lever or Ashby link, which
  is the job board rather than the employer. It is what puts their logo on my pipeline.
- Fill industry, size and location if you can.

Worth recording, because it is what I will want the night before an interview: what they actually
do and how they make money, the interview loop if it is known, who I know there, and the honest
version of why I do or do not want this.

Do not invent facts about the company. If you are working from what I have told you, say so; if you
are unsure, mark it as unconfirmed in the notes rather than stating it flatly.`,
  },
  {
    name: "prep_for_interview",
    title: "Prepare for an interview",
    description:
      "Pull the application, the company research, the people involved and my own evidence into one prep sheet.",
    arguments: [
      { name: "company", description: "Company name", required: true },
      { name: "round", description: "Which round, e.g. 'system design', 'final'" },
    ],
    build: (args) => `Get me ready for my${args.round ? ` ${args.round}` : ""} interview at ${args.company ?? "this company"}.

Gather first:
1. list_applications with search: "${args.company ?? ""}", then get_application for the full posting
   and the whole timeline — what has already been said matters more than the posting does.
2. list_companies then get_company for the research on file.
3. list_contacts for that company, so I know who I am meeting and what I know about them.
4. search_brain for the two or three themes the posting leans on hardest, so my answers come from
   real work rather than from memory under pressure.

Then give me:
- The three things they most obviously care about, from the posting and the timeline together.
- For each one, the strongest true story I have, with the specific numbers from my brain. Do not
  invent a metric — if the number is not on file, say the story without one and tell me to check.
- The questions I am most likely to be asked, and the weak spots in my own history for this role.
- Five questions worth asking them, drawn from the company research rather than generic ones.
- Anything in the timeline I should follow up on or refer back to.

If the research on file is thin, say so and offer to run research_company first.`,
  },
  {
    name: "onboard_teammate",
    title: "Invite and onboard someone",
    description: "Invite a person to this instance and walk them through their first steps.",
    adminOnly: true,
    arguments: [
      { name: "email", description: "Who to invite", required: true },
      { name: "role", description: "MEMBER or ADMIN" },
    ],
    build: (args) => `Invite ${args.email ?? "someone"} to this Hired instance.

1. Call admin_get_email_config. If email is not configured, tell me plainly and carry on —
   the invite still works, I will just send the link myself.
2. Call admin_invite_user with email "${args.email ?? ""}"${args.role ? ` and role ${args.role}` : ""}.
3. If emailSent is false, give me the acceptUrl in full and tell me to send it to them.
4. Then write me a short message I can paste to them explaining what this is: a place to
   dump everything about their career, build tailored resumes from it, and track applications
   — and that they connect their own Claude to it from the Settings page once they are in.`,
  },
  {
    name: "log_my_week",
    title: "Log what happened this week",
    description: "Turn a rambling update into structured brain-dump entries and pipeline updates.",
    arguments: [{ name: "update", description: "What happened — write it however you like", required: true }],
    build: (args) => `Here is what happened this week. File it properly.

<update>
${args.update ?? ""}
</update>

1. Anything about my current job or a past job → append_role_brain_dump on the right role (call list_roles first to find ids). Keep my numbers and specifics.
2. Anything that is a clean accomplishment → also create_highlights so it is resume-ready.
3. Anything about a company I am talking to → log_activity on the application, and move_application_stage if it moved.
4. Anything I said I would do → create_task with a due date.
5. Anything that does not fit a role or a company → create_note.

Then confirm what you filed and where, and ask me about anything that was ambiguous.`,
  },
];

export const promptsByName = new Map(prompts.map((prompt) => [prompt.name, prompt]));

/** Same rule as tools: members never see the admin workflows. */
export function promptsFor(user: { role: UserRole }): McpPrompt[] {
  return isAdmin(user) ? prompts : prompts.filter((prompt) => !prompt.adminOnly);
}

// ---------------------------------------------------------------------------
// The workflows, again, as tools
// ---------------------------------------------------------------------------

/**
 * MCP prompts are a client-optional surface. Tools are not.
 *
 * The workflows above are the most considered design in this file —
 * tailor_resume alone encodes the whole seven-step loop including "do not
 * invent anything" — and in a client that doesn't render prompts they are
 * simply unreachable. That fails this project's own rule: a feature isn't done
 * until it's callable from a conversation.
 *
 * So every prompt is also published as a tool. Calling one returns the same
 * instruction text `prompts/get` would have returned, which the model then
 * follows. This is a wrapper, not a copy — the text lives in exactly one place,
 * so the two surfaces cannot drift.
 */
function promptAsTool(prompt: McpPrompt): McpTool {
  const properties: Json = {};
  for (const argument of prompt.arguments) {
    properties[argument.name] = str(argument.description);
  }
  const requiredArgs = prompt.arguments.filter((a) => a.required).map((a) => a.name);

  return {
    name: prompt.name,
    title: prompt.title,
    description:
      `${prompt.description} Returns a step-by-step plan for this job — follow the steps it gives you, ` +
      `calling the tools it names. This is a workflow, not a data lookup: nothing is read or written until you act on it.`,
    inputSchema: object(properties, requiredArgs),
    adminOnly: prompt.adminOnly,
    handler: async (args) => {
      const stringArgs: Record<string, string> = {};
      for (const argument of prompt.arguments) {
        const value = s(args, argument.name);
        if (value !== undefined) stringArgs[argument.name] = value;
        else if (argument.required) throw new Error(`Missing required string argument "${argument.name}"`);
      }
      return prompt.build(stringArgs);
    },
  };
}

/** The data tools plus the workflow tools. Order matters only for display. */
export const allTools: McpTool[] = [...tools, ...prompts.map(promptAsTool)];

export function toolsFor(user: { role: UserRole }): McpTool[] {
  return isAdmin(user) ? allTools : allTools.filter((tool) => !tool.adminOnly);
}

export const toolsByName = new Map(allTools.map((tool) => [tool.name, tool]));
