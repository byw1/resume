# Hired — working agreement

Read this before writing code. It is the difference between a change that fits and a
change that has to be reverted.

## What this is

A self-hosted career operating system: a **brain** (everything you know about every job
you've had), a **resume builder** that assembles documents from that material, and a
**pipeline** CRM for the search. One person per workspace, many people per instance.

**The interface is a conversation.** The web app is real and good, but the product thesis
is that you talk to this thing — "here's what I did last quarter, file it", "tailor my
resume to this posting", "what do I need to chase this week" — and the UI is where you go
to look at, adjust and print the result. Every design decision follows from that.

The audience is the author and his friends. Not enterprise. Optimise for *one person can
deploy this in five minutes and never touch a terminal again*.

---

## Rule zero: MCP first, UI second

**A feature is not done until it is callable from a conversation.**

The order of work is fixed:

1. `prisma/schema.prisma` — model the data, write the migration
2. `src/lib/data/*.ts` — the data function, `userId` first argument
3. `src/lib/mcp/tools.ts` — the MCP tool(s), with a description an assistant can act on
4. `src/server/actions.ts` — the server action, if a human needs to do it by hand
5. `src/app` + `src/components` — the screen

Steps 1–3 are mandatory. Steps 4–5 are mandatory only when a person needs to *see* or
*adjust* the thing. If you find yourself building a form before the tool exists, stop —
you are building the wrong product.

**The two exceptions**, and they are narrow: direct-manipulation editing (dragging a card
between stages, typing into the resume editor) and rendering (the paper, the print page).
Those are UI-native. Everything they manipulate still has to be reachable by tool.

When you finish a feature, ask literally: *can Claude do this end to end with no browser
open?* If the answer is no, it is not finished.

---

## Invariants — do not break these

**1. Tenant isolation is a compile-time property.**
Every function in `src/lib/data/` takes the owning `userId` as its **first positional
argument** and every query filters on it. It is positional and required precisely so the
compiler rejects a call site that forgets. Never add a data function with an optional or
object-bag `userId`. Never let a `userId` arrive from the client — server actions resolve
the caller from their session cookie, MCP tools resolve them from the connection token.
Admins manage *accounts*, never *content*: no code path lets one user read another's
brain, resumes or applications.

**2. The MCP tools and the UI share one data layer.**
Both call `src/lib/data/`. If you write logic in a server action that a tool would also
need, you have forked it — move it down. There is exactly one implementation of every
rule about the data.

**3. The MCP transport is stateless.**
`src/lib/mcp/handler.ts` is a hand-written Streamable HTTP implementation. Every POST is
self-contained and re-resolves its user from the token, which is what makes restarts,
replicas and instant suspension work. Do not introduce session state, in-memory caches
keyed by connection, or anything that assumes two requests hit the same process.

**4. The resume document schema is a contract.**
`src/lib/resume-schema.ts` is shared by the database (`Resume.data` JSON), the renderer
and the tools. Every field is optional-with-a-default so a half-generated document still
renders. Keep it flat and boring. Adding a field is fine; changing the meaning of one
means old saved documents render wrong.

**5. Self-hosting stays one variable.**
`DATABASE_URL` is the only required env var. Everything else is configured inside the app
and lives in the `Setting` table. If a feature needs configuration, it gets an admin
panel and an `admin_*` tool — not a new environment variable. The app provisions its
owner account at boot (`src/lib/bootstrap.ts`) and applies migrations on start.

**6. No fabrication.** The server instructions in `handler.ts` tell every connected client
never to invent experience, employers, dates or metrics. Any new tool or prompt that
generates resume content inherits that rule and should restate it.

---

## The map

```
prisma/schema.prisma          Data model. Migrations in prisma/migrations/, applied on boot.
src/lib/data/                 THE data layer. brain / resumes / pipeline / users / connections.
src/lib/mcp/tools.ts          Tool + prompt definitions. One array, one source of truth.
src/lib/mcp/handler.ts        Streamable HTTP transport + the server instructions block.
src/lib/mcp/clients.ts        Per-client setup recipes. Adding a client = one array entry.
src/lib/resume-schema.ts      The resume document contract (zod).
src/server/actions.ts         Server actions for the UI. Never accepts a userId.
src/app/(app)/                The app: dashboard, brain, resumes, applications, settings, admin.
src/app/api/mcp/[token]/      The connection URL. /api/mcp also accepts a bearer header.
src/app/print/[id]/           US-Letter page for browser "Save as PDF". Auth-gated.
src/components/               UI. ui/ is shadcn — extend, don't rewrite.
```

Data areas map cleanly onto tool prefixes: brain (`search_brain`, `list_roles`,
`append_role_brain_dump`, …), resumes (`get_resume_format`, `create_resume`,
`preview_resume_text`, …), pipeline (`list_applications`, `move_application_stage`,
`list_follow_ups`, …), admin (`admin_*`, hidden from members' `tools/list` entirely —
not merely refused).

---

## Writing an MCP tool

The description **is** the UX. An assistant with a good description calls the right tool
with the right arguments the first time; with a vague one it guesses and writes garbage
into someone's career history. Budget real effort here.

- Say **when to reach for it**, not just what it does. `search_brain`'s description opens
  with "This is the FIRST tool to call when tailoring a resume" — that sentence does more
  work than the whole schema.
- Say what comes back and how to use it — ids, kinds, whether it saved anything.
- Flag destructive or overwriting semantics loudly. `update_resume` and `update_role`
  **replace** what you send; the description has to say "read first, modify, then write
  back whole" or an assistant will silently drop half a role.
- Prefer additive tools where a person would expect additive behaviour.
  `append_role_brain_dump` exists because `update_role` was eating people's notes.
- Give a dry-run where a mistake is expensive. `preview_resume_text` renders and estimates
  page count *without* saving, so length can be checked before committing.
- Use the local helpers (`str`, `num`, `bool`, `object`, `required`, `defined`) rather
  than hand-rolling schema objects. `defined()` strips undefined keys so Prisma doesn't
  try to write them.
- Admin tools set `adminOnly: true`. Never rely on the handler refusing a call as the
  only protection.

Multi-step jobs belong in `prompts` (bottom of `tools.ts`), which surface as slash
commands or prompt shortcuts. If you catch yourself writing a tool that does four things
in sequence, it is a prompt composed of four tools.

---

## Current focus: make this the only tool in the workflow

The point of the next stretch is to delete the other tabs — resume.lol in particular.
Ship in this order; each one alone removes a reason to leave the app.

**1. A resume has a URL.** `Resume.slug` + `visibility` (`PRIVATE` | `UNLISTED`), a public
route at `/r/[slug]` that renders `ResumePaper` with no auth, and `publish_resume` /
`unpublish_resume` tools. This is the single feature people actually use resume.lol for:
a link you paste into an application form. Unlisted-by-random-slug is the whole privacy
model — do not build sharing permissions.

**2. Real PDF export, server-side.** Today `/print/[id]` hands off to the browser print
dialog, which means "set margins to None" is in the README. Render the same page headless
and serve the bytes, exposed as an `export_resume_pdf` tool that returns a URL. Keep the
print page working as the fallback — it is the reason the output is selectable text and
ATS-readable, and that property must survive.

**3. Import, so friends can start.** Paste a resume, a PDF or a LinkedIn export and get a
populated brain: `import_resume`. Right now a new user faces an empty workspace and has
to type their life story before the product does anything. This is the adoption blocker,
not a feature.

**4. Capture a posting in one move.** `capture_job_posting(url)` — fetch, parse, create or
match the `Company`, create the `Application` with `jobDescription` filled, return the id.
Manual application entry is the other thing that makes people fall back to a spreadsheet.

**5. Tailoring becomes traceable.** `Resume.baseResumeId` plus a diff view: what changed
between the base and the tailored copy, and which brain evidence backed each new bullet.
`duplicate_resume` already does the mechanical part; this makes it reviewable.

**Parked, deliberately** — revisit once 1–5 land: first-class interview rounds and
questions (today they are `Activity` rows of type `INTERVIEW` with free-text bodies), and
any sharing-between-users feature. Sharing needs a hosted instance, a moderation story and
a privacy model that does not exist yet; every instance is single-tenant self-hosted
today. Do not start it as a side quest.

---

## Working style

**Read before you write.** This codebase has opinions and they are documented in comments
at the top of most files — `handler.ts` explains why the transport is hand-rolled,
`clients.ts` explains why the token is in the URL path, `package.json` explains why the
build toolchain sits in `dependencies`. If a comment explains a decision, that decision
was expensive. Ask before reversing it.

**Migrations are real.** Write a migration in `prisma/migrations/` — the deploy runs
`prisma migrate deploy` on start. `db:push` is for local scratch only. Never edit an
applied migration.

**Verify before you claim done:**

```bash
npm run typecheck    # tsc --noEmit — must be clean
npm run build        # must succeed; this is what Railway runs
```

Then the parity check: list what you added, and confirm each item exists in both
`src/lib/data/` and `src/lib/mcp/tools.ts`.

**Prose matters here.** The README, tool descriptions and UI copy are written in a
specific voice: plain, direct, second person, no marketing, no exclamation marks, no
emoji, contractions fine. Sentences carry information — "That's expected; the next two
steps fix it" rather than "Don't worry!". Match it. When you add a feature, update the
README in that voice rather than appending a bullet list.

**Log decisions.** When you make a non-obvious call — a tradeoff, a thing you tried that
didn't work, a constraint you discovered — append it to `.claude/DECISIONS.md` with the
date. That file is the memory the next session doesn't have.

**Small commits, real messages.** Look at `git log`: each commit is one coherent change
described in the imperative by what it does for the user ("Make MCP the front door: one
connection per client, any platform"), not by what files moved.
