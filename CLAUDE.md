# Hired — working agreement

Read this before writing code. It is the difference between a change that fits and a
change that has to be reverted.

This file is the briefing for **any** coding agent, not just Claude — `AGENTS.md` is a
symlink to it, so Cursor, Codex, Gemini and whatever comes next all load the same words.
If you change how this project is worked on, change it here; there is no second copy to
keep in sync.

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

When you finish a feature, ask literally: *can an assistant connected over MCP do this
end to end with no browser open?* If the answer is no, it is not finished.

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
panel and an `admin_*` tool — not a new environment variable. The narrow exception is
machine-level facts the app cannot know about its host — where the Chromium binary lives
for PDF export, say — which may be optional env vars with working defaults. The app
provisions its owner account at boot (`src/lib/bootstrap.ts`) and applies migrations on
start.

**6. No fabrication.** The server instructions in `handler.ts` tell every connected client
never to invent experience, employers, dates or metrics. Any new tool or prompt that
generates resume content inherits that rule and should restate it.

---

## The map

```
prisma/schema.prisma          Data model. Migrations in prisma/migrations/, applied on boot.
src/lib/data/                 THE data layer, one file per area: brain, resumes, pipeline,
                              pipeline-share, views, users, connections, waitlist, audit,
                              system, patch. userId first wherever content is touched;
                              the instance-level files (users, waitlist, audit, system)
                              say in their header comments why they are not exceptions.
src/lib/mcp/tools.ts          Tool + prompt definitions. One array, one source of truth.
src/lib/mcp/handler.ts        Streamable HTTP transport + the server instructions block.
src/lib/mcp/clients.ts        Per-client setup recipes. Adding a client = one array entry.
src/lib/resume-schema.ts      The resume document contract (zod).
src/lib/pdf.ts                Server-side PDF rendering. Needs a Chromium on the host;
                              degrades to the print page where there isn't one.
src/server/actions.ts         Server actions for the UI. Never accepts a userId.
src/app/(app)/                The app: dashboard, brain, resumes, applications, crm, docs,
                              settings (admin lives under it).
src/app/api/mcp/[token]/      The connection URL. /api/mcp also accepts a bearer header.
src/app/r/[slug]/             Published resume, no auth. With /p/[slug] (shared pipeline),
                              the only unauthenticated pages in the app — unlisted slugs
                              are the entire privacy model, so treat both with care.
src/app/print/[id]/           US-Letter page for browser "Save as PDF". Auth-gated. The
                              fallback when the host has no Chromium, and the reason the
                              output stays selectable text.
src/components/               UI. ui/ is shadcn — extend, don't rewrite.
.claude/DECISIONS.md          Append-only decision log. Read it before reversing anything.
.claude/skills/               Deep guides for whoever writes the code: mcp-tool (how to
                              write a tool description), ship-a-feature (the build order,
                              in detail). Plain markdown — every agent should read them,
                              not just the one that auto-loads them.
.claude/plans/                Designs, not decisions. workspaces.md describes an unbuilt
                              feature; nothing in this directory is current architecture.
skills/                       Product-facing skills served to *users* of a running
                              instance from its /docs page. Not development guides —
                              don't confuse this tree with .claude/skills/.
```

