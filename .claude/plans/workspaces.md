# Workspaces, members and roles

Status: **plan only.** Nothing here is built. Written 2026-08-26.

---

## What this reverses, and why that matters

Two entries in `DECISIONS.md` park exactly this feature:

> Sharing needs a hosted instance, moderation and a privacy model that single-tenant
> self-hosting doesn't have — starting it now would stall on infrastructure rather than ship.
> **Applies to:** roadmap decisions, and any PR that proposes a social feature.

`CLAUDE.md` repeats it: *"Do not start it as a side quest."*

Those were good calls and one of the two reasons has now expired — there **is** a hosted
instance, with billing, invites and admin roles. The other reason has not: there is still no
privacy model, and this plan is mostly an attempt to write one.

The thing that is genuinely being spent here is invariant #1. Today tenant isolation is a
property the compiler enforces: every function in `src/lib/data/` takes the owning `userId`
as its first positional argument, so a call site that forgets does not build. After this
change the compiler still enforces *scoping* — you cannot call a data function without
saying which workspace — but it cannot enforce *permission*, because whether you may write
to a workspace you are a member of is a runtime fact. That check has to exist at runtime, in
exactly one place, or it will rot.

Read the rest of this document as a proposal for where that one place is.

---

## What exists today

- **One person is one tenant.** 16 models carry a `userId`. 59 exported functions across
  `src/lib/data/` (2,417 lines) take it as their first positional argument.
- **Invite-only.** An admin invites an email; `acceptInvite` creates the `User`. There is no
  signup policy setting — `SETTING_KEYS` has no key for it.
- **Admins manage accounts, never content.** The 16 `admin_*` tools touch users, invites,
  email and billing. None of them reads a brain.
- **The only sharing that exists is per-document**: `publish_resume` mints an unguessable
  slug and `/r/[slug]` renders that one document with an explicit nine-field `select`. It is
  the single deliberately anonymous read in the codebase.
- **48 direct `db.*` calls live outside the data layer**, in 7 files
  (`(app)/page.tsx`, `(app)/layout.tsx`, `(app)/resumes/page.tsx`, `bootstrap.ts`,
  `settings.ts`, `auth.ts`, `billing.ts`). Most are counts. Each is a place the new scope
  has to reach.
- **There are no tests.** Seven migrations have shipped; every one was verified by hand.

---

## What you asked for

1. Your account becomes a workspace you can invite people into.
2. Someone you invite can instead make their own workspace, and share it or not.
3. Roles you define, with view/edit permissions per area, the way Twenty does it.

(1) and (3) are new. (2) is half-built — separate private accounts already work; what is
missing is self-signup and the idea that one person can be in more than one place.

---

## The shape

### Workspace

```prisma
model Workspace {
  id        String   @id @default(cuid())
  name      String
  /// The member who cannot be removed or demoted. Mirrors SUPER_ADMIN on the instance.
  ownerId   String
  createdAt DateTime @default(now())

  memberships Membership[]
  accessRoles AccessRole[]
  // …and every content relation that used to hang off User
}
```

Every content model swaps `userId` for `workspaceId`, keeping the cascade and the leading
index. `Session` does **not** move — a session belongs to a person. `McpConnection` moves to
*both*: it belongs to a user and points at one workspace (see below).

### Membership

```prisma
model Membership {
  id           String   @id @default(cuid())
  userId       String
  workspaceId  String
  accessRoleId String
  createdAt    DateTime @default(now())

  @@unique([userId, workspaceId])
  @@index([workspaceId])
}
```

### AccessRole — and a name that is already taken

**`Role` is not available.** `model Role` is a job you held, in the brain. Naming the
permission set `Role` would collide with the single most-referenced model in
`src/lib/data/brain.ts` and make every future grep ambiguous. Call it `AccessRole`.

