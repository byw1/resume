---
title: What an applicant tracking system actually does with your resume
description: An ATS stores and searches candidates. It very rarely auto-rejects on keywords, and the 75% figure everyone quotes has no source. Here is what the software really does, and the one place it genuinely loses people.
date: 2026-08-29
slug: what-an-ats-actually-does
keyword: how does an ATS read your resume
---

An applicant tracking system is a database with a hiring workflow attached. It takes the file you upload, tries to pull structured fields out of it — name, email, employers, dates, titles, education — and files the result where a recruiter can search it. That is the whole job. It stores, it searches, it moves candidates between stages, and it records what happened.

What it almost never does is read your resume, score it against the job description, and bin it before a person looks. That belief is so widespread it shapes how millions of people write, and it is mostly wrong.

## The 75% figure has no source

You have seen the claim: an ATS rejects three-quarters of resumes before a human sees them. It appears in career advice, on resume-tool landing pages, and in the sales material of companies selling you a fix for it.

Nobody who repeats it cites a study. Follow the citations and they loop back to other articles repeating it, or to vendors with something to sell. There is no dataset behind it.

That matters because the myth produces bad behaviour. If you believe a machine is scoring your keyword density, you start writing for the machine — stuffing skills sections, matching phrasing word for word, padding with terms you would struggle to defend. The result reads badly to the human who does open it, which is the actual gate.

## What the software is genuinely doing

The major systems — Greenhouse, Lever, Ashby, Workday, iCIMS, Taleo and the rest — differ enormously in age and quality, but the core loop is the same.

**It parses.** Your file gets converted into fields. This is the step that can go wrong, and we will come back to it.

**It stores.** You become a row. Most systems keep you indefinitely, which is why a company you applied to three years ago can resurface your application for a new opening.

**It searches.** A recruiter with 400 applicants types "Kubernetes" or "FP&A" or "Spanish" into a box and filters. This is the closest thing to keyword matching that actually happens, and note what it is: a human choosing a term and looking at who comes back. Not a robot deciding your fate.

**It ranks, sometimes.** Some systems will surface a match score. Recruiters vary wildly in how much they trust it, and in most teams it is a sorting hint rather than a decision.

**It records.** Stage changes, interview feedback, notes, rejection reasons. This is the part most candidates never think about and it is the most consequential: there is a written record of you at that company, and you cannot see it.

## Where automatic rejection does happen

Automatic rejection is real. It just usually is not the resume.

It is the knockout questions on the application form — the ones you answered yourself. Are you authorised to work in this country. Do you have five years of experience with this thing. Are you within commuting distance of this office. Will you require sponsorship. A recruiter can configure any of those to filter automatically, and if you answered in a way that trips the filter, you are out before anything is read.

That is a much more tractable problem than keyword density. Read the form. Answer carefully. If a question has a free-text box next to a hard filter, use it.

## The one place the resume genuinely loses

Parsing.

The software has to turn a visual document back into structured data, and it is guessing. When it guesses wrong, your work history arrives mangled — dates attached to the wrong employer, a job title swallowed, an entire column missing. A recruiter searching for your actual skills will not find you, and if they open your profile they see nonsense.

The layouts that break parsers are predictable:

- **Two columns.** The parser reads in one order; you designed for another. A sidebar of skills can end up interleaved with your job history line by line.
- **Tables.** Especially nested ones, and especially for dates. Some parsers flatten them into unreadable runs.
- **Text inside images.** Not text. Invisible.
- **Headers and footers.** Some parsers skip them entirely. Putting your phone number and email there is a real way to be uncontactable.
- **Text boxes and shapes.** Same problem as images in many cases.
- **Unusual fonts and ligatures.** Rarer now, but decorative fonts can produce garbled extraction.

None of this is about beauty. A single-column document in a normal typeface, with real selectable text, survives almost anything. It is also the format that reads fastest to a human, which is the other reason to use it.

## What to do about it, concretely

**Check what a parser sees.** Open your PDF, select all, copy, and paste into a plain text editor. That rough text is close to what the software gets. If the order is scrambled, if dates float away from employers, if whole sections vanish — that is what a recruiter's search is working against. Fix the layout, not the words.

**Use one column.** [The Harvard format](/resources/harvard-resume-format/) exists for exactly this reason and has for decades.

**Put contact details in the body**, not the header.

**Send a PDF unless told otherwise**, and make sure it is a text PDF rather than an exported image. If a form specifically asks for .docx, give it .docx — some older parsers genuinely do better with it.

**Use the words the posting uses**, but only for things that are true of you. If they say "demand planning" and you have called it "forecasting" your whole career, say demand planning. That is not gaming a machine; that is being findable by the human searching. Claiming a skill you do not have to satisfy an imagined algorithm is a different act, and it falls apart in the first interview.

## The asymmetry worth noticing

Step back from the mechanics and there is a structural point. The company has software that has been keeping a record on you since the first time you applied: what you sent, when, against which requisition, what the recruiter typed afterwards. You have a folder of PDFs and a memory of the last three years that gets vaguer every week.

You will not get access to their record. You can keep your own — every application, which version you sent, who you spoke to, what they said, and what you actually did at each job in enough detail to write from later. That is the gap that costs people jobs, far more often than any keyword score.