Data areas map cleanly onto tool prefixes: brain (`search_brain`, `list_roles`,
`append_role_brain_dump`, …), resumes (`get_resume_format`, `create_resume`,
`preview_resume_text`, …), pipeline (`list_applications`, `move_application_stage`,
`list_follow_ups`, …), CRM (`list_companies`, `create_contact`, …), admin (`admin_*`,
hidden from members' `tools/list` entirely — not merely refused). Don't trust any
hand-written tool count you find, including in old decision-log entries: the authoritative
number is generated live on the /docs page, and the README hand-carries it in three
places that must be bumped whenever the array changes.

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
  length *without* saving; `export_resume_pdf` reports the measured page count.
- Use the local helpers (`str`, `num`, `bool`, `object`, `required`, `defined`) rather
  than hand-rolling schema objects. `defined()` strips undefined keys so Prisma doesn't
  try to write them.
- Admin tools set `adminOnly: true`. Never rely on the handler refusing a call as the
  only protection.

Multi-step jobs belong in `prompts` (bottom of `tools.ts`), which surface as slash
commands or prompt shortcuts. If you catch yourself writing a tool that does four things
in sequence, it is a prompt composed of four tools.

---

## Current focus: a new user's first ten minutes

The original focus list — delete the reasons to leave the app for resume.lol — is mostly
done. Shipped and live: a published resume has an unlisted URL at `/r/[slug]`
(`publish_resume` / `unpublish_resume`), PDF export renders server-side
(`export_resume_pdf`, `src/lib/pdf.ts`, print page kept as the Chromium-less fallback),
a posting is captured in one move (`capture_job_posting`), and a pipeline can be shared
read-only at `/p/[slug]`. Do not rebuild any of these; the decision log records how each
landed.

What remains, in order:

**1. Import, so friends can start.** Paste a resume, a PDF or a LinkedIn export and get a
populated brain: `import_resume`. Right now a new user faces an empty workspace and has
to type their life story before the product does anything. This is the adoption blocker,
not a feature.

**2. Tailoring becomes traceable.** `Resume.baseResumeId` plus a diff view: what changed
between the base and the tailored copy, and which brain evidence backed each new bullet.
`duplicate_resume` already does the mechanical part; this makes it reviewable.

**Parked, deliberately:** first-class interview rounds and questions (today they are
`Activity` rows of type `INTERVIEW` with free-text bodies), and any sharing that involves
*accounts* — viewers, editors, workspace members. The unlisted links that exist
(`/r/[slug]`, `/p/[slug]`) are the deliberate ceiling: a link is consent, an account
system is a permissions model this product does not have and should not grow as a side
quest. `.claude/plans/workspaces.md` is a design for it, and only a design.

---

## Working style

**Read before you write.** This codebase has opinions and they are documented in comments
at the top of most files — `handler.ts` explains why the transport is hand-rolled,
`clients.ts` explains why the token is in the URL path, `package.json` explains why the
build toolchain sits in `dependencies`. If a comment explains a decision, that decision
was expensive. Ask before reversing it.

**Migrations are real.** Write a migration in `prisma/migrations/` — the deploy runs
`prisma migrate deploy` on start. `db:push` is for local scratch only. Never edit an
applied migration. And after any edit to `prisma/schema.prisma`, run `npx prisma generate`
before you typecheck: only `postinstall` and `build` regenerate the client, so without it
the compiler rejects your new model with an error that looks like your code is wrong when
it is only stale.

**Verify before you claim done:**

```bash
npm run typecheck    # tsc --noEmit — must be clean
npm run build        # must succeed; this is what Railway runs
```

These two commands are the *only* gate. There is no CI check on branches or PRs — the
first thing that compiles your code after you push to main is the Docker image build that
self-hosters pull — so "it'll get caught later" is false here. There is also no test
suite; typecheck, build, and actually exercising the change are the whole verification
story.

Then the parity check: list what you added, and confirm each item exists in both
`src/lib/data/` and `src/lib/mcp/tools.ts`.

**Running it locally** is in the README under "Running it locally": one `DATABASE_URL` in
`.env`, `npm install`, `npx prisma migrate deploy`, `npm run dev`; the owner password
prints once on first boot. `npm run dev` applies no migrations — only `start` does.

**Prose matters here.** The README, tool descriptions and UI copy are written in a
specific voice: plain, direct, second person, no marketing, no exclamation marks, no
emoji, contractions fine. Sentences carry information — "That's expected; the next two
steps fix it" rather than "Don't worry!". Match it. When you add a feature, update the
README in that voice rather than appending a bullet list.

**Log decisions.** When you make a non-obvious call — a tradeoff, a thing you tried that
didn't work, a constraint you discovered — append it to `.claude/DECISIONS.md` with the
date. That file is the memory the next session doesn't have, and it applies to every
agent, whatever the directory is named. Rules of the file: append-only, newest at the
bottom, and a later entry supersedes an earlier one on the same subject — so when you
consult it, search or read from the end rather than trusting the first match. It is far
too long to read whole; don't try.

**Small commits, real messages.** Look at `git log`: each commit is one coherent change
described in the imperative by what it does for the user ("Make MCP the front door: one
connection per client, any platform"), not by what files moved.