```prisma
enum Access { NONE VIEW EDIT }

model AccessRole {
  id          String @id @default(cuid())
  workspaceId String
  name        String            // "Owner", "Editor", "Coach", or whatever you make
  isOwnerRole Boolean @default(false)   // exactly one per workspace, undeletable

  brain       Access @default(NONE)
  resumes     Access @default(NONE)
  pipeline    Access @default(NONE)
  crm         Access @default(NONE)
  connections Access @default(NONE)

  /// Can add, remove and re-role other members.
  manageMembers Boolean @default(false)
  /// Can mint a public /r/<slug> link. Separate because publishing moves data
  /// outside the workspace entirely, and "can edit" should not imply "can publish".
  publish       Boolean @default(false)

  memberships Membership[]
  @@unique([workspaceId, name])
}
```

Five areas, three levels, two flags. Columns rather than a JSON blob, so the compiler, the
database and the admin screen all agree on the shape, and adding a sixth area is a migration
you cannot forget to handle.

The areas map onto the app's own navigation, which is the thing a person already
understands:

| Area          | Models                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| `brain`       | Profile, Role, Highlight, Education, Project, SkillGroup, Certification, Note |
| `resumes`     | Resume                                                                    |
| `pipeline`    | Application, Activity, Task                                               |
| `crm`         | Company, Contact                                                          |
| `connections` | McpConnection                                                             |

Seeded on workspace creation: **Owner** (EDIT everywhere, both flags, `isOwnerRole`),
**Editor** (EDIT everywhere, no flags), **Viewer** (VIEW everywhere, no flags). You edit
those and add your own; the Owner role is the only one that cannot be deleted or downgraded.

### Scope — what replaces `userId`

This is the load-bearing decision.

```ts
// src/lib/scope.ts
export type Area = "brain" | "resumes" | "pipeline" | "crm" | "connections";

export type Scope = {
  readonly workspaceId: string;
  /** Who is acting. For the audit trail, and for "who published this". */
  readonly actorId: string;
  can(area: Area, level: "VIEW" | "EDIT"): boolean;
  /** Throws. Called at the top of every mutating data function. */
  assert(area: Area, level: "VIEW" | "EDIT"): void;
  readonly canManageMembers: boolean;
  readonly canPublish: boolean;
};
```

Every function in `src/lib/data/` takes `scope: Scope` as its **first positional argument**,
in place of `userId`. Three properties survive intact:

- A call site that forgets still does not compile.
- A `Scope` cannot be constructed from client input — it is built by `resolveScope()` from a
  session cookie or an MCP token, the same two places `requireUser()` and `userByMcpToken()`
  are built from now.
- Queries filter on `scope.workspaceId`, so the shape of every `where` clause barely changes.

What is new: **every mutating function calls `scope.assert(area, "EDIT")` as its first
line, and every read calls `scope.assert(area, "VIEW")`.** Inside the data layer, not at the
call sites — because invariant #2 says the UI and the tools share one data layer, and a check
that lives above it would have to be written twice and would eventually be written once.

`getResumeBySlug` stays exactly as it is: the one function with no scope, an allow-list
`select`, and a comment explaining why.

---

## What changes, by file

| File | Change | Size |
| ---- | ------ | ---- |
| `prisma/schema.prisma` | `Workspace`, `Membership`, `AccessRole`, `Access` enum; `userId` → `workspaceId` on 15 models; `McpConnection` gains `workspaceId` | one migration |
| `prisma/migrations/…_workspaces/` | Additive first, then backfill, then drop. See below. | the risky part |
| `src/lib/scope.ts` | New. `Scope`, `resolveScope(user, workspaceId)`, `systemScope()` for bootstrap. | ~120 lines |
| `src/lib/data/*.ts` | 59 signatures `userId: string` → `scope: Scope`; 59 `assert` calls; `where: { userId }` → `where: { workspaceId: scope.workspaceId }` | mechanical, large |
| `src/lib/data/workspaces.ts` | New. Create, rename, list-for-user, members, access roles, invite-to-workspace. | ~250 lines |
| `src/lib/auth.ts` | `requireUser` gains `requireScope()`; the active workspace id lives in the session row, not a cookie the client can edit. | small |
| `src/server/actions.ts` | 52 call sites swap `requireUser()` for `requireScope()`. | mechanical |
| `src/lib/mcp/handler.ts` | Token resolves to a scope; server instructions gain the workspace name and what this connection may do. | small |
| `src/lib/mcp/tools.ts` | Every handler `ctx.scope` instead of `ctx.userId`; `toolsFor()` filters by permission; new `workspace_*` tools. | 74 handlers, mechanical |
| `src/app/(app)/**` | Workspace switcher in the rail; a Members screen; nav items hidden for areas you cannot see. | new screens |
| 7 files with direct `db.*` | Route through the data layer or take a scope. | audit each |
| `.claude/agents/tenant-auditor.md` | Rewritten. See below. | rewrite |
| `CLAUDE.md` | Invariant #1 rewritten. | rewrite |

