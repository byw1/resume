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

## 2026-08-17 — Colour has to earn its place
**Decision:** the interface is near-monochrome. One accent (blue) appears in exactly three
roles — the primary button, links, and the selected thing — and the only other hues are
status: green for current, amber for attention, red for overdue or destructive. The ambient
Aurora background, gradient headings, the gradient button variant, the shimmer, the grid
wash, the `ring-highlight` hairline and the accent hover-blooms are all deleted.
**Why:** with a purple accent used decoratively on eyebrows, icons, bullets, company names and
badges, plus a nine-hue rainbow for pipeline stages, nothing on screen could be read as
meaningful — an overdue application in red sat next to a purple sparkle that meant nothing.
This is a tool people work in for an hour at a time; the ground should be quiet so the one
thing that matters can be loud. Type does the hierarchy now: tighter tracking on large sizes,
a hairline border instead of a shadow on every panel, and shadow reserved for things that
genuinely float.
**Applies to:** `src/app/globals.css` is the whole system — change a token there rather than
restyling a component. Before adding a colour anywhere, say what information it carries.

## 2026-08-17 — Pipeline stages are a ramp, not a palette
**Decision:** `STAGE_TONE` is a monochrome scale that darkens (lightens, in dark mode) as an
application advances, with hue only at the ends: accent for OFFER, green for ACCEPTED, red
for REJECTED. The values are CSS variables rather than literals.
**Why:** stage is a position on one path, so weight reads as progress in a way that nine
arbitrary hues never did — nobody remembers that teal meant "interviewing". Variables rather
than fixed colours because the old literals were tuned for dark mode and went muddy in light.
**Applies to:** `STAGE_TONE` in `src/lib/data/pipeline.ts`, `--stage-*` in `globals.css`.

## 2026-08-18 — Elevation is a hairline ring plus a soft shadow, and the ring flips in the dark
**Decision:** every raised surface gets `0 0 0 1px <rim>` plus a many-stop shadow, exposed as
six tokens: `shadow-hairline`, `shadow-btn`, `shadow-field`, `shadow-card`, `shadow-raised`,
`shadow-overlay`. In the light theme the rim is a grey hairline. In the dark theme it becomes
`oklch(100% 0 0 / 0.09–0.13)` — a faint *highlight* rather than a darker line. Components ask
for the name of the thing (`shadow-card`) rather than a height number, and a component that
carries a ring no longer also carries a `border`.
**Why:** the previous pass made everything flat with a hairline border, which is correct in
light and invisible in dark — a dark border on a dark surface has nowhere to go, so the dark
theme read as one flat wall with text on it. Real objects are lit from above: their top edge
catches light. Flipping the ring to a highlight is one line and it is most of the reason the
dark theme now reads as cards. The many small shadow stops (six at 2–4% rather than two at
10%) matter too: a few big stops read as a slide-deck drop shadow, many small ones read as
light falling off an edge.
**Applies to:** `--rim` and the `--shadow-*` tokens in `globals.css`. Never hand-roll a
`box-shadow` at a call site, and never put `border` on something that already has a ring —
the doubled hairline is what makes an edge look muddy.
**Where it came from:** beautifului.dev, which the whole material layer here is modelled on.
Its catalogue is mostly chat-agent primitives that this product deliberately doesn't need —
the conversation lives in Claude, not in a panel in the app — but its material system is
better than what we had and cost nothing to adopt.

## 2026-08-18 — Four surfaces and three inks
**Decision:** the surface stack is `--background` (page) → `--canvas` (a recessed working area,
e.g. a pipeline column) → `--card` → `--popover`, plus `--inset` for wells and fields. Ink is
`--foreground` → `--muted-foreground` → `--faint`. Status hues each carry a `*-tint` token for
the wash behind a chip.
**Why:** two surfaces and two inks isn't enough vocabulary for a dense screen, so every
component was inventing its own — `bg-muted/25` here, `bg-[var(--success)]/12` there, and each
one wrong in one of the two themes. Fields in particular were raised (`shadow-xs`) when a
field is a hole you put something into; they're inset now. And the tints have to be tokens
because the correct wash differs by theme: a pale colour on white, low-alpha hue on dark.
**Applies to:** `globals.css`. `bg-canvas`, `bg-inset`, `text-faint`, `bg-success-tint` and
friends are real utilities — use them instead of an opacity modifier at the call site.

## 2026-08-18 — The pipeline gets three views; the board stays the default
**Decision:** `/applications` takes a `?view=` of `board` (default), `list` or `calendar`. The
view lives in the URL, not in component state, so all three stay server-rendered and a link to
the calendar is a link to the calendar. List sorts in JS on the server; calendar takes a
`?month=YYYY-MM` and renders a Monday-first grid of the whole visible window.
**Why:** a board answers "where is everything", badly answers "what do I chase first", and
cannot answer "what does next week look like" at all. Those are the two questions the daily
loop actually asks. The board stays default because drag-to-move is the reason it exists.
Sorting in JS rather than SQL because the useful default — soonest follow-up first, then
everything with no date — is not an ordering Postgres gives for free, and this is one person's
pipeline: tens of rows.
**Applies to:** `src/components/pipeline/{view-switcher,list,calendar}.tsx`. The calendar is
deliberately read-only — no dragging, no click-to-create. Dates here are set by the work
(moving a stage schedules the follow-up), so a second place to edit them would be a second
source of truth.

## 2026-08-18 — listSchedule merges the three tables that carry dates
**Decision:** `listSchedule(userId, from, to)` returns follow-ups, task due dates and logged
activity in one list sorted by date, each tagged with its kind. Exposed as `list_schedule`.
**Why:** the calendar needed it, but the rule is that a screen may not be able to answer a
question the conversation can't. "What does my week look like" was previously unanswerable —
`list_follow_ups` only knows about overdue, `list_tasks` ignores dates. Merging in the data
layer rather than in the calendar component is what makes both surfaces agree.
**Applies to:** `src/lib/data/pipeline.ts`. The tool's `to` is pushed to the end of that day
in `tools.ts` — a bare `YYYY-MM-DD` parses as midnight, so an inclusive end date would
otherwise silently drop everything that happened on it.

## 2026-08-18 — A thumbnail measures its container
**Decision:** `PaperThumb` renders the page at its true 816px and scales it with a factor
measured by a ResizeObserver, rather than a hardcoded `scale(0.29)`.
**Why:** the resume grid is responsive, so one fixed scale fits exactly one breakpoint. At
every other the document sat stranded to one side of a white card. CSS cannot do this — `calc`
cannot divide a length by a length — so the measuring is the one bit of client work; the
document itself still renders on the server and comes in as a slot.
**Applies to:** `src/components/resume/paper-thumb.tsx`.

## 2026-08-18 — Stages are a rotation, not a ramp (supersedes the monochrome decision)
**Decision:** each stage gets a hue, and the hue turns one direction along the path —
grey wishlist, steel applied, blue screening, violet interviewing, pink final, gold offer.
The three endings step outside the rotation because they mean something other than
progress: green accepted, red rejected, grey withdrawn. Every surface that shows a stage
uses the same token through one `.stage-chip` utility, and list rows carry the same colour
at 5% as a band.
**Why:** William asked for it, and the monochrome ramp I logged on 2026-08-17 was one step
too austere — a board where every column header is the same grey makes you read labels
instead of seeing shape. The rotation keeps what the ramp was protecting: because the hue
only ever turns one way, two chips still tell you which is further along without anyone
memorising that violet means interviewing. That is the property a nine-hue palette lost.
**Applies to:** `--stage-*` in `globals.css`, `STAGE_TONE` in `pipeline.ts`, and the
`.stage-chip` / `.stage-band` utilities. The rule from before still holds — before adding a
colour, say what information it carries. Here it carries position on the path.

## 2026-08-18 — Company logos, and the beacon that comes with them
**Decision:** the pipeline shows each company's favicon from twenty-icons.com, with a
tinted monogram of the initials underneath it that is always drawn and never replaced. An
admin switch turns the whole thing off; when it is off no domain is even sent to the
browser, so there is nothing for it to fetch. `admin_set_company_logos` makes that
switchable from a conversation, and `admin_instance_stats` reports the current state.
**Why:** logos make a list of companies scannable in a way text never is. The cost is that
a third party learns which companies are in someone's pipeline, which for a job search is
close to the most sensitive thing in the app — so it is stated plainly in the admin panel
rather than buried, `no-referrer` keeps our URLs out of it, and it is one click to stop.
**Applies to:** `src/lib/company.ts`, `src/components/pipeline/company-avatar.tsx`.

## 2026-08-18 — Domains are guessed, and the guess is allowed to be wrong
**Decision:** `companyDomain()` tries the company's `website`, then the posting URL —
unwrapping Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Workday slugs, and
ignoring LinkedIn and the other aggregators — and finally the company name as `name.com`.
`create_application` and `update_application` now take `companyWebsite` so an assistant can
just say it.
**Why:** nobody types a company's domain into a job tracker, so without inference the
feature would show initials forever. Guessing is safe here because the failure is
invisible: a wrong domain 404s and the monogram was already on screen.
**Applies to:** `src/lib/company.ts`.

## 2026-08-18 — An image that is already loaded fires no events
**Decision:** `CompanyAvatar` settles its state from the element (`img.complete` plus
`naturalWidth`) via a ref, not only from `onLoad`/`onError`.
**Why:** a cached image finishes before React attaches its handlers, so neither event ever
fires and the logo stays invisible — on every visit after the first, which is every visit
that matters. Found because the stubbed test served bytes instantly and reproduced exactly
that. The same three-state handling is why a request that hangs shows initials rather than
a white square.
**Applies to:** `src/components/pipeline/company-avatar.tsx`. Any image with a fallback
needs this; the two-state version passes a first-load test and fails in production.

