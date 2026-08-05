import type { ActivityType, Stage } from "@prisma/client";
import * as brain from "@/lib/data/brain";
import * as resumes from "@/lib/data/resumes";
import * as pipeline from "@/lib/data/pipeline";
import { parseResumeDoc, RESUME_DOC_SHAPE } from "@/lib/resume-schema";

type Json = Record<string, unknown>;

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  handler: (args: Json) => Promise<unknown>;
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
    handler: async (args) => brain.searchBrain(required(args, "query"), n(args, "limit") ?? 25),
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
    handler: async (args) => {
      const snapshot = await brain.getBrainSnapshot();
      if (b(args, "include_brain_dumps") === false) {
        return {
          ...snapshot,
          profile: { ...snapshot.profile, brainDump: "[omitted]" },
          roles: snapshot.roles.map((r) => ({ ...r, brainDump: "[omitted]" })),
        };
      }
      return snapshot;
    },
  },
  {
    name: "get_profile",
    title: "Get profile",
    description:
      "The user's identity block: name, headline, contact details, links, career summary and their personal brain dump (values, what they want next, comp expectations, non-negotiables).",
    inputSchema: object({}),
    handler: async () => brain.getProfile(),
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
    handler: async (args) =>
      brain.updateProfile(
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
      ),
  },
  {
    name: "list_roles",
    title: "List roles",
    description:
      "List every job/role in the knowledge base with dates and how many highlights each has. Does not include the full brain dump — use get_role for that.",
    inputSchema: object({}),
    handler: async () => brain.listRoles(),
  },
  {
    name: "get_role",
    title: "Get a role",
    description:
      "Full detail for one role including its complete brain dump text and all of its achievement highlights.",
    inputSchema: object({ id: str("Role id") }, ["id"]),
    handler: async (args) => brain.getRole(required(args, "id")),
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
    handler: async (args) =>
      brain.createRole({
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
    handler: async (args) =>
      brain.updateRole(
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
    handler: async (args) =>
      brain.appendToRoleBrainDump(required(args, "id"), required(args, "text"), s(args, "heading")),
  },
  {
    name: "delete_role",
    title: "Delete a role",
    description: "Permanently delete a role and all of its highlights.",
    inputSchema: object({ id: str("Role id") }, ["id"]),
    handler: async (args) => brain.deleteRole(required(args, "id")),
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
    handler: async (args) => brain.listHighlights(s(args, "roleId")),
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
    handler: async (args) => {
      const items = Array.isArray(args.highlights) ? (args.highlights as Json[]) : [];
      return brain.createHighlights(
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
    handler: async (args) =>
      brain.updateHighlight(
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
    handler: async (args) => brain.deleteHighlight(required(args, "id")),
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
    handler: async () => brain.listNotes(),
  },
  {
    name: "create_note",
    title: "Create a note",
    description:
      "Save a free-floating note. Use this for brain-dump material that does not belong to one specific job.",
    inputSchema: object(
      {
        title: str("Short title"),
        body: str("The note body. Markdown welcome, no length limit."),
        tags: strArray("Tags"),
        pinned: bool("Pin to the top of the notes list"),
      },
      ["title"],
    ),
    handler: async (args) =>
      brain.createNote({
        title: required(args, "title"),
        ...defined({ body: s(args, "body"), tags: a(args, "tags"), pinned: b(args, "pinned") }),
      }),
  },
  {
    name: "update_note",
    title: "Update a note",
    description: "Edit an existing note. Passing `body` replaces the whole body.",
    inputSchema: object(
      {
        id: str("Note id"),
        title: str("New title"),
        body: str("New body (replaces existing)"),
        tags: strArray("New tags"),
        pinned: bool("Pinned state"),
      },
      ["id"],
    ),
    handler: async (args) =>
      brain.updateNote(
        required(args, "id"),
        defined({
          title: s(args, "title"),
          body: s(args, "body"),
          tags: a(args, "tags"),
          pinned: b(args, "pinned"),
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
    handler: async (args) => {
      switch (required(args, "kind")) {
        case "education":
          return brain.listEducation();
        case "projects":
          return brain.listProjects();
        case "skills":
          return brain.listSkillGroups();
        case "certifications":
          return brain.listCertifications();
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
    handler: async (args) => {
      switch (required(args, "kind")) {
        case "education":
          return brain.createEducation({
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
          return brain.createProject({
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
          return brain.createSkillGroup({
            name: required(args, "name"),
            skills: a(args, "skills") ?? [],
          });
        case "certifications":
          return brain.createCertification({
            name: required(args, "name"),
            ...defined({ issuer: s(args, "issuer"), date: s(args, "date"), url: s(args, "url") }),
          });
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
    handler: async (args) => {
      const id = required(args, "id");
      switch (required(args, "kind")) {
        case "education":
          return brain.deleteEducation(id);
        case "projects":
          return brain.deleteProject(id);
        case "skills":
          return brain.deleteSkillGroup(id);
        case "certifications":
          return brain.deleteCertification(id);
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
    handler: async () => ({
      documentShape: RESUME_DOC_SHAPE,
      templates: [
        { key: "classic", description: "Serif headings, centred header. Timeless, ATS-safe." },
        { key: "modern", description: "Sans-serif, accent rules, left-aligned header." },
        { key: "compact", description: "Tight leading, two-column skills. Fits the most content." },
        { key: "editorial", description: "Large display name, generous whitespace, magazine feel." },
      ],
      fonts: ["inter", "serif", "mono"],
      guidance: [
        "Dates use YYYY-MM. Set isCurrent: true instead of an endDate for the current job.",
        "Bullets: strong verb first, specific scope, quantified outcome. One line each where possible.",
        "Order sections summary → experience → projects → education → skills unless the target role suggests otherwise.",
        "Set visible: false to keep a section in the document but off the page.",
        "Aim for roughly 40-48 rendered lines per page; call get_resume with as_text to sanity-check length.",
      ],
    }),
  },
  {
    name: "list_resumes",
    title: "List resumes",
    description:
      "All saved resumes with their target role/company and how many applications each is attached to.",
    inputSchema: object({}),
    handler: async () => resumes.listResumes(),
  },
  {
    name: "get_resume",
    title: "Get a resume",
    description: "Fetch one resume: its settings and its full document JSON.",
    inputSchema: object(
      {
        id: str("Resume id"),
        as_text: bool("Also return a flat plain-text rendering, useful for reviewing length and flow"),
      },
      ["id"],
    ),
    handler: async (args) => {
      const resume = await resumes.getResume(required(args, "id"));
      if (!resume) throw new Error("Resume not found");
      if (b(args, "as_text")) {
        return {
          ...resume,
          text: resumes.resumeToText(resume.doc),
          estimatedLines: resumes.estimateLines(resume.doc),
        };
      }
      return resume;
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
        template: str("classic | modern | compact | editorial"),
        accent: str("Accent colour as a hex string, e.g. '#6366f1'"),
        fontFamily: str("inter | serif | mono"),
        fontSize: num("Base font size in points, 9-12. Default 10."),
        lineHeight: num("Line height, 1.15-1.6. Default 1.35."),
        notes: str("Private notes about this version — what you tailored and why"),
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
    handler: async (args) =>
      resumes.createResume({
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
        template: str("classic | modern | compact | editorial"),
        accent: str("Accent colour hex"),
        fontFamily: str("inter | serif | mono"),
        fontSize: num("Base font size in points"),
        lineHeight: num("Line height"),
        notes: str("Private notes"),
        isFavorite: bool("Pin this resume to the top"),
        data: {
          type: "object",
          description: "The complete replacement resume document",
          additionalProperties: true,
        },
      },
      ["id"],
    ),
    handler: async (args) =>
      resumes.updateResume(required(args, "id"), {
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
        }),
      }),
  },
  {
    name: "duplicate_resume",
    title: "Duplicate a resume",
    description:
      "Copy an existing resume so you can tailor a variant without losing the original. The usual flow for a new application.",
    inputSchema: object({ id: str("Resume id to copy"), name: str("Name for the copy") }, ["id"]),
    handler: async (args) => resumes.duplicateResume(required(args, "id"), s(args, "name")),
  },
  {
    name: "delete_resume",
    title: "Delete a resume",
    description: "Permanently delete a resume.",
    inputSchema: object({ id: str("Resume id") }, ["id"]),
    handler: async (args) => resumes.deleteResume(required(args, "id")),
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
    handler: async (args) => {
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
    handler: async () => pipeline.pipelineStats(),
  },
  {
    name: "list_applications",
    title: "List applications",
    description:
      "List job applications. By default closed applications (accepted/rejected/withdrawn) are excluded.",
    inputSchema: object({
      stage: { type: "string", enum: STAGE_VALUES, description: "Only this stage" },
      includeClosed: bool("Include accepted / rejected / withdrawn"),
      search: str("Filter by company, role title or notes"),
    }),
    handler: async (args) =>
      pipeline.listApplications({
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
    handler: async (args) => pipeline.getApplication(required(args, "id")),
  },
  {
    name: "create_application",
    title: "Create an application",
    description:
      "Track a new job. Paste the full posting into jobDescription — it is what you will tailor the resume against later. The company is created automatically if it does not exist.",
    inputSchema: object(
      {
        company: str("Company name"),
        roleTitle: str("Job title"),
        stage: { type: "string", enum: STAGE_VALUES, description: "Starting stage. Default WISHLIST." },
        jobUrl: str("Link to the posting"),
        jobDescription: str("The full job posting text"),
        location: str("Job location"),
        workMode: str("Remote | Hybrid | On-site"),
        salaryRange: str("Advertised or expected compensation"),
        source: str("Where you found it, e.g. 'LinkedIn', 'referral from Dana'"),
        excitement: num("1-5 how much they want this"),
        fit: num("1-5 how strong a fit they are"),
        notes: str("Any notes"),
        appliedAt: str("ISO date they applied"),
        nextFollowUpAt: str("ISO date to follow up. Auto-set from the stage if omitted."),
        resumeId: str("Id of the resume used"),
      },
      ["company", "roleTitle"],
    ),
    handler: async (args) =>
      pipeline.createApplication({
        company: required(args, "company"),
        roleTitle: required(args, "roleTitle"),
        ...defined({
          stage: s(args, "stage") as Stage | undefined,
          jobUrl: s(args, "jobUrl"),
          jobDescription: s(args, "jobDescription"),
          location: s(args, "location"),
          workMode: s(args, "workMode"),
          salaryRange: s(args, "salaryRange"),
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
      "Update fields on an application. Changing `stage` here also writes a timeline entry and resets the follow-up date.",
    inputSchema: object(
      {
        id: str("Application id"),
        company: str("Company name"),
        roleTitle: str("Job title"),
        stage: { type: "string", enum: STAGE_VALUES, description: "New stage" },
        jobUrl: str("Posting link"),
        jobDescription: str("Job posting text"),
        location: str("Location"),
        workMode: str("Remote | Hybrid | On-site"),
        salaryRange: str("Compensation"),
        source: str("Source"),
        excitement: num("1-5"),
        fit: num("1-5"),
        notes: str("Notes"),
        appliedAt: str("ISO date applied"),
        nextFollowUpAt: str("ISO date of next follow-up, or empty string to clear"),
        resumeId: str("Attach this resume id, or empty string to detach"),
      },
      ["id"],
    ),
    handler: async (args) =>
      pipeline.updateApplication(required(args, "id"), {
        ...defined({
          company: s(args, "company"),
          roleTitle: s(args, "roleTitle"),
          stage: s(args, "stage") as Stage | undefined,
          jobUrl: s(args, "jobUrl"),
          jobDescription: s(args, "jobDescription"),
          location: s(args, "location"),
          workMode: s(args, "workMode"),
          salaryRange: s(args, "salaryRange"),
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
    name: "move_application_stage",
    title: "Move an application to a new stage",
    description:
      "Advance or close an application. Automatically logs the change to the timeline and schedules the next follow-up.",
    inputSchema: object(
      {
        id: str("Application id"),
        stage: { type: "string", enum: STAGE_VALUES, description: "The new stage" },
        note: str("Optional note for the timeline entry"),
      },
      ["id", "stage"],
    ),
    handler: async (args) =>
      pipeline.moveApplicationStage(
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
    handler: async (args) => pipeline.deleteApplication(required(args, "id")),
  },
  {
    name: "log_activity",
    title: "Log activity on an application",
    description:
      "Append to an application's timeline: a recruiter call, an email you sent, an interview, a note to self.",
    inputSchema: object(
      {
        applicationId: str("Application id"),
        type: { type: "string", enum: ACTIVITY_VALUES, description: "Kind of activity. Default NOTE." },
        body: str("What happened"),
        occurredAt: str("ISO datetime it happened. Defaults to now."),
      },
      ["applicationId", "body"],
    ),
    handler: async (args) =>
      pipeline.addActivity({
        applicationId: required(args, "applicationId"),
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
    handler: async (args) => pipeline.listActivities(s(args, "applicationId"), n(args, "limit") ?? 40),
  },
  {
    name: "list_follow_ups",
    title: "List follow-ups that are due",
    description:
      "Applications whose follow-up date has arrived or passed. This is the 'who do I need to chase today' tool.",
    inputSchema: object({
      withinDays: num("Look ahead this many days. 0 = due now, 7 = due within a week."),
    }),
    handler: async (args) => pipeline.followUpsDue(n(args, "withinDays") ?? 0),
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description: "To-dos, optionally attached to an application.",
    inputSchema: object({ done: bool("Filter by completion state. Omit for all.") }),
    handler: async (args) => pipeline.listTasks({ done: b(args, "done") }),
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
    handler: async (args) =>
      pipeline.createTask({
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
    handler: async (args) => pipeline.setTaskDone(required(args, "id"), b(args, "done") ?? true),
  },
  {
    name: "list_contacts",
    title: "List contacts",
    description: "Recruiters, hiring managers and referrals, optionally for one application.",
    inputSchema: object({ applicationId: str("Limit to one application") }),
    handler: async (args) => pipeline.listContacts(s(args, "applicationId")),
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
    handler: async (args) =>
      pipeline.createContact({
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
];

export const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

// ---------------------------------------------------------------------------
// Prompts — these surface in Claude as ready-made workflows
// ---------------------------------------------------------------------------

export type McpPrompt = {
  name: string;
  title: string;
  description: string;
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

Bullets must lead with a strong verb, name the specific scope, and end in a measurable outcome pulled from the brain dump.`,
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

1. Call pipeline_stats for the shape of the search.
2. Call list_follow_ups with within_days: 7.
3. Call list_applications and list_activities to see what has actually moved.
4. Call list_tasks with done: false.

Then give me:
- A two-line summary of where the search stands.
- Anything stalled: applied over 10 days ago with no movement, or a follow-up date that has passed.
- A prioritised list of what to do this week, most important first, each tied to a specific company.
- Draft the follow-up messages for anything overdue.
- Create tasks for the actions I should take, with due dates.`,
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
