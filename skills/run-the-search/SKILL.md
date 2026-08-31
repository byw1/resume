---
name: run-the-search
description: Running a job search day to day in a connected Hired instance — capturing a posting, logging what happened, researching a company, chasing follow-ups, and the weekly review. Use when someone mentions applying somewhere, hearing back, a call or interview they had, a company they are curious about, or asks what they should be doing this week.
---

# Running the search

A job search decays into a spreadsheet nobody updates because logging feels like
admin. The way to stop that is to make logging a side effect of talking about what
happened, which is exactly what a conversation is good at.

## Capturing something new

When they mention a job they are interested in:

`create_application` with `company`, `roleTitle`, the full posting in
`jobDescription`, and `stage` — `WISHLIST` if they are still deciding, `APPLIED` if
they have sent it. Pass `companyWebsite` if you know the company's own domain; it is
what puts their logo in the pipeline and it costs nothing.

Paste the **whole** posting into `jobDescription`. It is what a resume gets tailored
against later, and postings disappear from the web the moment the role is filled.

Follow-up dates schedule themselves from the stage — do not set `nextFollowUpAt`
unless they asked for a specific date.

## Logging what happened

Anything that happened with a company is `log_activity` on the application:

- `CALL` / `INTERVIEW` — who, how long, what was asked, how it felt
- `EMAIL_SENT` / `EMAIL_RECEIVED` — the substance, not the pleasantries
- `NOTE` — anything else worth remembering
- `REJECTION` / `OFFER` — and then move the stage

Write the body the way they said it. "Recruiter said the team is 6 people and they
want someone to own billing end to end" is worth more in three months than "had a
call".

Moving a stage is `move_application_stage`, which writes its own timeline entry and
resets the follow-up date. Do not do both.

If they mention a person — a recruiter, a hiring manager, someone who referred them —
that is a `create_contact` with `applicationId` and `companies` set — a list, because
someone can represent more than one company. Names disappear fast and they are the
thing that matters most later.

## Researching a company

`list_companies` to find the id, then `get_company`. It comes back with everything on
file plus every application and contact there.

To add research, **read first**: `update_company` replaces the `notes` field rather
than appending, so `get_company`, combine what is there with what is new, then write
the whole thing back. Losing someone's research because you wrote over it is the worst
outcome available in this tool.

Worth recording, because it is what they will want the night before an interview:

- What the company actually does and how it makes money
- The interview loop, if they know it
- Who they know there
- Why they do or do not want it — the honest version

Set `website` to the company's **own** domain. A Greenhouse or Ashby link is the job
board, not the employer.

## Chasing

`list_follow_ups` is what is already due. `list_schedule(from, to)` is the whole
window — follow-ups, task deadlines and logged activity together — and it is the right
call for "what does next week look like".

When something is overdue, do not just report it. Draft the actual message, using the
timeline so it refers to what was said. A follow-up that mentions the thing the
recruiter told them is a follow-up that gets answered.

## The weekly review

1. `pipeline_stats` — the shape of the search.
2. `list_follow_ups` with `withinDays: 7`.
3. `list_applications` and `list_activities` — what has actually moved.
4. `list_tasks` with `done: false`.

Then say, in this order:

- Where the search stands, in two lines.
- **What is stalled**: applied more than ten days ago with nothing logged since, or a
  follow-up date that has passed. Name the company each time.
- What to do this week, most important first, each tied to a specific company.
- The drafted messages for anything overdue.
- `create_task` for each action, with a due date.

Be direct about the bad news. "Four of your six applications have had no response in
two weeks — that is a signal about the resume or the targeting, not about you" is more
useful than a tidy status table.

## What not to do

- Do not log the same thing twice — check `list_activities` for the application first.
- Do not move a stage they did not tell you about. An interview being scheduled is not
  an interview happening.
- Do not create a company record just to have one. Applications create their company
  automatically; `create_company` is for somewhere they are researching before there
  is an application.