## 2026-08-18 — The rail carries navigation, the top bar carries identity
**Decision:** search moved to the top of the sidebar (above the nav, below the brand), the
name/email block moved out of the sidebar footer into a profile menu at the top right
(Settings, Admin when you have it, Sign out), and the light/dark switch moved out of the
header into an Appearance card in Settings. The rail collapses to icons with a toggle in
the brand row, remembered in `localStorage` under `resume-os:sidebar-collapsed`.
**Why:** the header held two unlabelled icons that each did something permanent-feeling
(theme, sign out) and the sidebar footer held identity with nothing to click. Grouping
every account action behind one avatar makes the sign-out deliberate rather than a
mis-click, and frees the rail to be only navigation. Theme is a preference, and
preferences live in Settings.
**Applies to:** `src/components/shell.tsx`,
`src/components/settings/appearance-panel.tsx`. Collapse state is read in an effect, not
during render — reading `localStorage` while rendering would hydrate-mismatch. Follow-on:
Settings and Admin left the rail entirely, since a link that is also in the profile menu
is a second door to the same room. The rail is four destinations and nothing else. When
collapsed, the expand control replaces the `R` mark on hover rather than taking a row of
its own — a rail that is 4.5rem wide cannot spend vertical space on chrome.
during render — reading `localStorage` while rendering would hydrate-mismatch.
## 2026-08-18 — The pipeline gets its own rail
**Decision:** `/applications` has a second rail between the app nav and the content, holding
Views (Board / List / Calendar) and Filter (Everything, Needs a nudge, each stage with its
count, Closed). One filter at a time, carried in `?f=`, and it survives a view change. The
old top-right segmented switcher is gone.
**Why:** the app nav answers "which part of the product"; the rail answers "which cut of this
part". Those are different questions and they should never share a control — which is the
split every CRM makes between its object list and its saved views. The counts are the real
payload: "Needs a nudge 2" answers the daily question before you have clicked anything.
**Applies to:** `src/components/pipeline/rail.tsx`. Filtering to one stage draws one column
rather than five empty ones beside it, and filtering to Closed draws no columns at all,
because closed applications live under the board rather than in it — see the `columns` prop
on `PipelineBoard`. Nothing here needed a new tool: `list_applications` already filters by
stage and `list_follow_ups` already answers the overdue question.

## 2026-08-18 — Test fixtures have to be the suite's own
**Decision:** `avatar-test.mjs` seeds the companies it reasons about and restores the
instance setting it flips; `rail-test.mjs` asserts relationships — the rail says Screening is
3, so the Screening list must have 3 rows — instead of fixed numbers.
**Why:** this is the fourth time in this repo that a green suite went red with no regression
behind it, because it was reading state another suite left behind. A suite that flips an
instance-wide setting and does not put it back passes exactly once. Relational assertions
also test something stronger than a magic number: that the count in the rail is not a lie.
**Applies to:** anything new under `scratchpad/*.mjs`. Seed what you assert on, restore what
you mutate, and prefer "these two numbers agree" over "this number is 8".

## 2026-08-18 — Companies and contacts are records, not rows on an application
**Decision:** a CRM area with its own nav entry and two halves — `/crm/companies` and
`/crm/contacts` — each a searchable records table over a detail page. Eight new tools
(`list_companies`, `get_company`, `create_company`, `update_company`, `delete_company`,
`get_contact`, `update_contact`, `delete_contact`) so every one of those screens was
reachable from a conversation before it had a screen.
**Why:** a company used to be a name hanging off an application, which is fine right up to
the moment you want to keep what you learned about them — the loop, who you know there, why
you want it — and there is nowhere to put it. That research is worth more than the
application it started from, because it survives the rejection.
**Applies to:** `src/lib/data/pipeline.ts` and `src/app/(app)/crm/`. Deleting a company
refuses while applications point at it rather than cascading: tidying a company record must
never take an application with it. Contacts survive and lose their employer, which is the
correct shape for someone who changed jobs.

## 2026-08-18 — The logo comes from the company's own website, and nothing else
**Decision:** `companyDomain()` reads `Company.website`, then falls back to the name as a
domain. The Greenhouse / Lever / Ashby / Workday URL-unwrapping is deleted.
**Why:** William caught this — job listings live on boards, so a posting URL tells you where
someone advertises, not who they are. The clever ATS unwrapping was right often enough to
look like it worked and wrong in a way that showed the board's logo on half the pipeline.
One field, set on the company page or by `update_company`, and it is obvious where to fix it
when it is wrong.
**Applies to:** `src/lib/company.ts`.

## 2026-08-18 — Controls on top, records in a panel
**Decision:** the pipeline's views, filters and search sit in a horizontal toolbar above the
board, not in a rail beside it. Opening an application slides it in from the right over the
board; `/applications/[id]` stays a real page for permalinks, and cmd-click still opens one.
**Why:** two corrections in one. A rail took 216px out of the widest screen in the product to
hold nine links, and the board is the thing that needs the width. And replacing the whole page
to glance at a card meant losing your place on the board every single time — the board is what
you are working *from*, so the detail belongs over it rather than instead of it.
**Applies to:** `src/components/pipeline/toolbar.tsx` and `application-panel.tsx`. The panel
fetches on open rather than shipping every job description to the browser with the board.

## 2026-08-18 — A "use client" file's exports cannot be called from the server
**Decision:** `parseSort` and `sortRows` live in `src/lib/pipeline-list.ts`, not in the
component that uses them.
**Why:** adding `"use client"` to `list.tsx` so a row could open the panel silently turned two
pure functions into client exports, and the server page calls both. TypeScript is happy, the
build is happy, and the list view 500s at runtime. Same shape as the `resume-text.ts` split:
when a component becomes a client component, its pure helpers have to move out first.
**Applies to:** anywhere a server page imports from a component file. If the page calls it,
it does not live behind `"use client"`.

## 2026-08-18 — The tool reference is generated, never written
**Decision:** `/docs` builds its tool and workflow reference from `toolsFor(user)` and
`promptsFor(user)` at request time, grouped into the four areas by name. Anything that
matches no area is listed under "Everything else" rather than dropped.
**Why:** a hand-maintained list of 76 tools is wrong within a week, and wrong here is worse
than absent — this is the page someone reads to decide what to ask for. It is also
role-aware for free: a member's docs page does not mention the admin tools, which matches
what their client actually sees in `tools/list`. The test asserts the page and the live
server agree in both directions, so an undocumented tool fails the build's verification
rather than shipping quietly.
**Applies to:** `src/app/(app)/docs/page.tsx`. When you add a tool, add its name to the
right area's matcher — or don't, and it still appears, just in the wrong place.

## 2026-08-18 — Skills are files, read from disk
**Decision:** the three Claude Skills live at `skills/<name>/SKILL.md` in the repository.
The docs page reads them at request time, shows them raw, and serves them from an
auth-gated route that returns the file byte for byte.
**Why:** the thing being handed over *is* the markdown, front matter included — a
prettified preview would look better and be the wrong bytes. Reading from disk rather than
pasting into a constant means the copy someone downloads is the copy in the repository; a
skill duplicated into source is a skill that drifts from the one people have installed.
The test compares the download against the file on disk for exactly that reason.
**Applies to:** `skills/`, `src/lib/skills.ts`. Ordering is explicit — orientation first,
because the task skills read as if you have seen it.

## 2026-08-18 — Three skills, and the first one is about honesty
**Decision:** `resume-os` (orientation, the four areas, replace-vs-append, the rules),
`tailor-a-resume` (the craft), `run-the-search` (the daily and weekly loop).
**Why:** the orientation skill exists to carry one paragraph: the failure mode is not
fabrication from nothing, it is quiet upgrading while tailoring — a distribution credit
becomes a hire, "helped with" becomes "led" — and every upgrade maps neatly onto a stated
requirement, so it does not feel like invention to whoever is drafting. That is the same
argument as the guardrails feature, and it needs to be in front of an assistant before the
first tool call rather than looked up after the mistake.
**Applies to:** `skills/`. If a rule matters, it goes in the orientation skill *and* the
tool description *and* `instructionsFor` — a rule stated once is a rule that is absent when
the client only reads one of the three.

## 2026-08-18 — Diagnose the funnel, don't display it
**Decision:** `diagnoseSearch` computes per-step conversion, median days in stage, weekly
volume, stalled applications and per-resume response rate — and then says one sentence about
which step is losing people. The dashboard card leads with that sentence and puts the rates
underneath.
**Why:** six numbers with no reading is what every job tracker already shows, and the reading
*is* the work. "You're getting responses but not past the screen" is a different week from
"nothing is coming back at all", and a person staring at a funnel chart will not reliably tell
those apart. This is also the honest answer to "should I send more applications" — sometimes
the answer is no, stop, the resume is the problem.
**Applies to:** `diagnoseSearch` and `verdict()` in `src/lib/data/pipeline.ts`. Two rules held
firmly: under ten applications it refuses to diagnose and says so, because a verdict from four
data points is a guess wearing a lab coat; and the thresholds are stated as this tool's own
rules of thumb rather than dressed up as industry benchmarks we cannot source.

## 2026-08-18 — Progress is the furthest stage ever reached
**Decision:** conversion is computed from how far each application *ever* got, reconstructed
from the transition log, not from where it sits now.
**Why:** otherwise every rejection looks like it failed at the first hurdle. A rejection after
a final round and a rejection after applying are opposite signals, and collapsing them makes
the whole funnel lie in the most flattering direction — you would always conclude the top of
the funnel was broken.
**Applies to:** the `furthest` map in `diagnoseSearch`. `ACCEPTED` counts as having reached
`OFFER` whatever the row says now.

## 2026-08-18 — A note used to destroy the stage transition
**Decision:** `Activity.fromStage` / `toStage`, set on every move, backfilled from the
generated body where it survives.
**Why:** I told William this feature needed no schema change and I was wrong. The transition
was only ever recorded as the string `"Applied → Screening"` in the activity body — and
`moveApplicationStage(…, note)` replaces that body wholesale, while `stageActivityType`
collapses Screening, Interviewing, Final and Withdrawn into one `STAGE_CHANGE`. So every
stage move made with a note was invisible to the funnel. Two nullable columns, and the
diagnosis is trustworthy instead of inferred.
**Applies to:** anything reading stage history. Read `toStage`, never parse the body — the
backfill leaves nulls where a note had already destroyed the evidence, which is correct: we
genuinely do not know, and guessing would be worse than a gap.

## 2026-08-19 — The favicon service only serves six sizes

**Decision:** `logoUrl` snaps the requested pixel size up to the nearest size
twenty-icons.com actually serves (16, 32, 64, 128, 180, 192) instead of passing
through whatever the caller asked for.
**Why:** it does not serve arbitrary sizes — anything else is a 400 with the body
"Invalid size". Every avatar in the app asked for double its rendered size (48,
52, 88), so every single request was a 400 and no favicon had ever loaded
anywhere, in the pipeline or the CRM. The failure was invisible because a missing
logo is indistinguishable from a company that has none: the monogram is drawn
underneath and looks deliberate either way, which is the right fallback and also
the reason this survived two rounds of looking at it.
**What I gave up:** exact-size images. Rounding up means a 26px avatar downloads a
64px icon, which is a few hundred wasted bytes and a sharper result. Rounding down
would have been the cheaper wrong answer.
**Where it belongs:** in `logoUrl`, not at the call sites. The service's size list
is a fact about the service, and the UI should keep picking sizes from the layout.