---

## The MCP consequences

Rule zero says a feature is not done until it is callable from a conversation, so this is
not an afterthought.

**A connection points at one workspace.** `McpConnection` gains `workspaceId`. The token
resolves to `(user, workspace)` and therefore to a scope, which means no tool needs a
workspace argument and the transport stays stateless. If you are in two workspaces you have
two connection URLs, which is the same shape as "one connection per client" that already
exists and that people already understand.

**`tools/list` is filtered by permission, not refused at call time.** The instance already
does this for admins — `toolsFor()` removes `adminOnly` tools rather than refusing them —
and the reasoning generalises exactly: a connection with `pipeline: VIEW` should not be
shown `move_application_stage` at all. An assistant that cannot see a tool does not try to
use it and then explain the failure to you.

**New tools** (`src/lib/data/workspaces.ts` first, then these):

| Tool | What it does |
| ---- | ------------ |
| `list_workspaces` | The workspaces you are in, with your access role in each. |
| `whoami` | Extended: which workspace this connection is bound to, and what it may do. |
| `list_members` | Who is in this workspace and under which access role. |
| `invite_member` | Invite an email into *this workspace* with a named access role. Requires `manageMembers`. |
| `remove_member` | Requires `manageMembers`. Never removes the owner. |
| `list_access_roles` | The roles defined here and their permissions. |
| `create_access_role` / `update_access_role` | Requires `manageMembers`. Description must say it replaces what you send. |
| `set_member_role` | Move a member onto a different access role. |

Descriptions carry the destructive semantics loudly, per the `mcp-tool` skill:
`update_access_role` **replaces** the permission set, so it must say "read first, modify,
then write back whole" or an assistant will silently drop a permission somebody relied on.

---

## Migration and backfill

There is precedent for this and it is worth copying exactly. The `McpConnection` migration
(2026-08-17) dropped `User.mcpToken` and it worked because it **copied every existing token
into the new table before dropping the column**, then was tested against a database seeded
with old-schema rows, then checked with `prisma migrate diff` for drift.

Same three steps here, in one migration file but three SQL phases:

1. **Add.** Create `Workspace`, `Membership`, `AccessRole`. Add a nullable `workspaceId` to
   all 15 content models plus `McpConnection`.
2. **Backfill.** For every `User`: create a workspace named after them, seed the three
   default access roles, create an Owner membership, and set `workspaceId` on every row that
   carries that user's `userId`. `McpConnection` rows point at the same workspace.
3. **Enforce.** `workspaceId` NOT NULL, foreign keys with `onDelete: Cascade`, indexes, then
   drop `userId` from the 15 content models.

Verification before it goes near the live instance: seed a database from the current schema
with at least two users and content in every model, run the migration, then assert row
counts match per workspace and that no row has a null or crossed `workspaceId`. Write that
as a script and keep it — it is the closest thing to a test this repo will have.

**Reversibility:** phases 1 and 2 are additive and safe to sit on. Phase 3 is the
irreversible one. Ship 1+2, verify against the live database, then ship 3 separately.

---

## Phases

**Phase 1 — workspaces exist, one each, invisible.**
Schema, backfill, `Scope`, the 59 signature changes, the 52 action call sites, the 74 tool
handlers. Nobody can tell anything happened: one workspace each, one Owner membership each,
every permission EDIT. Ship this alone and let it sit for a week.
*Value delivered: none visible. This is the whole cost of the feature paid up front, which
is why it is its own phase.*

