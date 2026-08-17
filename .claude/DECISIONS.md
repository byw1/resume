# Decisions

The memory a fresh session doesn't have. Append when you make a non-obvious call, hit a
constraint, or try something that doesn't work. Newest at the bottom. One entry, one
decision, with the *why* — the why is the part that stops it being relitigated.

Format:

```
## YYYY-MM-DD — short title
**Decision:** what we're doing.
**Why:** the reasoning, including what we gave up.
**Applies to:** files or areas this constrains.
```

---

## 2026-08-17 — CLAUDE.md and .claude/ added
**Decision:** the repo now carries its own working agreement: `CLAUDE.md` for
architecture invariants and the MCP-first rule, `.claude/skills/` for the feature and
tool-writing loops, `.claude/commands/` for `/ship`, `/parity` and `/preflight`, and a
`tenant-auditor` subagent. Personal context lives in `CLAUDE.local.md`, gitignored.
**Why:** every session was re-deriving the architecture from the source and sometimes
getting it wrong — building screens before tools, or adding data functions without a
leading `userId`. The rules were real but only existed in the author's head and in
file-header comments.
**Applies to:** everything. Read `CLAUDE.md` before writing code.

## 2026-08-17 — Focus: replace resume.lol before adding anything social
**Decision:** the next five features are public resume URLs, server-side PDF export,
resume/LinkedIn import, one-call job-posting capture, and traceable tailoring. Interview
question tracking and any sharing-between-users feature are parked.
**Why:** the pipeline board and CRM already exist and work; the reason the workflow still
leaves this app is that a resume has no URL and the PDF path runs through the browser
print dialog. Sharing needs a hosted instance, moderation and a privacy model that
single-tenant self-hosting doesn't have — starting it now would stall on infrastructure
rather than ship.
**Applies to:** roadmap decisions, and any PR that proposes a social feature.

## 2026-08-17 — Custom utilities must not outrank Tailwind's
**Decision:** `.ring-highlight`'s `position: relative` lives behind `:where()` in
`globals.css`, and any future custom utility that sets a property Tailwind also owns has to
do the same. Don't "tidy" the `:where()` away.
**Why:** `globals.css` is emitted *after* Tailwind's own utilities inside
`@layer utilities`, so a bare `.ring-highlight { position: relative }` beat `.fixed` at
equal specificity. Every dialog and the command palette silently lost `position: fixed` and
fell to the bottom of the page — the overlay still dimmed correctly, which is why it looked
like a layout bug rather than a cascade bug. `:where()` drops the rule to zero specificity
so it only supplies a default. The browser suite now asserts that no element carrying a
position utility computes anything else, which is the check that would have caught it.
**Applies to:** `src/app/globals.css`, and any new utility in `@layer utilities`.

## 2026-08-17 — One MCP connection per client, and the migration that made it safe
**Decision:** `User.mcpToken` is gone; connections are rows in `McpConnection`, one per AI
client, each with its own token, `lastUsedAt` and `lastUsedFrom`. The migration copies every
existing token into a connection row *before* dropping the column.
**Why:** a single token meant rotating after pasting a URL somewhere careless disconnected
every client at once, and there was no way to answer "is this actually connected?". The
backfill is the part worth remembering: it makes the change invisible to anyone who had
already pasted a URL into Claude, which is the only reason this could ship to a live
instance without a reconnect. Tested against a database seeded with old-schema rows, then
`prisma migrate diff` to confirm zero drift.
**Applies to:** `prisma/migrations/20250104000000_mcp_connections/`, `src/lib/auth.ts`
(`userByMcpToken`, `ensureDefaultConnection`), `src/lib/data/connections.ts`.

## 2026-08-17 — No counter on connections
**Decision:** connections record `lastUsedAt` and `lastUsedFrom`, not a call count. A
`callCount` field was built and removed before shipping.
**Why:** writing on every tool call is wasteful on a chatty session, so the increment was
throttled to once a minute — which made the number quietly wrong and the name a lie. If a
future session wants real usage numbers, that's a separate append-only table, not a counter
on this row.
**Applies to:** `prisma/schema.prisma` (`McpConnection`), `src/lib/auth.ts`.

## 2026-08-17 — A resume gets a URL, and the slug is the entire privacy model
**Decision:** `Resume.slug` + `visibility` (PRIVATE | UNLISTED), a public `/r/[slug]` route
with no auth, and `publish_resume` / `unpublish_resume`. No per-viewer permissions, no
passwords, no expiry. Withdrawing a link *clears the slug* rather than hiding it, so the
address is destroyed and republishing mints a different one.
**Why:** this is the one thing people actually leave for resume.lol — a link you paste into
an application form. Everyone you'd send it to is someone you already decided to send it to,
so permissions would be ceremony protecting nothing. The slug carries ~60 bits of entropy,
which is what makes "unguessable" true rather than a slogan, and the page sets noindex
because an indexed unlisted link is a listed one. Destroying rather than pausing the address
matters: the reason you withdraw a link is usually that it went somewhere you regret, and a
pause that can be undone doesn't fix that.
**Applies to:** `src/app/r/[slug]/`, `publishResume`/`unpublishResume` in
`src/lib/data/resumes.ts`, `Resume.slug` in the schema.

