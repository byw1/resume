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