**Phase 2 — members and access roles.**
`AccessRole` seeding, the runtime assert, workspace invites, the Members screen, the
`workspace_*` tools, permission-filtered `tools/list`, nav items hidden for areas you cannot
see. **This is the phase that does what you asked for**: you invite a friend into your
workspace as a Viewer and they can see your pipeline and not your brain.

**Phase 3 — more than one workspace, and self-signup.**
A switcher in the rail, `signupMode` in `Setting` (`INVITE_ONLY | OPEN`), self-signup creating
a personal workspace, one person belonging to several. This is the half of your ask about
friends making their own.

**Phase 4 — the things phase 2 will make you want.**
Who-changed-what on shared records (`Activity` already has the shape), per-area empty states
that say "you don't have access to this" rather than showing nothing, and a workspace-level
export.

---

## What it costs

- **Invariant #1 in `CLAUDE.md` gets rewritten.** From "tenant isolation is a compile-time
  property" to something like: *scoping is compile-time — every data function takes `scope`
  first and cannot be called without one; permission is runtime and is asserted inside the
  data layer, never above it.* Anything less precise and the next session will put an
  `assert` in a server action and think the job is done.
- **`tenant-auditor` gets rewritten.** Check #1 becomes "first positional parameter is
  `scope: Scope`". A new check goes in front of everything else: *every exported mutating
  function calls `scope.assert(area, "EDIT")` before its first Prisma call, and every read
  asserts VIEW.* A function that queries by `scope.workspaceId` without asserting is a
  finding, because a Viewer would be able to write.
- **No tests.** 59 functions and 74 tool handlers change mechanically, and mechanical changes
  across that many sites are exactly where a wrong-variable slip hides. The backfill
  verification script above is worth writing whatever else happens.
- **`admin_*` tools need re-reading.** They act on the instance, and the instance now contains
  workspaces. `admin_delete_user` has to decide what happens to a workspace whose owner is
  deleted, and that is not a mechanical answer.

---

## Open decisions — I need your answers before any of this is built

1. **Billing.** Stripe currently drives `User.isActive`: pay, get an invite, get an account.
   If your friend joins *your* workspace, are they a paying seat, or are they free because
   they are consuming your subscription? A workspace with five viewers is either five
   subscriptions or one, and the webhook logic is different in each case. The existing rule
   — *an unattended webhook may only ever touch state it created* — has to survive whichever
   you pick.

2. **Can a member publish?** I have proposed a separate `publish` flag because publishing a
   resume puts it on the open internet under an unguessable URL, and "can edit the pipeline"
   should not silently imply "can publish your resume to the world". Agree, or collapse it
   into EDIT?

3. **Private notes.** `Resume.notes` is *"what you tailored and why. Never printed."* and
   `Note` rows of kind `GUARDRAIL` are your standing instructions to every AI client. Should
   a Viewer see either? My answer is no to both, which means VIEW on `resumes` is not simply
   "the same read with a different check" — a couple of functions need a narrowed `select`
   the way `getResumeBySlug` has one.

4. **Removing a member.** Their memberships go. What about content they created inside your
   workspace — an application they added, a note they wrote? My answer: it stays, because it
   is workspace content, not theirs. Confirm, because the opposite is a defensible reading
   and it is much harder to undo later.

5. **Does an invited member get an MCP connection?** They can already talk to their own
   workspace. Letting them mint a token against yours means an assistant they run has your
   pipeline in context. My answer: yes, but gated on the `connections` area, so it is a
   permission you grant rather than a side effect of membership.

---

## What I would cut from a first version

- **Per-record sharing.** "Share this one application with Dana" is a different feature with
  a different data model, and the unlisted-link primitive already covers the case people
  actually hit.
- **Cross-workspace anything.** No "shared with me" feed, no notifications, no comments.
  Those are the moderation story that the parked decision was right about.
- **Custom areas.** Five fixed areas matching the nav. A permission system where you can
  invent the nouns is a permission system nobody can reason about.
