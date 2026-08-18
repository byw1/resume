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