## 2026-08-17 — One deliberately anonymous read, and how it's kept narrow
**Decision:** `getResumeBySlug(slug)` is the only function in `src/lib/data/` without a
leading `userId`. It filters on `visibility: UNLISTED` and uses an explicit `select` listing
the nine fields the public page renders.
**Why:** a public page has no user, so the compile-time isolation rule cannot apply — which
makes this the one place where a mistake is a data leak instead of a type error. The
`select` is an allow-list rather than an omit-list precisely so that adding a column to
`Resume` later can never silently publish it. `notes` are private tailoring notes and must
never appear. Do not widen it without asking whether a stranger should see the new field.
**Applies to:** `getResumeBySlug` in `src/lib/data/resumes.ts`.

## 2026-08-17 — Never spread a patch object into Prisma
**Decision:** every update in `src/lib/data/` narrows its patch through `pick()` from
`src/lib/data/patch.ts` with an explicit column list. `updateHighlight` additionally verifies
that a new `roleId` belongs to the caller, as `createHighlight` already did.
**Why:** found while shipping public URLs, confirmed against a live database, and worse than
it looked. The userId-first rule scopes the *query*; it says nothing about what the patch
*contains*, and server actions accept whatever JSON a client sends because the TypeScript
parameter type is erased at runtime. So `{ ...patch }` handed the caller every column:
`updateResumeAction(myId, { userId: someoneElse })` moved a row into another person's
workspace, `updateHighlightAction(mine, { roleId: theirRoleId })` read back their employer and
job title through the joined role, and once slug/visibility existed, a member could have
claimed an address another user had just withdrawn. All three were reachable; all three are
closed. Whitelisting also means a patch of nothing-we-recognise leaves no columns to write,
so each function now checks ownership directly rather than reporting "no such record" for a
record that plainly exists.
**Applies to:** every `update*` in `src/lib/data/brain.ts` and `resumes.ts`. Adding an
editable column means adding it to that function's list on purpose.

## 2026-08-17 — Pure resume helpers live outside the data layer
**Decision:** `resumeToText` and `estimateLines` moved to `src/lib/resume-text.ts`.
`resumes.ts` re-exports them so server callers are unchanged.
**Why:** the editor is a client component and imports `estimateLines` for its live page
count, which dragged the whole data module into the browser bundle. That only ever worked by
accident — adding one `node:crypto` import for slug generation broke the production build
outright. Nothing in `src/lib/data/` should be reachable from a client component.
**Applies to:** `src/lib/resume-text.ts`, `src/components/resume/resume-editor.tsx`.

## 2026-08-17 — Server-side PDF drives the print page, it doesn't replace it
**Decision:** `/api/resumes/[id]/pdf` launches headless Chromium against this app's own
`/print/[id]` and returns the bytes. `export_resume_pdf` does the same and reports the real
page count. The print page is untouched and stays reachable from the editor's ⋯ menu.
**Why:** the alternative was generating a PDF from the ResumeDoc with a PDF library, which
would have been a *second* renderer to keep in sync with `ResumePaper` — it would drift, and
the five templates would drift fastest. Driving the real page means there is exactly one
renderer and the PDF cannot disagree with what the editor shows. Verified the output is
genuinely selectable text: Chromium writes Type0/CIDFontType2 fonts, so the words are glyph
ids, and it is the ToUnicode CMap that makes them recoverable by a human copy-pasting or an
applicant tracking system. The test decodes through that map rather than asserting "it's a
PDF", because a rasterised page would pass the lazy check and fail every real ATS.
**Applies to:** `src/lib/pdf.ts`, `src/app/api/resumes/[id]/pdf/`, `/print/[id]` (leave it
alone).

## 2026-08-17 — The PDF renderer degrades instead of becoming a deploy dependency
**Decision:** `playwright-core`, not `playwright` or `puppeteer`, plus whatever Chromium the
host already has. No browser is downloaded at install. When there is none, the route answers
501 with an explanation and the tool returns `available: false` and points at the print page.
**Why:** self-hosting is supposed to be one variable and five minutes, and Railway's default
image has no Chromium — Railway's own guidance for Playwright is a Dockerfile. Making the
browser mandatory would have meant changing the builder for everyone to buy one-click PDF for
one person. This way an instance without a browser behaves exactly as it did before the
feature existed, and adding a browser later is a pure upgrade. `PDF_CHROMIUM_PATH` is
optional and exists for unusual hosts; `DATABASE_URL` is still the only required variable.
**Applies to:** `src/lib/pdf.ts`, `package.json`, deploy config.

## 2026-08-17 — The renderer authenticates with an ordinary short-lived Session
**Decision:** the PDF route mints a Session row expiring in 120 seconds, hands that cookie to
the headless browser, and deletes it in a `finally`.
**Why:** the print page must keep its `requireUser()` guard, so the renderer needs to be
somebody. The alternatives were a signed render token or an auth exemption on `/print`, and
both add a new way in that has to be reasoned about separately. Reusing the existing session
mechanism means the renderer inherits every check that already applies — a suspended user's
ephemeral session is rejected exactly like any other — and there is no new credential type in
the system.
**Applies to:** `createEphemeralSession`/`destroySession` in `src/lib/auth.ts`.