## 2026-08-19 — The failed Railway deploy was not the code

**Decision:** treated deployment 31191df4 (commit d2b7451) as an infrastructure
failure and redeployed rather than reverting or bisecting.
**Why:** the build stage succeeded end to end — types checked, all five static
pages generated, the full route table printed, image pushed at 566MB. What failed
was the deploy stage, and both its log streams came back completely empty, as did
the HTTP stream, so nothing ever served a request. The build was also scheduled 40
minutes after the deployment was created, which is queue time, not build time. The
same commit boots locally against a real Postgres in under a second and answers
the healthcheck path with a 200, and all eight migrations apply clean to an empty
database in order.
**Worth remembering:** "build failed" in the Railway UI can mean the deploy failed.
The distinction matters because it changes what you go looking for, and because
production keeps serving the previous commit either way — which is why the app
looked alive while the new work was missing from it.

## 2026-08-19 — Resume OS becomes Hired

**Decision:** renamed the product to Hired (hired.tools) in one pass — mark, wordmark,
metadata, MCP server identity, client setup recipes, the three Skills, README, boot banner,
package name. MCP *tool* names were deliberately left alone.
**Why the tool names stayed:** they are an API. An assistant's saved config, and any habit a
client has formed, keys off `search_brain` and `create_resume`. None of them carried the old
brand anyway, so renaming would have been churn with a breakage risk and no upside. The
server identity and the setup alias did carry it, and those are safe to change: a client
stores the URL and token, not the server's name.
**What I gave up:** the skill at `skills/resume-os/` moved to `skills/hired/`, so its
download URL changed. Anyone who already installed it keeps their copy; only a fresh
download uses the new path.

## 2026-08-19 — The session cookie renamed without signing anyone out

**Decision:** `resume_os_session` became `hired_session`, and the read path checks the old
name as a fallback. There is a dated note saying the fallback can be deleted after 30 days.
**Why:** sessions are rows in the database keyed by token, not by cookie name, so reading
either name resolves the same session. Without the fallback, the deploy that renamed the
cookie would have silently signed out every person on the instance — an alarming thing to
happen on a day when the logo also changed, and impossible to tell apart from a bug.
**The alternative I rejected:** leaving the cookie named `resume_os_session` forever. It is
invisible to users, but it is a stale brand string sitting in the auth path, and the next
person to read that file would have to work out whether it was load-bearing.

## 2026-08-19 — The mark is three bars, not a letter

**Decision:** the mark is three stacked bars of increasing length, monochrome, cut out of
`--foreground` so it inverts with the theme. No letter, no gradient, no brand hue.
**Why no letter:** a lettered square is what everything in this category looks like, and it
ties the mark to the name — this one survives another rename. **Why no colour:** twelve hues
are already load-bearing (nine stages, three statuses). A thirteenth would either read as a
stage or shout over one. The brand colour is the existing `--primary` blue and nothing else.
**The one exception:** the stage rotation is allowed as a marketing motif, scoped to a
`.marketing` class so it cannot reach app chrome. Inside the product a stage hue means a
stage, everywhere.

## 2026-08-19 — Inter was declared for months and never loaded

**Decision:** load Inter and JetBrains Mono through `next/font`, and point `--font-sans` and
`--font-mono` at them.
**Why it matters:** `--font-sans` named `"Inter var", Inter` and nothing ever fetched it, so
every screen was rendering in whatever the system happened to have. The type scale in this
repo — 10.5px eyebrows, 12.5px rows, 26px stat numbers — was tuned against Inter's metrics,
so loading it is a correction, not a restyle.
**The resume renderer is deliberately excluded.** It keeps its own `.font-serif-resume` and
`.font-mono-resume` stacks, which name real system faces and reference none of the new
variables. The README promises that no webfont is fetched for a resume and that the output
is metrically identical across platforms; that promise survives.

## 2026-08-24 — AGPLv3, because the business is hosting

**Decision:** relicensed from MIT to AGPLv3 (LICENSE, package.json). The full text comes
from SPDX verbatim.
**Why:** the plan is Twenty's plan — free to self-host, paid to be hosted — and every
project running that model at any scale chose AGPL for the same documented reason:
Plausible started MIT, watched a company close-source their code and sell it against them,
and switched. AGPL changes nothing for a self-hoster and requires a commercial host who
modifies the code to publish their modifications. MIT was the friendlier portfolio signal;
the portfolio argument lost to the business argument because the license is also part of
the story now.
**Reversibility:** as sole author William can relicense future versions any direction;
released versions stay as released.

## 2026-08-24 — Paid hosting is one shared instance, not instance-per-customer

