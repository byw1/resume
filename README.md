# Resume OS

Your career brain, a resume builder, and a job-search CRM — all in one app you host
yourself, wired into Claude so you can just *talk* to it.

- **Brain** — dump everything you know about every job you've had. No length limit, no
  structure required. Numbers, projects, stories, praise, screw-ups. This is the raw
  material every resume gets built from.
- **Resumes** — tailored documents assembled from that material. Defaults to the Harvard
  OCS format; four other templates, live preview, real PDF export, and a shareable link for
  the application forms that want a URL instead of a file.
- **Pipeline** — stages, activity timeline, tasks, and follow-up dates that schedule
  themselves. A toolbar across the top picks the view — a drag-and-drop board, a sortable
  table, or a month calendar of everything that has a date on it — plus the cut and a search.
  Opening an application slides it in from the right, so you keep your place on the board.
- **CRM** — companies and the people at them, as records you can visit. A company page holds
  their website, industry, size and whatever you have learned about them, alongside every
  application and every contact you have there. The website is what puts their logo on the
  pipeline.
- **AI connections** — every person gets their own URL that turns all of the above into
  63 tools any MCP client can call (76 if you're an admin). Claude, Claude Code, ChatGPT,
  Cursor, VS Code and Windsurf all have one-paste setup built into the app.
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

### 6. Connect your AI

Open **Settings** in the app. You already have a connection waiting; hit **Set up**, pick
whichever assistant you use, and the exact steps appear — with the config already filled in
with your URL, ready to copy.

| Client | What you paste |
| --- | --- |
| **Claude** (web, desktop, mobile) | The URL, under Settings → Connectors → Add custom connector |
| **Claude Code** | `claude mcp add --transport http --scope user resume-os "<your URL>"` |
| **ChatGPT** | The URL, as a custom connector |
| **Cursor** | A three-line block in `~/.cursor/mcp.json` |
| **VS Code** | One `code --add-mcp` command, or `.vscode/mcp.json` |
| **Windsurf** | A three-line block in `~/.codeium/windsurf/mcp_config.json` |
| **Anything else** | A standard `streamable-http` entry — or `mcp-remote` if it only speaks stdio |

Hit **Test** next to any connection and the app calls its own endpoint the way a client
would, then tells you how many tools answered — 52, or 64 if you're an admin.

#### One connection per client

**New connection** gives each assistant its own URL. That matters more than it sounds:

- Your laptop dies, or you paste a URL somewhere you shouldn't — **Rotate** or
  **Disconnect** that one client. Everything else stays connected.
- Each row shows when it was last used and what called in, so "is it actually working?"
  stops being a guess.

> A connection URL contains a secret token tied to your account alone — it can't reach
> anyone else's data. Anyone who has it can read and write *yours*, though, so treat it like
> a password.

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

## What your AI can do once it's connected

63 tools across the four areas. The seven workflows below are among them: they're published
as tools as well as prompts, because prompt support is optional in MCP clients and tool
support isn't. Call one and it hands back a step-by-step plan that it then follows.
Admins get 13 more tools — and members never even see those in the tool list, so nobody is
tempted by a permission they don't have.

| Workflow | What it does |
| --- | --- |
| **Tailor a resume to a job** | Reads a posting, mines your brain for real evidence, drafts and saves a tailored resume, and tells you what it couldn't back up. |
| **Mine a brain dump into highlights** | Turns a raw, rambling brain dump into polished, reusable resume bullets. |
| **Weekly pipeline review** | What's stalled, who needs chasing, what to do next — with the follow-up messages drafted. |
| **Research a company into the CRM** | Gathers what's known, works out what's missing, and writes it back to their record without flattening what was already there. |
| **Prepare for an interview** | Pulls the posting, the timeline, the company research, the people involved and your own evidence into one prep sheet. |
| **Log what happened this week** | You ramble; it files everything to the right role, application, or note. |
| **Invite and onboard someone** *(admin)* | Invites a person, hands you the link if email isn't set up, and drafts the message to send them. |

Every client is instructed never to invent experience, employers, dates, or metrics. If there's
no evidence in your brain for something a job asks for, it says so instead of making it up.

The **Docs** page inside the app — it's in the profile menu, next to Settings — lists every tool
and workflow, generated from the server itself rather than written out, so it can't drift. It
also carries three Claude Skills you can install, which teach an assistant the rules of this
place before you have to.

### The four areas

**Brain** — `search_brain`, `get_brain_snapshot`, roles with unlimited brain dumps
(`append_role_brain_dump` adds without overwriting), reusable highlights, notes and standing
rules, plus education, projects, skills and certifications, which
`create_extra` / `update_extra` / `delete_extra` maintain.

**Resumes** — `get_resume_format` describes the document shape, then `create_resume` /
`update_resume` / `duplicate_resume` build and tailor them. `preview_resume_text` renders a
draft and estimates page count *without* saving, so Claude can check length before
committing. `publish_resume` turns one into a shareable link and hands back the URL;
`unpublish_resume` destroys it. `export_resume_pdf` renders a real PDF server-side and
reports the page count it actually came out to.

**Pipeline** — applications and stages, an activity timeline, tasks, `list_follow_ups` for
what's overdue, `list_schedule` for a whole window of dated work at once, and `pipeline_stats`
for the shape of your search.

**CRM** — `list_companies` / `get_company` / `create_company` / `update_company` /
`delete_company` for the companies you're talking to, and `get_contact` / `update_contact` /
`delete_contact` for the people at them. A company's `website` is what puts their logo on your
pipeline. Deleting one refuses while applications still point at it.

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

## Sharing a resume as a link

Application forms keep asking for a URL, not a file. Open a resume → **Share** → **Create a
link**, and you get an address like:

```
https://your-app.up.railway.app/r/staff-engineer-stripe-k7m2qx4bnp8t
```

Anyone with it can read that one resume without signing in. Ask Claude instead and you skip
the browser entirely: *"publish my Stripe resume and give me the link."*

The privacy model is the address itself, and nothing else. It's long and random, so it can't
be guessed or walked, the page tells search engines not to index it, and it's listed nowhere.
Your private notes on the resume aren't on the public page. That's the whole model — there
are no per-viewer permissions and no passwords, because everyone you'd send this to is
someone you already decided to send it to.

**Withdraw** destroys the address rather than pausing it. The page starts returning "not
found" for everyone immediately, and sharing that resume again gives you a different link —
so a URL you regret sending stays dead.

## Getting a PDF

Open a resume → **PDF**. The file downloads. There is no print dialog and no margin setting
to get wrong.

The server renders the same page you'd have printed by hand, so what you see is what you
get: exactly 8.5in × 11in with the Harvard template's half-inch margins. The output is real
selectable text, not an image, so applicant tracking systems can read it.

Ask Claude instead and you get the page count with it — *"export my Stripe resume"* returns
a download link and tells you it came out to one page, which is the thing you actually
wanted to know before sending it.

No webfont is fetched: the serif stack is Tinos → Times New Roman → Liberation Serif, which
are metrically identical, so the document renders the same on macOS, Windows and Linux with
nothing to download.

<details>
<summary>If your host has no headless browser</summary>

Server-side rendering needs a Chromium on the machine. Railway's default image doesn't ship
one, so on a stock deploy the **PDF** button reports that and the fallback still works:
**⋯ → Open print view**, then your browser's **Save as PDF** with margins set to **None**.
Same document, one more step. `export_resume_pdf` says the same thing rather than failing
silently.

To get the one-click version the image needs a Chromium and a Times-metric serif, and then
`PDF_CHROMIUM_PATH` pointed at the browser (or one of the usual paths, which are checked
automatically). A Dockerfile installing `chromium`, `fonts-croscore` and `fonts-liberation`
gets there — that part is proven — but Railway's healthcheck did not come up on the
resulting container, so it isn't the shipped default yet.

</details>

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
the UI, so anything an assistant writes shows up in the app immediately and vice versa.

The token lives in the URL path (`/api/mcp/<token>`) because that is the one shape every
client can express — no headers to configure, no OAuth discovery. Clients that insist on a
header can send `Authorization: Bearer <token>` to `/api/mcp` instead; both routes resolve
to the same connection. Setup recipes are data, in `src/lib/mcp/clients.ts` — adding support
for a new client is one entry in that array, no UI changes.
