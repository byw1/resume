# Resume OS

Your career brain, a resume builder, and a job-search CRM — all in one app you host
yourself, wired into Claude so you can just *talk* to it.

- **Brain** — dump everything you know about every job you've had. No length limit, no
  structure required. Numbers, projects, stories, praise, screw-ups. This is the raw
  material every resume gets built from.
- **Resumes** — tailored documents assembled from that material. Four templates, live
  preview, real PDF export.
- **Pipeline** — a lightweight CRM for the search: stages, drag-and-drop board, activity
  timeline, contacts, tasks, and follow-up dates that schedule themselves.
- **Claude connection** — one URL turns all of the above into 43 tools Claude can call.

> "Here's everything I did at Vertex last quarter — file it."
> "Tailor my resume to this posting."
> "What do I need to follow up on this week?"

---

## Deploy it on Railway

Six steps, two variables, about five minutes. You don't need to touch a terminal.

### 1. Create the project

Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** →
pick this repository. Railway starts building immediately.

The build will succeed, but the app won't start yet — it has nowhere to store anything.
You'll see it crash and retry. That's expected. Steps 2 and 3 fix it, and Railway
redeploys on its own the moment you add the variables.

### 2. Add a database

In the same project, click **+ Create** → **Database** → **Add PostgreSQL**.

Railway names the service **Postgres**. Leave it alone; you never have to configure it.

### 3. Add the two variables

Click your **app service** (not the Postgres one) → **Variables** → **New Variable**, and
add these two:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_PASSWORD` | anything you'll remember — this is your login |

Type the `DATABASE_URL` value exactly as shown, including the `${{ }}`. Railway
autocompletes it as you type. It's a *reference*, so if the database credentials ever
rotate, your app follows automatically.

### 4. Give it a web address

**Settings** → **Networking** → **Generate Domain**. You'll get something like
`resume-os-production.up.railway.app`.

### 5. Log in

Open that URL. Enter the `APP_PASSWORD` you chose. That's your app.

The database tables are created automatically on the first boot — there's no migration
step for you to run, now or after any future update.

### 6. Connect Claude

Go to **Settings** inside the app and hit **Copy** on the connection URL. Then in Claude:

**Settings → Connectors → Add custom connector** → name it `Resume OS` → paste the URL →
save.

That's it. Claude can now read and write your brain, your resumes, and your pipeline.

> The connection URL contains a secret token. Anyone who has it can read and write your
> data, so don't paste it anywhere public. If you ever do, hit **Rotate** on the Settings
> page and re-paste the new URL into Claude.

---

## What Claude can do once it's connected

43 tools across the three areas, plus four ready-made workflows that show up as slash
commands:

| Workflow | What it does |
| --- | --- |
| **Tailor a resume to a job** | Reads a posting, mines your brain for real evidence, drafts and saves a tailored resume, and tells you what it couldn't back up. |
| **Mine a brain dump into highlights** | Turns a raw, rambling brain dump into polished, reusable resume bullets. |
| **Weekly pipeline review** | What's stalled, who needs chasing, what to do next — with the follow-up messages drafted. |
| **Log what happened this week** | You ramble; it files everything to the right role, application, or note. |

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

---

## Getting a PDF

Open a resume → **PDF** → your browser's print dialog → **Save as PDF**, with margins set
to **None**.

The page is laid out at exactly 8.5in × 11in, so what you see is what you get. The output
is real selectable text, not an image, so applicant tracking systems can read it.

---

## Notes

- **Everything autosaves.** There is no save button anywhere. A small indicator tells you
  when a change has landed.
- **`⌘K` / `Ctrl+K`** opens a search palette that jumps to any role, resume, or company.
- **Follow-up dates set themselves** when an application changes stage — 7 days after
  applying, 4 after a screen, 3 after a final round. Override any of them by hand.
- **Dark and light** both supported; toggle is top-right.

---

## Running it locally

You need Node 20+ and a Postgres database.

```bash
cp .env.example .env      # then edit DATABASE_URL and APP_PASSWORD
npm install
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000.

## How it's built

Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Framer Motion · Prisma ·
PostgreSQL.

The MCP server lives in `src/lib/mcp/` and speaks the Streamable HTTP transport directly —
no session state, so it survives restarts and replicas without reconnecting. Tools are
defined once in `src/lib/mcp/tools.ts` and share the same data layer (`src/lib/data/`) as
the UI, so anything Claude writes shows up in the app immediately and vice versa.