**Decision:** the hosted product is William's single instance with paying members, driven
by four Stripe objects he creates by hand in the Dashboard (product, price, payment link,
webhook) and three values pasted into Admin → Billing. No provisioning code.
**Why:** the codebase was already multi-user with compile-level tenant isolation, invites,
roles, and a suspension that kills sessions and MCP access — the entire per-customer
lifecycle existed; only payment was missing. Instance-per-customer means being an ops team.
Every comparable project (Cal.com, Plausible, Documenso, Rallly) runs shared multi-tenant
below enterprise price points.
**How sync works, and why it looks like the MCP transport:** the webhook never trusts an
event beyond the customer id — it re-fetches the customer's subscriptions from Stripe and
converges local state to that answer (Documenso's pattern). Late, duplicate and out-of-order
deliveries all land on the same state. `past_due` still counts as entitled: Stripe's retry
window is the grace period. Suspension keeps all data; paying again reactivates the same
workspace. The owner is structurally untouchable by billing, and `admin_sync_billing` is
the missed-webhook recovery. No Stripe SDK — it is three GETs and an HMAC, in the same
raw-fetch style as the Resend client.
**The checkout→invite gap:** a payer who isn't a user yet gets an invite that CARRIES the
Stripe customer id, and acceptInvite copies it onto the new User. Without that, a person
who paid and accepted between webhooks would be invisible to billing forever.

## 2026-08-24 — Docker is the self-host front door; Railway keeps Nixpacks

**Decision:** the Dockerfile is back (recovered from da8780d, which was proven to build),
plus docker-compose.yml with zero required configuration, plus a GitHub Action publishing
ghcr.io/byw1/hired on every push. railway.json still pins NIXPACKS, so William's own
production deploy is untouched by all of it.
**Why compose over Twenty's four containers:** Twenty needs server+worker+postgres+redis
and three required env vars. Hired needs app+postgres and zero — the compose file
hardcodes an internal DATABASE_URL on a private network, which beats the reference product
at its own quickstart. The old blocker ("a ten-minute job with a daemon") was real: with a
daemon available, the image built first try and the full stack came up healthy.
**What the image fixes that Railway can't:** PDF export. Chromium and the Times-metric
fonts ride in the image, so a compose self-hoster gets one-click PDF on first boot.
**Verification honesty:** the local build injects proxy-CA trust lines generated FROM the
shipped Dockerfile (never a parallel copy); the shipped file itself is verified by the
GitHub Action on clean egress.

## 2026-08-24 — hired.tools is a static page in site/, deployed by Pages

**Decision:** the landing page is one static HTML file in site/, published to GitHub Pages
by a workflow, with hired.tools as the CNAME. The app stays at the root of every instance;
William's instance will live at app.hired.tools. No route moves, no links break.
**Why:** Twenty splits marketing (twenty.com) from app (app.twenty.com) and keeps the
website in the product repo. The alternative — moving the app to /app to make room for
marketing at the instance root — would put a personal marketing page inside every
self-hoster's deployment, which is exactly backwards. The landing page belongs to the
project, not to each instance.
**What it borrows from the teardown:** open source as positioning not CTA, a live star
count as the one dynamic number, a DOM-built product mock instead of screenshots (the
transcript IS the product thesis), one primary CTA repeated, and no pricing table — the
hosted door states its terms in a sentence. The transcript only shows tools that exist.

## 2026-08-24 — Billing may create accounts, never claim them

**Decision:** the webhook never attaches a Stripe customer to an existing member. A
checkout from an unknown email still becomes an invite (safe: only the holder of that
inbox can accept it, and the invite carries the customer id). A checkout whose email
matches an existing member does nothing, and connecting that member to their subscription
is a deliberate admin act — `admin_link_billing`, which finds the customer in Stripe's own
records for that email and refuses ambiguity. Unlink is the recovery hatch and ends
billing's authority over the account. A pending invite the owner already sent is never
stamped with a customer id either — a free invitation must not silently become a billed one.
**Why:** the tenant audit caught the hole before it shipped. The first version matched
existing members by the checkout email — which is typed by the payer, not verified —
so anyone holding the public payment link could bind a member's account to their own
subscription and then suspend that member by cancelling it, with no admin surface to undo
the link. The rule that fixes it is worth stating as a rule because it generalises: an
unattended webhook may only ever touch state it created or state explicitly delegated to
it, and identity claims inside webhook payloads are attacker-controlled input.

## 2026-08-24 — The Dockerfile lives in docker/, and the placement is the fix

**Decision:** moved Dockerfile to docker/Dockerfile; compose and the GHCR workflow point
at it explicitly.
**Why:** the moment a Dockerfile existed at the repo root, Railway used it — despite
railway.json saying NIXPACKS and the service settings saying RAILPACK — and the deploy
died on the same healthcheck-never-sees-it-listen failure as on Aug 17. That's now been
observed twice and diagnosed zero times, and it doesn't need to be: Railway was never the
audience for this image. Auto-detection can't find a file that isn't at the root, so the
builder question is closed structurally rather than by configuration that has already
lost an argument with auto-detection once.
**Cost:** anyone hand-building must say `-f docker/Dockerfile` (compose and CI already
do). Production kept serving the previous commit throughout — a failed deploy never
replaces a running one.

## 2026-08-25 — The repo moved to the shifulaboratories org

**Decision (William's):** byw1/resume became shifulaboratories/resume. Every hardcoded
reference followed in one commit: the GHCR image is now ghcr.io/shifulaboratories/hired,
the landing page's links and live star count, the README's self-host curl, and the compose
file's image. The Pages address for the www record is shifulaboratories.github.io.
**Why the sweep couldn't wait:** GitHub forwards old repo URLs after a transfer, but the
forwarding dies the moment anyone creates a new repo named byw1/resume — a squat on the
old name would silently take over the self-host quickstart and the star count. Links that
matter don't get to depend on a redirect.
**Watch for:** Railway's GitHub connection was made to the repo under byw1; if pushes stop
auto-deploying, the GitHub app needs installing on the org and the service re-linking.

## 2026-08-26 — The landing page shows the app instead of describing it

**Decision:** hired.tools is rebuilt as `site/index.html` + `site/styles.css` + `site/motion.js`
+ `site/media/`, still static, still deployed to Pages by the same workflow. The page is a
guided tour of real screens: the dashboard, a role in the brain, the resume editor, the
pipeline board and the companies table are all rebuilt in HTML using the product's own
tokens, inside a browser frame, and the whole drawing is laid out at a 1440px logical width
and then `transform: scale()`d to fit its column.
**Why the scaler matters more than it looks:** a mock that reflows into a 900px column stops
being a picture of the app — the type goes large relative to the chrome, columns disappear,
and the reader is looking at a diagram. Scaling one object keeps every proportion the app
actually has. `motion.js` sets the factor from one ResizeObserver and gives the host the
scaled height; below a 0.72 floor it stops shrinking and lets the frame pan sideways, because
past that the app's 12.5px rows are a smudge and a phone cannot honestly do better.
**Why three files instead of one:** the previous page was one file and that was right at 345
lines. At ~1,900 it is not. The deploy is unchanged — the workflow uploads the whole folder.
**Applies to:** `site/`, `.github/workflows/site.yml` (unchanged, still uploads `site/`).

## 2026-08-26 — The signature moment is the assistant refusing

**Decision:** the "Nothing invented" section leads with a transcript where the assistant is
asked to add a team it cannot evidence, `search_brain` returns nothing, and it says no —
with the literal instructions block from `handler.ts` and the user's own guardrails printed
underneath it. It is the only tool chip on the page whose dot goes amber instead of green.
**Why:** every AI product on the internet is demoed saying yes. The property being sold here
is that this one says no, and the mechanism — a briefing sent on connect, plus notes the user
wrote once — is visible in the same frame. A judged panel of three landing-page directions
independently nominated this as the strongest thing available, over anything about features.
**What it cost:** the hero transcript went back to two exchanges. Two scripted refusals on one
page is repetition dressed as evidence.
**Applies to:** `site/index.html` `#honest`.

## 2026-08-26 — Every product picture is a rebuild first and a screenshot slot second

**Decision:** six named slots (`hero-resume`, `brain-role`, `resume-editor`, `pipeline-board`,
`crm-companies`, `dashboard-diagnosis`) plus a video slot (`demo`). Each renders a real HTML
rebuild by default; `motion.js` probes `media/<slot>.png` (or `.mp4`) on load and swaps it in
only if it loads. `?slots` on the URL outlines every slot and prints its filename.
**Why:** an empty `media/` folder is a finished page rather than a page of grey boxes, adding
art is dropping a file in with no markup to edit, and a rebuild never goes stale against a
screenshot taken three releases ago. `site/media/README.md` carries the shot list, the sizes
and the capture rules.
**Applies to:** `site/motion.js`, `site/media/`.

## 2026-08-26 — Counts on the page are generated from tools.ts, not remembered

**Decision:** the catalogue's 64 cards are the real member-visible surface — 58 tools plus 6
prompts — each carrying the first sentence of its actual description, extracted from
`src/lib/mcp/tools.ts`. The page states 64 for a member and 81 for an admin.
**Why:** the numbers were already drifting (README and the old page both said 64, which is
right; "sixteen admin tools" is not — it is sixteen tools *and* one admin-only prompt, so an
admin sees seventeen more). Anything counted on a marketing page should be counted from the
source at the time it is written, and re-counted whenever a tool is added.
**Watch for:** adding or removing a tool means regenerating the catalogue and the three places
the totals appear — the hero fact line, the figures row and the `#tools` heading.

## 2026-08-27 — The repo became shifulaboratories/Hired, and the links followed again

**Decision:** every hardcoded `shifulaboratories/resume` URL is now
`shifulaboratories/Hired` — the landing page's ten links, the star-count fetch in
`site/motion.js`, and the README's self-host `curl`. The git remote moved with them. The
GHCR image did not: `docker.yml` writes `ghcr.io/shifulaboratories/hired` literally rather
than deriving it from the repo name, so the published image and `docker-compose.yml` are
untouched.
**Why immediately, again:** this is the second rename, and the reasoning from the first one
holds without modification — GitHub forwards the old paths, and the forward dies the day
anyone creates a repo at the old name. A squat on `shifulaboratories/resume` would silently
take over the self-host quickstart and the star count. Links that matter don't get to
depend on a redirect.
**Verified:** `raw.githubusercontent.com/shifulaboratories/Hired/main/docker-compose.yml`
returns 200; the old path still 301s, which is exactly the redirect being removed from the
critical path rather than relied on.
**Note:** the entry above this one is left as written. It records what was true in August,
and rewriting a decision log to match the present makes it useless as a record.

## 2026-08-27 — Every inline icon carries its own size

**Decision:** all 81 `<svg>` elements in `site/index.html` now have explicit `width` and
`height` attributes, and an inline `<style>` in the head sets `svg:not([width])` to `1em`
as a floor for anything added later.
**Why:** an `<svg>` with only a `viewBox` has no intrinsic size, so the moment the
stylesheet is late, blocked or missing it falls back to the SVG default of 300×150. On this
page that was 57 icons at once: the document went from 14,000px tall to 83,000px and the
first thing on screen was a full-viewport blue arrow. Reported from the live site, and
reproduced exactly by aborting the request for `styles.css`.
**What it does not fix:** the page still needs `styles.css` to look like anything. The point
is only that its absence now degrades to a plain readable document instead of a screenful
of giant arrows — a stylesheet that is slow is a worse failure than one that never arrives,
because the giant state is what the visitor sees first either way.
**How the sizes were set:** measured from the rendered page with the stylesheet applied and
written back as attributes, so an attribute can never disagree with the CSS rule that
styles it.
**Applies to:** `site/index.html`. Any new inline SVG needs `width` and `height` on the tag,
not only a CSS rule.

## 2026-08-27 — The page is light; the product inside it stays dark

**Decision (William's):** hired.tools is now the app's **light** palette, lifted verbatim from
the `:root` block of `globals.css`. The product mocks are not: `.frame` and the diagnosis
card carry `.app-dark`, which redeclares the same tokens with the dark values, so every
rail, card, chip, bar and table inside them flips without any component knowing which theme
it is in.
**Why the split:** the app's own `ThemeProvider` has `defaultTheme="dark"`, so dark is what
a person actually sees when they open it — a light mock would be a picture of a state most
users never choose. It also keeps `site/media/README.md` honest: a real screenshot is still
captured in dark mode and still lands on top of a mock that agrees with it.
**What the flip actually cost:** the token swap was the easy half. The hard half was 17
places that had `oklch(1 0 0 / …)` written inline — hover washes, hover rims, window-chrome
dots, the rail surface, the hero grid — every one of which is invisible on a light ground.
Those are now `--wash`, `--rim-strong`, `--dot`, `--grid-line` and `--rail-bg`, declared
once per theme. **If you add a hover state, use the token; a literal white overlay only
works on one of the two grounds this page now has.**
**The mark:** `--brand-tile: var(--foreground)` and `--brand-cut: var(--background)`, so the
tile is the ink of whatever surface it sits on and the three bars are cut out of it. That is
why the same markup reads correctly in the light nav and inside a dark frame. Both carry a
literal fallback in the `fill` attribute, because `var()` with no fallback resolves to black
and the no-stylesheet state would otherwise be a solid black square.
**Also flipped:** `og.png` and its source, and the `theme-color` meta.
**Applies to:** `site/styles.css`, `site/index.html`, `site/media/og-source.html`.

## 2026-08-27 — Everything light, mocks included

**Decision (William's):** the split from earlier today is reverted. The product frames and
the diagnosis card no longer carry `.app-dark`; the whole page, screenshots and app UI
included, is the light theme. The `.app-dark` scope is deleted rather than left unused —
git has it if the split is ever wanted back.
**Why the split didn't survive:** it was my call, not a requirement, and the argument for it
(dark is the app's default, so a picture of it should be dark) lost to the simpler one — a
page asked to be light should be light all the way down, and a reader should not have to
work out why two surfaces on one page disagree.
**The one token the app doesn't have:** `--page`, a step deeper than `--background`. The
app's own background is near-white, so a frame containing it had nothing to sit on and the
window edge disappeared into the page. `--page` is the page ground only — `body`, the stuck
nav and the tour's chapter bar. Everything inside a frame still uses `--background`, so the
mock is the app's real colour and the separation comes from the page, not from faking the
app.
**Consequence for captures:** `site/media/README.md` now says shoot in **light** mode, and
says the part people forget — Hired defaults to dark, so its theme has to be switched
before the screenshot is taken or it will not match the frame it lands in.
**Supersedes:** the entry above it. Left in place as the record of what was tried.

## 2026-08-27 — The footer says who made this

**Decision (William's):** hired.tools carries a Shifu Labs footer, modelled on the one at
viral.bywilliaml.com — brand block, "A Shifu Labs tool" with the studio's mark, the
studio's social set, and the studio's domain, all in the page's own type and light theme.

**What came from where.** The mark is the `viewBox="0 0 96 96"` path from shifulab.com,
inlined into the sprite as `#i-shifu`. The signal orange is `#ff4d00`, the studio's own
accent, added as `--signal` and worn only by that mark — Hired's accent is still the one
blue, and nothing else on the page gained a second colour. The socials are Shifu's
(`linkedin.com/company/shifulabs`, `instagram.com/shifu`, `x.com/shifulab`), not William's
personal ones; the viral footer links the personal set, and copying that would have
credited the wrong account.

**The domain, deliberately not the one asked for.** The brief said `shifulabs.com`. That
host is a GoDaddy parking page — its only outbound link is to GoDaddy's site builder. The
real studio site is `shifulab.com` (singular lab), which is also what viral.bywilliaml.com
links, and whose canonical is `shifulaboratories.com` — currently unreachable, connection
reset, so linking that would be worse. The footer links `shifulab.com` and shows that
string verbatim. If the plural is registered and pointed at the real site later, it is a
one-line change in three places.

**The studio's mark does not spin here.** shifulab.com rotates it continuously
(`spin-slow`). This page's rule is that nothing loops — everything plays once on entry and
holds — and an ambient rotation in the footer would have been the only exception on the
page. The mark turns a quarter on hover instead, which keeps the gesture and costs nothing
when nobody is pointing at it. The large corner mark is static, at 5% opacity, and sits
behind the content on `z-index: -1` — which needs `isolation: isolate` on the footer, the
same trap the hero glow hit: `position: relative` alone does not make a stacking context,
so the mark would have painted behind `body` and vanished.

## 2026-08-26 — An activity belongs to exactly one thing

**Decision:** Activity.applicationId went nullable and contactId arrived, with the data
layer enforcing exactly-one-parent. Not both: an entry lives on one timeline, and a caller
passing both hasn't decided which. Contact deletion cascades its timeline; the funnel
diagnosis filters to application-attached transitions and is unaffected.
**Why this shape and not a Touch table:** contacts needed history and the Activity table
already was one — same fields, same rendering, same schedule integration. A parallel table
would have meant a second timeline component, a second merge in list_schedule, and a
"which table does a call go in" question forever.
**What fell out for free:** last-touched on the contact list, due pings beside due
follow-ups everywhere follow-ups appear (dashboard, calendar, list_follow_ups), and
"ping Sarah in two weeks" as a date on the person. No new tools — log_activity,
update_contact and list_follow_ups grew instead, so the tool count is unchanged and the
descriptions carry the routing.

## 2026-08-26 — The gap report is a prompt, not a server computation

**Decision:** gap_report ships as a workflow prompt (exposed as a tool like the others),
not as a data-layer function. The server cannot judge whether "ran a rollout across three
regions" evidences "experience leading distributed teams" — that reading is the
assistant's job — so the server's contribution is the recipe: extract what the posting
rewards, search the brain for the work rather than the buzzword, sort into
BACKED / THIN / MISSING, and never upgrade an item to be encouraging.
**The loop that matters:** every MISSING item ends in a question, because people forget
their own work constantly — and an answered question goes into the brain via
append_role_brain_dump, where it is evidence for every future posting. The gap report is
secretly the brain's best intake funnel.
**tailor_resume** now ends with the same three-list report, so the trust property the
landing page advertises is something a user actually sees after every tailoring.

## 2026-08-28 — The CRM caught up to the app's own manners

**Decision:** a quality-of-life pass on the existing CRM pages, nothing new underneath:
deletes confirm (stating the cascade — a company takes its applications and their history
with it), the company page can add the people and roles it lists, the contacts list shows
next ping and a relative last touch, ping dates have 1w/2w/1m presets, and the log box can
say what kind of touch it was. Every capability already existed in the actions and tools;
the UI had just never exposed it.
**Two calls worth remembering:** the Email column on the contacts list was *removed*, not
lost — it was xl-only and mostly dashes, and its job is now done by mailto/LinkedIn icons
on the row. Those icons sit in a cluster *outside* the row's link because an anchor inside
an anchor is invalid HTML; don't move them back in. And `TOUCH_TYPES` in contact-detail
lists only the kinds a person logs by hand — STAGE_CHANGE, APPLIED and the rest are
written by the system and would be lies if hand-picked.
**Applies to:** `src/components/crm/`, `src/app/(app)/crm/contacts/page.tsx`,
`agoDay` in `src/lib/utils.ts`.
## 2026-08-28 — A waitlist, and where it sits in the data layer

**Why:** hired.tools is becoming a "request access" page rather than a "read the README and
deploy it" page, and "email me directly" needed somewhere to land. The alternative was a
third-party form service, which would have been the first non-font external request the
marketing site makes and would have put a list of strangers' addresses on someone else's
server. This keeps it in the instance.

**Where it broke the pattern, and why that's fine.** Invariant 1 says every function in
`src/lib/data/` takes `userId` first. `waitlist.ts` doesn't, and neither does `users.ts` —
because neither touches a person's content. A signup is instance-level, like `Setting` and
`Invite`. The distinction that matters is not "does it take a userId" but "is this someone's
brain, resumes or applications", and for those the rule is unchanged. `waitlist.ts` says so
at the top so the next reader doesn't think the invariant slipped.

**`addWaitlistSignup` is the only data function an anonymous request can reach.** That is
safe because it grants nothing, reads nothing back, and writes a row that does nothing until
an admin acts on it.

**CORS is `*`, deliberately.** An allow-list would have been a new setting, and a new setting
is one more thing every self-hoster has to configure before their own landing page works —
the exact cost invariant 5 exists to avoid. CORS isn't the boundary here; the answer being
identical for every caller is. Signing up twice returns the same `{ok:true}` as signing up
once, so the endpoint can't be used to enumerate who is on the list.

**Rate limiting is in the database, not in memory.** An in-memory counter would be per-replica
and would reset on every restart, which is the same reason the MCP transport is stateless.
Instead: a honeypot, the unique index on email, a body cap, and a burst ceiling counted with
a query. A determined person can still put junk on the list; they cannot get in.

**Notification failures are recorded, not swallowed.** `notified`/`notifyError` mirror
`Invite.emailSent`/`emailError`, so a signup that arrived while Resend was misconfigured
shows up in Admin as one rather than looking like nothing happened.

**The landing page's tool count is unchanged at 64.** All three new tools are `adminOnly`,
and the figure on hired.tools is what a *member* sees.

## 2026-08-28 — The landing page is for someone looking for a job

**Decision (William's):** the page was written for someone who already knew what
self-hosting was. The audience is a job seeker, mostly non-technical, and the page should
sell getting hired. Modelled on 21st.dev's shape: scannable capability grid, pricing on the
page, one obvious action.

**What changed.**
- The headline is an outcome — "Get hired on what you actually did" — rather than an
  instruction ("Write your career down once").
- A new `#features` grid, four cards, sixteen concrete capabilities. This is the section a
  first-time reader scans before deciding whether to keep going, and the old page had no
  equivalent: it went straight from the problem into a product tour.
- The tour stopped being the inventory and became the demo. Its heading was "Four parts,
  one record", which now collides with the features grid, so it is "What each part actually
  looks like".
- `#get` — two co-equal doors, self-host and hosted — is gone. It has become `#pricing`
  (three tiers) plus one compact `#selfhost` band. Self-hosting is still there, still true,
  and no longer half the page.
- The FAQ is rewritten for someone who has never deployed anything: "do I need to be
  technical", "can I use it now", "how long until it's useful", "who can see my stuff".
- MCP is never named. It was already demoted to "you just say it" last week; the nav item
  is "How it works" and the jargon is gone from the tour lede too.

**The prices are placeholders and say so in the markup.** $0 / $12 a month / $99 a year.
They appear in exactly two places — the tier cards and the FAQ answer — with a comment
naming both, so changing them is not a search-and-hope.

**Hosting is presented as closed, because it is.** Both hosted CTAs go to the form, not to
a checkout. The Stripe Payment Link already exists as a setting; it replaces the hrefs when
hosting opens.

**Two bugs the restructure surfaced.**
`.stage { grid-template-columns: 1fr }` in the 900px query is `minmax(auto, 1fr)`, so the
track could not shrink below the min-content of the compose block's unbroken URL and the
whole page scrolled sideways at 390px. `minmax(0, 1fr)` lets `.code`'s own `overflow-x`
do its job. This never showed before because the old self-host column used `.doors`, whose
`auto-fit minmax` already had the zero floor.
The audit script's "inputs without a label" check only looked for `aria-label` and a
wrapping `<label>`, so it reported the new form's correctly-labelled inputs as failures. It
now follows `label[for]` and skips `aria-hidden` honeypots.

## 2026-08-28 — The hero is centred

**Decision (William's):** the hero copy is centred on both desktop and mobile.

The copy block is now a `.hero-lead` flex column with `text-align: center`, and the form
reuses the `.mid` variant already written for the close section rather than a second set of
rules. The product shots below it stay in two left-aligned columns on purpose: the text is
one column of statement and the shots are two columns of evidence, and centring the
statement is what stops a wide screen reading as a left margin with nothing to the right of
it. The hero's light was aimed at a headline that used to sit on the left, so both radial
stops moved toward the middle.

**Two things the centring forced.** The form's note used to carry a "run it yourself today"
link, which wrapped mid-phrase inside the 480px form; the link moved down into the fact row,
where it is a link at last instead of the plain words "Free to self-host, forever". And
below 560px the field and the button now stack full width — a half-width button wrapping
under a full-width field reads as an accident rather than a layout.

**Also fixed:** `POST /api/waitlist` recorded a `file://` or privacy-mode submission as a
source literally called "null". Empty now.

## 2026-08-28 — One plan

**Decision (William's):** pricing is a single monthly tier, not three.

The ladder was mine and it was doing two jobs badly. The Founding tier existed to make the
waitlist feel urgent, which is a reason to build a thing rather than a reason anyone wants
it, and the $0 self-host column duplicated the `#selfhost` band sitting directly underneath
it. What is left is the one plan there actually is: $12 a month, marked coming soon, with
the CTA still pointing at the form rather than a checkout.

Self-hosting has not been demoted further — it is in the section's own lede as a link, it
keeps its band, it keeps its nav item, and it is still the answer to "what does it cost"
in the FAQ. It just stopped being a column in a comparison it was never competing in.

**Two layout consequences.** `.tiers` is `auto-fit`, so one card stretched the full measure
and read as a banner rather than a price; `.tiers.one` pins it to 380px and centres it. And
a left-aligned section heading over a centred card lines up with nothing, so `#pricing`'s
heading centres too — which now matches the hero.

The price appears in exactly two places, the card and the FAQ answer, and the comment above
the section names both.
## 2026-08-28 — The phone gets the same app, not a smaller one

**Decision:** a mobile pass across every screen, mobile-first with the desktop restored at
`md`. Desktop renders identically to before — that was the constraint the whole pass was
built around, and it is verified rather than asserted.

**The four real defects**, in the order they mattered:

1. **The board could not be scrolled at all.** Every card carried `touch-none`
(`touch-action: none`), and the cards cover the board, so the browser was forbidden from
scrolling anywhere a finger would naturally land — vertically as well as sideways. It was
there because the `PointerSensor` had a 6px activation distance, and on a touch screen a
6px movement is the beginning of a scroll far more often than the beginning of a drag; the
only way to make dragging work at all was to switch scrolling off. Now `MouseSensor` and
`TouchSensor` are separate: mouse keeps 6px, touch needs a **220ms hold**, and the cards
are `touch-manipulation` so the browser scrolls again. Tapping a card still opens the panel,
whose stage Select is the no-drag way to move something — which is what most people will
use on a phone regardless.

2. **Navigation was five unlabelled 28px icons.** No labels, no current-page indicator, and
Settings/Docs/Admin reachable only through a 28px avatar. Replaced with a hamburger, a
drawer holding every destination with its name, and a header that says which page you are
on. The desktop rail is untouched.

3. **Every input zoomed the viewport.** iOS Safari zooms when a focused field is under 16px
and does not zoom back out. All fields are `text-base` below `md`, `text-sm`/`13px` above.
Watch for this on any new field, including the five that override the shared sizing.

4. **Three pages scrolled sideways at 360px** — the diagnosis row's three fixed columns, an
unbounded `TabsList`, and `PageHeader`'s `shrink-0` actions. `html { overflow-x: hidden }`
is the backstop, but each cause was fixed at its source rather than hidden.

**Touch targets — the part worth remembering.** The desktop design is deliberately dense and
inflating every control to 44px on mobile would have cost exactly that density. So on
`pointer: coarse` a control keeps its size and gains an invisible centred 44px hit area via
`::after`, plus a `.touch-target` utility for things that are not Buttons. **The catch, found
by measurement: an `overflow` ancestor clips the pseudo-element.** Anything inside a scroll
strip, a `truncate`, or an animating `overflow-hidden` panel needs real height instead —
which is why the filter chips, tabs, calendar links and connection buttons are `h-11 md:h-7`
rather than relying on the trick. Both `position: relative` rules are wrapped in `:where()`
so a Tailwind position utility still wins; see the `.ring-highlight` entry above for why
that is not optional in this codebase.

**How it was checked:** a Playwright pass over eleven pages at 360/390/430px asserting no
horizontal overflow, no sub-44px hit area (probed with `elementFromPoint`, not
`getBoundingClientRect` — the box is not the target) and no field under 16px, plus a
behavioural suite for the drawer and both board gestures. 14 failing page-viewport
combinations before, 0 after; 20/20 behavioural checks; desktop screenshots unchanged.

**Applies to:** `globals.css` (the coarse-pointer block, `.touch-target`), `ui/` primitives,
`shell.tsx`, `board.tsx`, and any new control — if it sits inside an overflow container, give
it real height.

## 2026-08-28 — Free is self-hosting, and the card says why

**Decision (William's, after asking for the analysis):** a free column comes back, and free
means self-hosting. A limited free *hosted* tier is the eventual destination, but not now.

**What the product research found, because it settles the question.** Hired makes no LLM
calls at all — the only provider strings in the tree are documentation links and
user-agent sniffing in `clients.ts`. The thinking is done by the reader's own Claude or
ChatGPT subscription, so the marginal cost of a hosted user is Postgres rows of text plus
the occasional PDF render, and `src/lib/pdf.ts` launches a fresh Chromium per render with no
pool and no concurrency cap, which makes export the only operation that spikes anything.
Nothing about the economics forbids a free hosted tier.

**What does forbid it today is that there is no plan.** Billing is binary: entitled means
`isActive: true`, lapsed means suspended with the data kept. No plan, tier or quota exists
anywhere in the schema or settings, and by invariants 1 and 2 any limit would have to be
enforced inside `src/lib/data/` rather than the UI, or MCP walks straight past it. With no
checkout yet and the waitlist already throttling signups, building that to convert people
to a payment link that does not exist would have been premature.

**The card names its own catch.** The page is now addressed to someone who has never
deployed anything, so a "Free" card that quietly means "if you can run a server" would be a
lie by layout. The last row is a caveat rather than a tick — "you need somewhere to run it,
and about ten minutes" — greyed, with the refusal icon instead of a check.

**"There is no smaller version of it" survives**, which was the point of choosing this
split. The free column is not a trial and not a cut-down build; the difference between the
two cards is who runs the server, and the fine print says exactly that.

## 2026-08-28 — The page is an ATS, and the acronym does the work

**Decision (William's):** the positioning is "Applicant Tracking System (ATS, for
applicants)". Not "the inverse ATS" — the words stay exactly what they always were, and
only the owner flips. Every job seeker already knows the term and already resents it, so
the headline borrows recognition that took the recruiting industry twenty years to build.

**Why it survives contact with the product.** The parallel is not a metaphor, it is a
feature map, which is what makes it safe to run through the whole page: their candidate
database is the brain, their resume screening is the resume builder, their hiring pipeline
is the pipeline, and the notes a recruiter keeps on you are the notes you keep on them.
Their funnel report is the diagnosis section, almost line for line. Nothing had to be
invented or overstated to draw it.

**Where the angle went.** Hero headline and gloss; the "why it exists" band, which now
states the asymmetry outright ("They have a system. You have a folder called final_v3");
the features heading, which draws the four-way parallel explicitly; the read, which is now
"Recruiters get a funnel report. Now you get one."; the close; the title, meta description,
og:title and og:description; the share card, re-rendered; and the README's opening.

**What deliberately did not change.** `#honest` — "Nothing on a resume is invented" — was
left alone. It is the one place the analogy would turn against the product: their ATS
rewards keyword-stuffing, and the answer to that is not a better stuffer. And the footer
keeps "Your career, on the record" as the brand line; a tagline and a positioning line are
different jobs.

**Typography.** "Applicant’s Tracking System" is 27 characters and the hero's 18ch measure
broke it into an orphan, so the measure is 22ch and it sets on one line at desktop, two on
a phone. A curly apostrophe, not a straight one: at 62px the typewriter quote is the first
thing that looks cheap.

**Three revisions later** the flip is carried by the possessive alone. It went
"Applicant Tracking System" with a mono gloss reading "(ATS, for applicants)", then
"Applicant tracking system" with the first word in the accent, and landed on
**Applicant’s Tracking System** — the apostrophe does what the gloss was doing, so the gloss
is gone. The description states it outright in its first sentence; saying it a third time
in the typography was one telling too many.

**Also gone from the hero:** the invite-only chip above the headline, and the "Free to
self-host, forever" fact. The fact row is now two items, and the client names in it wear
their own favicons — the same self-hosted files the strip below the fold uses, so the page
still makes no third-party request. On a phone the mobile rule that turns every
`.hero-note span` into a block had to be undone for that group, or the chips stack instead
of wrapping.

## 2026-08-28 — Stripping the hero back, and a width that was an accident

**Decision (William's):** out of the hero go the "Nothing on a resume is invented" fact, the
form's small print ("No card, no account yet…"), and the whole "Connects to" client strip
under the product shots. What is left above the fold is the headline, the description, the
form, and one row saying which assistants it works inside.

**One bug fell out of it, and it is worth knowing about.** `.hero-lead` is a centred flex
column, so its children are sized shrink-to-fit rather than filled. `.joinform` had only a
`max-width`, which meant its actual measure came from whichever line of text inside it
happened to be longest — and that was the small print. Deleting the small print narrowed the
form from 480px to 373px, which was under the flex basis of the field plus the button, so
the button wrapped onto its own line at full desktop width. Nothing in the diff looked like
a layout change. `.joinform` now carries `width: 100%` alongside its `max-width`, so its
measure is stated rather than inherited from prose.

The lesson generalises: in a centred flex column, `max-width` alone is not a width, and a
copy edit can silently become a layout edit.

**What was kept.** `.mark` survives the strip's removal — the hero's chips and the connect
section's client tabs both wear it, and only the `.strip`-scoped rules were dead. Its
comment said "so six different icon shapes read as one row", which described the strip that
no longer exists; it now describes what it actually styles. `media/clients/vscode.png` and
`windsurf.png` are unreferenced by the page for the moment and stay on disk, because the
connect section still names those clients and the media README asks for them to be kept.
## 2026-08-28 — Silence is a fourth ending, and the table is where you edit

**Decision:** `GHOSTED` joins accepted / rejected / withdrawn, and the list view stopped
being a list. Stage, follow-up, salary and location are now the cells themselves; a Waiting
column counts days since the last stage change; rows can be selected and closed out in a
batch; stage filters combine.

**Why ghosted and not "closed":** merging the endings was the tempting simplification and it
is the wrong one. The funnel's whole job is to tell you what is going wrong, and "they said
no" and "nobody replied" point at different fixes — a resume problem versus a follow-up
problem. `pipelineStats` already counted a ghosting as a non-response, so the number was
right and only the label was lying. Rejected and withdrawn stay distinct for the same
reason: who decided is the information.

**Waiting is measured, not inferred.** `updatedAt` moves when you edit a note, so it cannot
answer "how long has this sat there". `applicationInclude` now pulls the most recent
transition row (`toStage: { not: null }`, take 1) and `listApplications` turns it into
`stageSince` + `daysInStage`, stripping the raw array — a one-element relation is plumbing,
and it would have shown up as noise in every `list_applications` tool result. Applications
older than stage history fall back to `createdAt`, which reports their age rather than
inventing a precision the data does not have.

**Bulk moves loop rather than `updateMany`.** One query would have been faster and would
have destroyed the timeline entry, the follow-up date and the transition row that the funnel
is built from. `moveApplicationsStage` calls `moveApplicationStage` per id and skips ones it
cannot find, so closing out twelve dead applications does not fail on the one deleted in
another tab.

**Filters are a set in one param.** `f=SCREEN,INTERVIEW`. An old single-stage link still
parses, an unknown value means everything, and `overdue`/`closed` replace the set rather
than joining it because they are cuts across stages rather than stages. The URL stays the
state, so a filtered view is still a link you can send yourself.

**Two things the UI had to concede.** An empty `input[type=date]` prints "mm/dd/yyyy", and a
column of those on every row without a follow-up shouts louder than the dates that are set —
so an empty date cell is an em dash until clicked. And collapsed board columns live in
localStorage, not the URL: it is how you like to look at the board, not what you are looking
at, and it should not travel in a shared link. A collapsed column is still a drop target.

**Watch for:** `move_applications_stage` brings the member surface to 67 tools and the admin
surface to 87. The README states both in three places.
**Applies to:** `prisma/migrations/20250112000000_ghosted_stage/`, `src/lib/data/pipeline.ts`,
`src/components/pipeline/{list,board,toolbar}.tsx`, `src/lib/pipeline-list.ts`.

## 2026-08-28 — A saved view is a name for a URL

**Decision:** `SavedView { name, query }` — the query string, stored whole, rather than
parsed columns for view / filters / sort / search. The pipeline toolbar already encodes all
of that into the URL, so saving a view is saving that string, and anything the toolbar
learns to encode later is saved without a migration.

**What that costs:** nothing validates the query. A view saved against a stage that is later
removed returns everything instead of erroring — the harmless failure, and the reason this
is the right trade. `normaliseQuery` keeps only the six parameters the pipeline actually
reads and writes them in a fixed order, so the same view saved twice is the same string and
"am I looking at this view" is a string comparison rather than a parse on every render.

**Saving under an existing name replaces it.** Re-saving under a name you already use means
"update it" every single time; the alternative is making someone delete a view to change it.
The unique index is `[userId, name]`, so the upsert is the constraint rather than a check.

**Two mobile bugs the seeded data exposed**, both pre-existing and neither caused by this
work — an empty database had been hiding them. The docs page scrolled sideways because tool
descriptions are prose written elsewhere and two of the new ones quote a query string: one
unbreakable 45-character token is wider than the column on a phone. Fixed at the render site
with `overflow-wrap: anywhere` rather than by shortening the description, so no future
description can do it either. And the calendar's month grid is seven columns, which at 360px
is 48px a cell — not a calendar, a grid of three-character stubs. It now keeps a 44rem width
and scrolls sideways, the same gesture the board uses, which also makes room for chips tall
enough to tap.

**Applies to:** `prisma/migrations/20250113000000_saved_views/`, `src/lib/data/views.ts`,
`src/components/pipeline/saved-views.tsx`, `src/app/(app)/docs/page.tsx`,
`src/components/pipeline/calendar.tsx`.

## 2026-08-29 — Real company marks in the mocks, fetched once

**Decision (William's):** the pipeline and CRM mocks show each company's actual favicon
instead of a two-letter initials tile.

**Fetched at author time, not at render time.** The app does this live, through
twenty-icons.com, which is why `admin_set_company_logos` exists and warns that the service
can see which companies are in someone's pipeline. The marketing page must not inherit that:
it makes no third-party request beyond Google Fonts and one call for the GitHub star count,
and a mock is a picture, not a live pipeline. So the seven marks were pulled once from the
same source, committed under `site/media/companies/`, and are served from this origin. The
check that matters is in the scratchpad — the page still contacts only `fonts.googleapis.com`
and `api.github.com` after scrolling the whole page and clicking through all four scenes.

**Three companies deliberately keep their initials.** Meridian Logistics and Northbeam
Freight are invented, so there is nothing to fetch. Convoy shut down in 2023 and the logo
now served for `convoy.com` is not the mark it used — labelling somebody else's logo
"Convoy" would be a small lie in a product whose whole pitch is that it doesn't invent
things. The mixed result is not a compromise: the scene's own lede already says "the website
you save is what puts their logo on the board", and the table's caption already says
companies without one fall back to initials. The mock now demonstrates the sentence it was
already making.

**Two things found while wiring it.** The marks first read as broken because every one of
them reported `naturalWidth: 0` — they sit inside the tour's scene panes, and `loading="lazy"`
means an image in a pane nobody has opened never loads. They decode correctly once a scene
is shown, but lazy loading would have made the mark arrive a frame after the reader switches
scene, which reads as a flicker; they are 4–12KB each and same-origin, so the attribute is
gone. And the tinted `--hue` ground is dropped on a logo tile: the marks bring their own
background, and two grounds fight.

## 2026-08-29 — The page caught up to a tenth stage and four new tools

Merging main brought the pipeline table rework, saved views, and a `GHOSTED` stage. Three
numbers on the landing page were quietly wrong afterwards, and none of them would have
thrown an error:

- the features card said **"Nine stages from wishlist to offer"**; the enum has ten now,
  and `GHOSTED` is not a stage anyone advances *to*, so the line reads "Ten stages, wishlist
  through offer" rather than pretending the arc got longer;
- the member-visible surface went **66 → 70** — `save_view`, `list_saved_views`,
  `delete_saved_view` and `move_applications_stage` are all member tools — which moves the
  figure block, the disclosure summary, the sentence inside it, and the All chip;
- the catalogue's Pipeline group went **16 → 20**, and four cards had to be written, because
  that list is hand-maintained rather than generated.

Counted from the running instance rather than from the diff: 90 entries an admin sees, 20 of
them `adminOnly`, so a member sees 70 across 21 brain, 11 resumes, 20 pipeline, 10 crm, 7
workflows and 1 account. Verified twice over — the group chips sum to 70 and the page renders
70 real cards against the claim.

**This keeps happening, and it is worth naming.** Every feature that adds a member-visible
tool silently falsifies five numbers on a static page in another directory. Nothing checks
it. A generator for the catalogue block, or a test that diffs `tools/list` against the page,
would end the whole class of error.

## 2026-08-29 — Every mocked company is real, and the footer loses the studio column

**Decision (William's):** no initials tiles left in the mocks, and the footer's Shifu Labs
column goes entirely.

**The three companies without marks were not equivalent.** Convoy was an application target
and swapped straight out for Ryder. Meridian Logistics and Northbeam Freight are the mocked
candidate's own *employers* — they run through the resume paper, four brain highlights, a
guardrail note and the hero transcript, so replacing them everywhere would have meant a
fictional person claiming employment at real companies. Instead they were removed only from
the pipeline board and the CRM table and replaced with C.H. Robinson and Motive. That was
the incoherent part anyway: the board had this person interviewing at the company they
already work for. The invented names stay exactly where no logo is ever drawn.

Locations and industries moved with the names — Eden Prairie MN, Miami FL, San Francisco CA,
and Motive is fleet telematics rather than freight — because a real company sitting under a
wrong city is the kind of detail that makes a mock look fake.

**Two domains lied.** `convoy.com` no longer serves Convoy's mark, and `coyote.com` is not
Coyote Logistics; both return a clean, plausible logo belonging to somebody else. They were
caught by rendering every candidate to a contact sheet and looking at it. That check is now
written into `site/media/README.md`, because the failure mode is silent.

**The table's caption changed with the data.** It said companies without a website fall back
to their initials, which the table no longer demonstrated. It now says where the marks come
from, which it does.

**Footer.** The Shifu Labs column is gone; `studio@shifulaboratories.com` went with it and
appears nowhere on the site now (the correct address, for the record, is
`studio@shifulab.com`). The LinkedIn is the company page,
`linkedin.com/company/shifulab` — the earlier `/in/shifulab` was a personal-profile path.
Two link columns left a hole in the middle of a three-track grid, so the links are sized to
their content and sit at the right edge, where the base bar's own line already ends.

## 2026-08-29 — Admin moved under Settings, and the login form learned to say no

**Decision (William's, after asking how Twenty does it):** the admin surface is
`/settings/admin`, not `/admin` and not `admin.hired.tools`. Twenty puts theirs at
`SettingsPath.Admin` inside the same app, gated by a flag on the account, and that shape is
right for the same reason it is right for them: the admin of a self-hosted instance is its
owner, and a separate deploy would mean DNS and a second service before anyone could
administer their own copy. `/admin` still redirects — it was in the profile menu for months.

**Why not a subdomain, said plainly:** a subdomain is a public DNS record. Putting the admin
pages behind one is obscurity, not security. What protects them is `requireAdmin`, which was
already enforced. The one honest argument for a separate origin is XSS blast radius, and
that is worth less than the things below.

**The actual hole was rate limiting, and there was none.** Anyone could POST the sign-in
form as fast as their connection allowed. `LoginThrottle` counts failures per email and per
address: eight against one account in fifteen minutes locks it for fifteen. Counters are in
the database, not in a process, for the same reason the MCP transport is stateless — a
counter in memory is a counter an attacker clears by waiting for a deploy. The IP counter is
deliberately loose and deliberately secondary: offices share addresses, and
`x-forwarded-for` can be forged by whoever talks to the proxy. **The email counter is the
protection; the IP counter is a speed bump.** Verified by actually brute-forcing it: locked
after nine attempts, and it then refuses the *correct* password, which is the assertion that
distinguishes a lock from a delay.

**Password reset is the support tool a hosted instance cannot run without** — a locked-out
customer had no way back and neither did you. It goes through `canManage`, so an ADMIN
cannot reset the SUPER_ADMIN. Without that line this feature is a one-click instance
takeover wearing a support-ticket costume. Proved over HTTP with a real admin token: the
same call is refused against the owner and succeeds against a member. Sessions are destroyed
on reset, because a reset whose old sessions keep working has locked nobody out.

**The audit log stores emails as text rather than joining.** An audit row has to survive the
deletion of the account it describes; deleting a user is exactly when you most want the log
to remember. It records account administration only — never content — and never the
password or invite token, because every admin can read it.

**Testing note worth keeping.** Three of this session's tests passed while proving nothing:
one scraped a password out of page text and captured the `.com` of the email above it, one
matched the sidebar's "Collapse sidebar" instead of a board column, and one asserted against
a reimplementation of `canManage` rather than the real function. A security test that does
not fail when the guard is removed is decoration. The escalation check now runs through the
real MCP endpoint against the real data layer.

**Applies to:** `src/lib/login-throttle.ts`, `src/lib/data/audit.ts`, `src/lib/passphrase.ts`
(extracted from `bootstrap.ts` so a password helper does not drag in instance provisioning),
`src/app/(app)/settings/admin/`, `prisma/migrations/20250114000000_login_throttle_and_audit/`.

## 2026-08-29 — Sharing a pipeline is a slug, not a workspace

**Decision (William's, after weighing the cost):** the "let someone help me review my
applications" job ships as a read-only link — `PipelineShare`, a public `/p/<slug>` route,
`share_pipeline` / `unshare_pipeline` / `get_pipeline_share`. Shared workspaces with viewer
and editor roles are still parked.

**Why not workspaces, with the actual number:** `userId` as the first positional argument
*is* the tenant isolation, and it is load-bearing across 65 data functions, 17 tables, 75
MCP call sites and 69 server actions. A `Workspace` + `Membership` model repoints every one
of those, adds an acting-user parameter for permission checks, teaches the MCP token to
resolve a user-and-workspace pair, and introduces a read-only role the data layer has never
had. That is a week with a real chance of a tenant-isolation bug, and it should be its own
piece of work rather than a side quest — which is what `CLAUDE.md` has said all along.
The link gets most of the value in a day and tells us whether anyone opens it.

**The select is the entire privacy model.** `getSharedPipeline` is the second function in
`src/lib/data/` without a leading `userId`, which makes it the second place where a mistake
is a leak rather than a type error. It is an allow-list, and what is absent is deliberate:
salary, notes, job descriptions, the activity timeline, and — most importantly — contacts.
**A share link is consent to show your own search, never consent to publish a third party's
name and email address.** That distinction is why contacts are excluded even though a
reviewer might find them useful.

**Verified by seeding secrets and looking for them.** A salary, a private note, a job
description, a contact and a timeline entry were written into the database with recognisable
markers, then the public page was fetched by a browser with no session: none of the five
appear, no link walks back into the app, and the page is noindex. A revoked link 404s. That
is a stronger test than reading the select and agreeing with it.

**Revoking deletes the row rather than flipping a flag**, the same call as an unpublished
resume and for the same reason: you revoke because a link reached someone it should not
have, and a pause you can undo does not fix that.

**Also decided, and deliberately not built:** `admin.hired.tools`. A subdomain adds no
security — it is a public DNS record, and `requireAdmin` is what protects the pages. It can
be had for about fifteen lines of hostname routing in the same deploy if it is ever wanted,
with no second service and nothing extra for self-hosters. But what "admin" administers
changes if workspaces ever land, so the hostname would be decided twice. **If it is built
later, give it its own login rather than widening the session cookie to `.hired.tools` —
the apex is served by GitHub Pages, so a widened cookie would be sent to GitHub's servers
on every landing-page request.**

**Applies to:** `src/lib/data/pipeline-share.ts`, `src/app/p/[slug]/`,
`src/components/pipeline/share-pipeline.tsx`,
`prisma/migrations/20250115000000_pipeline_share/`.
## 2026-08-29 — The hero's shots lean back

**Decision (William's):** the hero's two product shots get the 3D tilt from a Tailark hero
block — perspective, `rotateX`, a skew, and a mask that fades the bottom away.

**The request arrived wrapped in shadcn install instructions that did not apply.** The
component was a React/Tailwind hero wanting `lucide-react`, `@radix-ui/react-slot`,
`class-variance-authority` and a `components/ui/button`. The app already has every one of
those and 21 shadcn components in `src/components/ui/`, so there was nothing to install —
and the hero being pointed at is not in the app at all. It is hand-written HTML and CSS in
`site/`, with no React, no Tailwind and no build step. Only the CSS technique transferred.

**Perspective on the wrap, transform on the stage.** Putting perspective on `.stage` and
transforms on its children would tilt each panel around its own origin and make them
diverge; the two shots have to share one vanishing point to read as a single receding
surface. `.hero .wrap` holds the perspective and `.hero .stage` takes the transform.

**The angles are deliberately softer than the reference.** That block tilts one static
screenshot: `rotateX(20deg)` with `skewX(.36rad)`, about 20.6°. The left panel here is a
transcript that types itself out and is meant to be read, so it runs 13° and 0.1rad. Both
are `--tilt-x` and `--tilt-skew` custom properties, there to be argued with.

**Desktop only, at 900px and up.** On a phone the shots already fill the screen and a tilt
buys nothing but lost legibility. Verified: tilted at 1440 and 1024, flat at 899 and 390.

`skewX` widens an element's painted box, which is exactly the kind of thing that starts a
sideways scroll — `.hero` already clips, and the overflow check is clean at all five widths.

## 2026-08-29 — Seventy-three, and the counting problem is now the story

Pipeline sharing landed on main and added three member-visible tools — `share_pipeline`,
`get_pipeline_share`, `unshare_pipeline` — so the page went 70 → 73 and the Pipeline group
20 → 23. Same five places as last time: the figure block, the disclosure summary, the
sentence inside it, the All chip, the group chip, plus three cards written by hand.

**That is twice in two days and three times this week.** The catalogue is a hand-maintained
copy of `tools/list` living in a different directory from the thing it describes, and
nothing fails when it drifts — the page renders, the tests pass, and the number is simply
wrong. Every count on this page has been correct only because someone re-derived it from a
running instance each time. The fix is a generator: emit the catalogue block and the six
totals from `allTools` at build time, or fail CI when the page disagrees with `tools/list`.
Until that exists, treat "merge main" as implying "recount".

The admin refactor in the same merge moved the admin page to
`src/app/(app)/settings/admin/page.tsx`. The waitlist panel came with it — checked rather
than assumed, since a panel silently dropped in a file move is exactly the kind of thing
that stays broken for weeks.

## 2026-08-29 — Scroll-driven motion, and the thing that was not built

**Decision (William's):** more advanced scrolling. Three things went in; the obvious fourth
did not.

**Not built: scroll hijacking.** Lenis, Locomotive and friends replace the browser's scroll
with a JS-interpolated one. They demo beautifully and feel worse in the hand: trackpad
momentum stops matching the OS, keyboard paging and find-in-page get strange, and the whole
page depends on a runtime library that this one currently does without — it ships zero
third-party JS and contacts nothing but Google Fonts and one call for the star count.
Nothing about "smoother" is worth that. Everything below is native.

**1. The progress bar came off the main thread.** It was a scroll listener writing a custom
property every frame. Where `animation-timeline: scroll()` exists it is now a CSS
scroll-driven animation, and `motion.js` checks the same support and nulls its own handle so
only one of the two ever runs. Verified both paths: with timelines, the bar tracks scroll
exactly and the JS custom property is never set; with `CSS.supports` stubbed to refuse, the
JS fills it as before.

**2. The nav says where you are.** Links pointing at a section on this page get
`aria-current="true"` as their section passes a line a third of the way down the viewport —
steadier than "most visible", because these sections differ wildly in height. It is
`aria-current` rather than a class so the state is announced and not merely drawn.

**3. The hero's tilt scrubs.** The shots lean back when you land and stand up over the first
65vh of scrolling. This is the page's *third* kind of motion and the header comment in
`styles.css` only described two — "plays once on entry and holds", and "does not move".
A scrubbed animation has no duration and no direction of its own; it reflects the scrollbar
and reverses exactly as faithfully going back up. It sits behind
`prefers-reduced-motion: no-preference`, so the calm path keeps the static tilt — checked,
not assumed.

**Two bugs, one of which was mine and imaginary.** The `animation` shorthand resets
`animation-duration` to `0s`, which on a scroll timeline collapses the animation to a point;
the longhands with `animation-duration: auto` fix it. And `markSection` used
`element.offsetTop`, which is measured from the nearest positioned ancestor — every
`section` on this page is `position: relative`, so it was not the document offset it looked
like; it reads `getBoundingClientRect().top` now.

The imaginary one: the progress bar appeared frozen near zero in the first test run. It was
fine. `html { scroll-behavior: smooth }` meant the harness was reading the value while the
page was still travelling. Worth remembering — **any scroll assertion on this page has to
scroll with `behavior: 'instant'` or it measures the journey rather than the destination.**

## 2026-08-29 — A resources section, and the site's first build step

**Decision (William's):** a resources section for search, with the content calls left to me.

**The site had no SEO plumbing at all.** No sitemap, no robots.txt, no structured data, one
canonical tag across five files. That was worth more than any single post: hired.tools was a
one-page site giving a crawler almost nothing. Now there is a sitemap, a robots.txt pointing
at it, an RSS feed, `SoftwareApplication` and `FAQPage` schema on the home page, and
`Article` + `BreadcrumbList` + `Person` on every post.

The `FAQPage` block is generated by reading the FAQ out of `index.html` at build time rather
than being written by hand beside it. Nine question-and-answer pairs that could have drifted
apart cannot.

**The first build step, and why it is not a betrayal of "no build step".** The property that
mattered was never the absence of a build — it was that the output is static HTML with no
runtime dependency and no third-party request. That survives exactly. What has gone is
hand-maintenance, and this repo has already shown three times this week where that leads: the
tool catalogue drifted on every merge and nothing ever failed. Twelve hand-written posts
would rot the same way. `tools/build-resources.mjs` imports nothing, so the whole build is one
`node` call with no install step, and the generated files are gitignored so the Markdown is
the only copy.

**Content calls, since they were delegated.** No listicles. "Resume tips" is among the most
AI-saturated query spaces on the internet and a new domain will not touch the head terms, so
all three posts are pitched at winnable angles with something true behind them:

- **What an ATS actually does** — corrects the "75% are auto-rejected" claim, which is
  repeated everywhere and sourced nowhere. The one topic where this site has real standing,
  because the product is the mirror image of one.
- **STAR does not fit a resume bullet** — not "what is STAR", which has half a million
  competitors, but the argument that it is an *interview* framework misapplied to a
  fourteen-word line, with three before-and-after rewrites.
- **The Harvard format** — a checkable claim about a format the product already implements,
  against weak competition.

Each answers its title question in the first paragraph, which is what gets picked up as a
snippet and what an LLM quotes. They cross-link, and every one carries the no-fabrication
argument, because that is the product's actual differentiator and it happens to be true.

**Two bugs worth remembering.** `esc()` ran before `smart()`, so the curly-quote rule was
matching a character that had already become `&quot;` and never fired. And the template
pointed at `/icon.svg`, which does not exist — the home page inlines its favicon as a data
URI, so the generator now reads that same tag out of `index.html` rather than keeping a
second copy.

**Left for William:** verify hired.tools in Google Search Console and submit the sitemap.
Nothing gets indexed quickly without it, and it is the only step here that cannot be
automated from this side.

## 2026-08-30 — Resources holds more than articles, and can be searched

**Decision (William's):** search on the hub, room for things that are not posts, and a
shout-out to Ethan Evans' YouTube channel.

**Kinds, rather than a second section.** `kind` in the frontmatter picks a badge, a filter
chip and whether the page leads with an outbound button — `article`, `watch`, `template`,
`tool`, with the first two in use. An unknown kind fails the build rather than rendering a
blank badge. Adding a fifth is one line in `KINDS`. The chip row only offers kinds that
actually have something in them, so a filter can never return nothing.

**The search bar is hidden in the markup and revealed by the page's own script.** A search
box that does nothing without JavaScript is worse than no search box; with scripting off the
hub is the complete list, which is a finished page. Same reasoning as everything else here.

**On recommending someone else's work.** The temptation was to describe videos I have not
watched. Everything factual about Evans is attributed — "by his own count" for the 10,000
resumes and 2,500 interviews — and the specifics I could verify (Amazon VP until 2020, Prime
Video, Appstore, Merch, Prime Gaming, Twitch Commerce) are stated plainly while the rest is
left to the link. On a site whose entire pitch is that it does not invent things, a
recommendation padded with invented detail would be the worst possible place to slip. The
byline flips to "Recommended by" when an entry points outward, because the author line would
otherwise claim someone else's work.

It is also noted in the post that the ethanevans.com link is not an affiliate link, since
recommending a person who sells classes without saying so reads badly whether or not money
changed hands.

**Why it belongs here at all:** the site argues that the software on the other side keeps a
record you cannot see. Evans covers the human half — the judgment made in rooms you are not
in. Both land on the same point, that you cannot influence a decision you have no record for.
