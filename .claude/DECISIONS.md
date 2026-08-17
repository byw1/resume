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