## 2026-08-17 — Docker build for server-side PDF: parked, not abandoned
**Decision:** the repo stays on Nixpacks. The `Dockerfile` and `.dockerignore` that installed
Chromium are reverted. `src/lib/pdf.ts` and everything around it stay exactly as they are, so
the PDF button falls back to the print page on a stock Railway deploy.
**Why:** two attempts, and no local Docker daemon to test against. The first failed because
`npm ci` runs `prisma generate` in postinstall and the schema hadn't been copied yet —
fixed. The second built fine and then failed its healthcheck: the container started, ran
migrations, and `next start` produced no output and never listened, where the Nixpacks
container printed its banner and was ready in under a second. That is a third unknown, and
debugging it by pushing to a live deployment is the wrong way to spend someone's site.
**What is already proven**, so nobody repeats it: `node:20-bookworm-slim` installs
`chromium` (lands at `/usr/bin/chromium`), `fonts-croscore` and `fonts-liberation` cleanly in
about 26 seconds; `COPY prisma ./prisma` must precede `npm ci`; the fonts are not optional,
because the Harvard template asks for Tinos and would otherwise silently render in something
else.
**How to finish it:** build the image locally with a real Docker daemon, run it with
DATABASE_URL and PORT set, and find out why `next start` stays silent — likely a port or
entrypoint difference between Railway's Docker runtime and Nixpacks. It is a ten-minute job
with a daemon and an unbounded one without.
**Applies to:** deploy config; revisit before promising one-click PDF in the README.

## 2026-08-17 — Every prompt is also a tool
**Decision:** the five workflows are published in `tools/list` as well as `prompts/list`, via
one `promptAsTool` wrapper over the existing `prompts` array. `prompts/list` and `prompts/get`
are unchanged.
**Why:** MCP prompts are a client-optional surface and tools are not. A full working session
against the live instance ran start to finish without a single prompt being reachable —
`tailor_resume`, which encodes the whole seven-step loop including "do not invent anything",
simply did not exist as far as that client was concerned. That fails this project's own rule:
a feature isn't done until it's callable from a conversation. It is a wrapper rather than a
copy on purpose — the instruction text has exactly one home, and a test asserts the tool and
the prompt return byte-identical strings so the two surfaces cannot drift. `adminOnly` rides
along, so `onboard_teammate` stays hidden from members in both places.
**Applies to:** `promptAsTool` and `allTools` in `src/lib/mcp/tools.ts`.

## 2026-08-17 — Standing rules go in the briefing, not in search
**Decision:** `Note.kind` (`NOTE | GUARDRAIL`), and `instructionsFor` is now async and appends
every guardrail under a "THIS PERSON'S STANDING RULES" heading, capped at 4KB with a warning
logged if anything is dropped.
**Why:** "never invent experience, employers, dates or metrics" does not catch the failure that
actually happens. Tailoring to a posting quietly *upgrades* facts — a distribution credit
becomes a hire, an unsettled follower count becomes a cited one — and none of it reads as
invention to whoever is drafting, because every upgrade maps to a stated responsibility. Those
rules were already in the system as notes, and notes are only found if a search happens to hit
their words; nobody searches "follower count" before writing a scope bullet. `initialize` runs
once per session in every client before any tool call, which makes it the only place a
constraint is guaranteed to be in context. Truncation is logged rather than silent because
quietly dropping someone's guardrails is the worst thing this code could do.
**Applies to:** `standingRulesFor` in `src/lib/mcp/handler.ts`, `listGuardrails` in
`src/lib/data/brain.ts`, the shield toggle in `src/components/brain/notes-panel.tsx`.

## 2026-08-17 — Seeding: append impact only when it adds something
**Decision:** `buildDocFromBrain` runs each highlight through `bulletFor(text, impact)`, which
appends the impact only when the text doesn't already contain it (compared with punctuation
and case stripped).
**Why:** it appended unconditionally, and a polished highlight almost always states its own
number — people write "Cut infrastructure spend 38%" in `text` and then fill `impact` with the
same thing, so the bullet printed the figure twice. Six of eight bullets came out unusable on a
real first run, and seeding is the first thing a new user touches. Dropping `impact` from the
render entirely would have been simpler but loses the case where the text is terse and the
impact genuinely adds the number, so the check is a containment test rather than a deletion.
**Applies to:** `bulletFor` in `src/lib/data/resumes.ts`.

## 2026-08-17 — A narrowed-to-nothing patch must still report missing records properly
**Decision:** the empty-patch guards added with `pick()` go through `existingOrThrow`, which
throws `No <thing> with id <id>` instead of falling into `findFirstOrThrow`.
**Why:** found while testing `update_extra` — calling it with an unknown id and no fields
returned a raw Prisma stack trace to the caller instead of the legible error every other path
produces. Same information, wrong audience.
**Applies to:** `existingOrThrow` in `src/lib/data/brain.ts`, and the matching branch in
`updateResume`.
