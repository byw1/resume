# Resume OS

Your career brain, a resume builder, and a job-search CRM — all in one app you host
yourself, wired into Claude so you can just *talk* to it.

- **Brain** — dump everything you know about every job you've had. No length limit, no
  structure required. Numbers, projects, stories, praise, screw-ups. This is the raw
  material every resume gets built from.
- **Resumes** — tailored documents assembled from that material. Defaults to the Harvard
  OCS format; four other templates, live preview, real PDF export.
- **Pipeline** — a lightweight CRM for the search: stages, drag-and-drop board, activity
  timeline, contacts, tasks, and follow-up dates that schedule themselves.
- **Claude connection** — every person gets their own URL that turns all of the above into
  44 tools Claude can call (55 if you're an admin).
- **Multi-user** — invite whoever you like. Each person gets a completely private workspace;
  admins manage accounts but never see anyone's brain, resumes or applications.

> "Here's everything I did at Vertex last quarter — file it."
> "Tailor my resume to this posting."
> "What do I need to follow up on this week?"

---

## Self-host it on Railway

**One variable, five minutes, no terminal.** You don't invent a password, run a migration,
or configure anything — the app provisions itself on first boot.

### 1. Create the project

Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** →
pick this repository. Railway starts building immediately.

The build will succeed, but the app won't start yet — it has nowhere to store anything.
You'll see it crash and retry. That's expected; the next two steps fix it, and Railway
redeploys on its own.

### 2. Add a database

In the same project, click **+ Create** → **Database** → **Add PostgreSQL**.

Railway names the service **Postgres**. Leave it alone; you never have to configure it.

### 3. Point the app at it

Click your **app service** (not the Postgres one) → **Variables** → **New Variable**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |

Type it exactly as shown, `${{ }}` included — Railway autocompletes it. It's a *reference*,
so if the database credentials ever rotate, your app follows automatically.

That's the only variable. Everything else is configured inside the app.

### 4. Give it a web address

**Settings** → **Networking** → **Generate Domain**. You'll get something like
`resume-os-production.up.railway.app`.

### 5. Get your password from the logs

On first boot the app creates your owner account and prints the credentials once:

```
╔══════════════════════════════════════════════════════════════╗
║ Resume OS is ready — this is your owner account.             ║
║                                                              ║
║   Sign in   https://resume-os-production.up.railway.app      ║
║   Email     owner@localhost                                  ║
║   Password  quartz-meadow-falcon-7391                        ║
║                                                              ║
║   This password was generated for you and is shown ONCE.     ║
╚══════════════════════════════════════════════════════════════╝
```

Open the **Deploy Logs** tab on your app service and scroll to the top of the latest
deploy. Copy the password, sign in, then change your email and password from **Settings**.

Database tables are created automatically on every boot — there's no migration step for you
to run, now or after any future update.

<details>
<summary>Optional variables</summary>

| Variable | What it does |
| --- | --- |
| `ADMIN_EMAIL` | Use this address for the owner account instead of `owner@localhost`. |
| `APP_PASSWORD` | Use this as the owner's first password instead of a generated one. |
| `RESET_OWNER_PASSWORD` | Set to `1` and redeploy to generate a fresh owner password and print it again. Remove the variable afterwards. |

</details>

### 6. Connect Claude

Go to **Settings** inside the app and hit **Copy** on your connection URL. Then in Claude:

**Settings → Connectors → Add custom connector** → name it `Resume OS` → paste the URL →
save.

That's it. Claude can now read and write your brain, your resumes, and your pipeline.

> The connection URL contains a secret token tied to your account alone — it can't reach
> anyone else's data. Anyone who has it can read and write *yours*, though, so don't paste
> it anywhere public. If you ever do, hit **Rotate** on the Settings page and re-paste the
> new URL into Claude.

---

## Inviting other people

**Admin → Invites** → type an email → **Send invite**. They get a link, pick a password, and
land in their own empty workspace.

Email is optional. Until you set up Resend, creating an invite gives you a link to send
however you like — it stays valid for 14 days. Nothing is blocked on email being configured.

### Roles

| Role | Can do |
| --- | --- |
| **Owner** | Everything. Created at setup, can't be demoted or deleted. One per instance. |
| **Admin** | Invite people, suspend/delete members, configure email. |
| **Member** | Their own workspace. Never sees the admin area. |

Admins manage *accounts*, not *content*. There is no way — through the UI or through
Claude — for one person to read another's brain, resumes or applications. That's enforced
at the data layer: every query is scoped by owner, and it's a required argument the compiler
won't let a caller omit.

### Setting up email (Resend)

**Admin → Email**:

1. Make a free account at [resend.com](https://resend.com).
2. Add and verify the domain you want to send from.
3. Create an API key, paste it in, and set a from address on that domain.
4. Save, then **Send test** to prove it works — if it fails you get Resend's exact reason,
   which is almost always an unverified domain.

You can do all of this by talking to Claude instead: *"is email set up? configure Resend with
this key and send a test."*

---

## What Claude can do once it's connected

44 tools across the three areas, plus ready-made workflows that show up as slash commands.
Admins get 11 more tools and one more workflow — and members never even see those in the
tool list, so nobody is tempted by a permission they don't have.

| Workflow | What it does |
| --- | --- |
| **Tailor a resume to a job** | Reads a posting, mines your brain for real evidence, drafts and saves a tailored resume, and tells you what it couldn't back up. |
| **Mine a brain dump into highlights** | Turns a raw, rambling brain dump into polished, reusable resume bullets. |
| **Weekly pipeline review** | What's stalled, who needs chasing, what to do next — with the follow-up messages drafted. |
| **Log what happened this week** | You ramble; it files everything to the right role, application, or note. |
| **Invite and onboard someone** *(admin)* | Invites a person, hands you the link if email isn't set up, and drafts the message to send them. |

Claude is instructed never to invent experience, employers, dates, or metrics. If there's
no evidence in your brain for something a job asks for, it says so instead of making it up.

### The three areas

**Brain** — `search_brain`, `get_brain_snapshot`, roles with unlimited brain dumps
(`append_role_brain_dump` adds without overwriting), reusable highlights, free-form notes,
education, projects, skills, certifications.

**Resumes** — `get_resume_format` describes the document shape, then `create_resume` /
`update_resume` / `duplicate_resume` build and tailor them. `preview_resume_text` renders a
draft and estimates page count *without* saving, so Claude can check length before
committing.

**Pipeline** — applications and stages, an activity timeline, contacts, tasks,
`list_follow_ups` for what's overdue, and `pipeline_stats` for the shape of your search.

**Admin** *(admins only)* — `admin_list_users`, `admin_invite_user`, `admin_set_user_role`,
`admin_set_user_active`, `admin_delete_user`, `admin_instance_stats`, plus
`admin_get_email_config` / `admin_set_email_config` / `admin_send_test_email` for wiring up
Resend without leaving the conversation. These act on accounts and instance settings only —
none of them can read another person's content.

---

## The Harvard template

New resumes use the Harvard OCS format by default — the one Harvard's career office hands
out, and the one recruiters have read ten thousand times:

- Times-metric serif, everything at one size (10pt body, 11pt name and headings)
- Name and section headings centred over full-width rules
- Each entry is two justified lines: **organisation** / location, then **role** / dates
- Black and white, half-inch margins, disc bullets indented half an inch
- No accent colours, no columns, nothing an applicant tracking system can trip over

Because it leads with the organisation, fill in **both** company and title on every entry —
Claude is told to do this. For a *Leadership & Activities* section, add an Experience-kind
section and just rename the heading; organisation, role, location and dates all lay out
correctly.

The format is a starting point, not a cage. The Design menu (palette icon in the editor)
switches template, font, accent, size, leading and margins per resume, and the ⌃/⌄ buttons
on each section reorder them. Harvard's own convention puts Education first — that's right
for students and recent graduates, and wrong for most people with real work history, so the
default order leads with Experience.

The other templates — Classic, Modern, Compact, Editorial — are all still there.

## Getting a PDF

Open a resume → **PDF** → your browser's print dialog → **Save as PDF**, with margins set
to **None**.

The page is laid out at exactly 8.5in × 11in with the Harvard template's half-inch margins,
so what you see is what you get. The output is real selectable text, not an image, so
applicant tracking systems can read it.

No webfont is fetched: the serif stack is Tinos → Times New Roman → Liberation Serif, which
are metrically identical, so the document renders the same on macOS, Windows and Linux with
nothing to download.

---

## Notes

- **Everything autosaves.** There is no save button anywhere. A small indicator tells you
  when a change has landed.
- **`⌘K` / `Ctrl+K`** opens a search palette that jumps to any role, resume, or company.
- **Follow-up dates set themselves** when an application changes stage — 7 days after
  applying, 4 after a screen, 3 after a final round. Override any of them by hand.
- **Dark and light** both supported; toggle is top-right.
- **Suspending someone** signs them out everywhere and kills their Claude connection
  immediately — their data is kept. Deleting them removes it all.

---

## Locked out?

Add `RESET_OWNER_PASSWORD=1` to your app service's variables and redeploy. The app prints a
fresh owner password to the logs. Remove the variable afterwards, or it resets again on the
next deploy.

---

## Running it locally

You need Node 20+ and a Postgres database.

```bash
cp .env.example .env      # only DATABASE_URL is required
npm install
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000. Your owner password is printed in the terminal on first start.

## Contributing

Issues and pull requests are welcome.

```bash
npm run typecheck   # tsc, no emit
npm run build       # production build
```

The two things worth knowing before changing anything:

1. **Tenant isolation is a compile-time property.** Every function in `src/lib/data/` takes
   the owning `userId` as its first argument, and every query filters on it. Don't add a
   data function without one — the whole safety story rests on the compiler rejecting
   unscoped calls.
2. **The MCP tools and the UI share one data layer.** Anything you add in `src/lib/data/`
   can be exposed to both; don't fork the logic.

## License

MIT — see [LICENSE](LICENSE).

## How it's built

Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Framer Motion · Prisma ·
PostgreSQL.

The MCP server lives in `src/lib/mcp/` and speaks the Streamable HTTP transport directly —
no session state, so it survives restarts and replicas without reconnecting. Tools are
defined once in `src/lib/mcp/tools.ts` and share the same data layer (`src/lib/data/`) as
the UI, so anything Claude writes shows up in the app immediately and vice versa.
