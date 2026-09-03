# The resources section

A design, not a decision. Nothing here is built. Written 2026-09-03, against four live posts
and `tools/build-site.mjs` as it stands.

## Where it stands

The four posts are worth keeping, and two of them take a position that costs the author
something — the 75% auto-reject figure has no source, and STAR does not fit the object it is
taught for. That is the rarest thing on this SERP and it is the whole asset.

The generator is sound and small: no dependencies, nav lifted off the landing page so it cannot
drift, sitemap, feed, `Article` and `BreadcrumbList` schema, a filterable hub. What it cannot do
is the thing the next twelve posts need.

Gaps, in the order they will hurt:

- **No tables.** The Markdown subset has code, quotes, lists, headings and rules. No comparison
  is writable without a table, and a table is the shape an AI answer lifts most reliably.
- **No updated date.** `dateModified` is `datePublished`, and anything about pricing rots
  invisibly.
- **Two of the four kinds are declared and unused.** Nothing is a `template`; nothing is a `tool`.
- **`related` is the two most recent other posts.** Arbitrary at four and misleading at forty,
  on the strongest internal-link surface the site has.
- One shared OG image, and one author line with no page behind it.

## The bet

Search `best job application tracker 2026` and you get eight pages by eight vendors, each
ranking its own product first, none of which has been used to apply for a job. The incentive is
visible from the first paragraph.

The traffic maths makes that a better opening than it used to be. Around 60% of searches end
without a click, and when an AI Overview is present the top organic result loses roughly half
its click-through. Ranking first for an informational query is worth less than it was; being the
source an answer is built out of is worth more, and those are pages that are specific,
checkable, and say something the other nine results cannot be paraphrased into.

So: be the only page in this category that has actually used the things it writes about, and
that says when a competitor is the better answer. Not generosity — the only defensible position
on a page where everyone else's incentive is obvious, and the one that survives summarisation,
because "they recommend the tool that isn't theirs" is a fact worth repeating.

## Five house rules, published at /resources/how-this-is-written/

Linked from every comparison. It is the trust artifact, and it is what keeps the section honest
on the day a tool offers an affiliate deal.

1. **No affiliate links, no sponsored placements, no exceptions.** Said in the same sentence
   every time.
2. **Every tool page carries a "when this beats Hired" section, and it has to be true.** A
   template field, not a habit, so it cannot be quietly dropped on the one comparison where it
   stings.
3. **Nothing about a product is published without a date it was last checked.** Free tiers move
   every few months, and stale pricing is the fastest way to lose a reader who can see it.
4. **If a spreadsheet is the right answer, say so and hand over the spreadsheet.** Under about
   fifteen applications it is. Giving it away is the proof the section is not a funnel.
5. **No number without a source, and corrections stay visible on the page.** The 75% post already
   works this way.

## Five lines of content

### 1. The ATS field guide (`article`) — the flagship

Everyone writes "how to beat the ATS". Nobody writes what it is like to *apply through* each
one. One page per system, on a fixed spec: what the form asks for, whether it parses your file
and whether you can correct the fields afterwards, whether it forces an account, whether it will
take a link, whether the cover letter is really optional, what each status label means and which
mean nothing, whether you are told when you are rejected, how long they keep you, and the known
parse failures.

Greenhouse, Lever, Ashby, Workday, iCIMS, Taleo, SuccessFactors, Workable, SmartRecruiters. Nine
pages and a hub.

The best fit on this list between what only this site can write and what people are typing —
`how to apply on workday`, `greenhouse application status`, `icims rejection email` — and it is
the product's literal argument: theirs keeps a file on you, so here is what is in it. `/r/[slug]`
gets its mention on every page where a form takes a URL, without being sold.

### 2. Tool comparisons (`article`), in three shapes

- **One canonical table.** "Every job-search tool we have tried" — a one-line verdict per row, a
  checked-on date per row, honest "do not bother" rows. The page an AI answer lifts.
- **One page per tool**, on a fixed spec: what it is, what it costs today, what it is genuinely
  best at, where it falls down, who should not use it, and what happens to your data. That last
  section is the one nobody else writes, and it makes the case for self-hosting without the site
  having to make it.
- **Head-to-heads** for matchups people search — Teal vs Huntr, Huntr vs Simplify, tracker vs
  spreadsheet — written as a third party rather than a contestant.

Write the `Hired vs` pages last, on the same template as everything else, and publish at least
two where the honest answer is "not us". The loudest one available: Simplify's autofill extension
does a thing Hired does not do and should not do. Say so in a headline.

### 3. Free things that need no account (`tool`, `template`)

The two unused kinds. Start with the parse check, because it is already built:
`src/lib/resume-parse.ts` is a pure heuristic extractor with no dependencies, written to run on
every keystroke without a round trip. Paste a resume, see the fields a parser pulls out and the
lines it could not place. The ATS argument made concrete, nothing asked of the visitor, and the
strongest natural link magnet here.

One constraint to decide: the static site cannot run TypeScript. Either the tool lives at
`app.hired.tools/parse-check` and is linked from here, or the pure function is bundled to one
client-side script the generator inlines. Either way the page says plainly that it is a
heuristic and not Workday's parser — that honesty is the point of the tool.

Then: the tracker spreadsheet, the Harvard format as a real `.docx`, the four follow-up emails
with the reasoning, and an interview debrief template, which is exactly the raw material Me is
for.

### 4. The people worth listening to (`watch`)

The Ethan Evans post is the prototype; make it a category. Not a link dump — a reviewed
directory: who they are, what they actually did that makes them credible, what they are good on,
and where you would argue. The last field is what separates it from every "top 20 career
coaches" page in existence.

### 5. Original research (a fifth kind, `study`)

Hired records every application, stage change and date, and nobody else writing in this category
has a dataset at all. Even n=1, honestly reported and labelled as one person's search, beats a
SERP of pages citing each other.

Two to start: **"Sixty applications through nine systems"** — response rates, time to first reply
by ATS, how many never replied. And **"what nine parsers did to the same resume"** — same content,
one column and two, run through each and published side by side; a screenshot post that travels
on its own.

Rule stated up front: never aggregate another user's data without explicit consent, and never
anything but aggregate. The product's whole posture depends on that being visibly true.

## What the generator needs

Roughly in order; the first three block the rest.

| Change | Why | Where |
| --- | --- | --- |
| Pipe tables | No comparison is writable without one. Wrap in an `overflow-x` container. | `markdown()` |
| `updated:` frontmatter | Feeds `dateModified` and prints "Checked 12 September 2026". Rule 3 has nowhere to live without it. | `parse()`, `postPage()` |
| `topic:` and explicit `related:` | Cluster the hub, and make internal links mean something. | `hubPage()`, `postPage()` |
| Schema per kind | `SoftwareApplication` + `Review` on tool pages, `ItemList` on the comparison hub, `FAQPage` from a `## FAQ` heading, `HowTo` where a post is genuinely steps. | `postPage()` |
| An author page with `Person` schema | One bio line with nothing behind it is the weakest signal on the page. Career advice is judged on who is giving it. | new `authorPage()` |
| A lead-answer convention | First forty words under a question-shaped H2, liftable whole. When most searches end without a click, being quoted is the outcome. | editorial |
| Per-post OG images | Every page shares `/og.png` today. | `shell()` |
| A second, lower CTA | Someone who came for a Workday explainer meets "Request access" and leaves. "Get the next one by email" matches the stated goal. | `postPage()` |
| `lastmod` on the hub | Posts carry one; the hub, which changes every time, does not. | sitemap |

## The first twelve, in order

One a week. Two a week and "we actually used it" stops being true, which is the only claim the
section has.

| # | Piece | Kind | Target |
| --- | --- | --- | --- |
| 1 | Every job-search tool we have tried | Read | best job application tracker |
| 2 | Applying through Workday | Read | how to apply on workday |
| 3 | See what a parser sees | Tool | ats resume checker free |
| 4 | Applying through Greenhouse | Read | greenhouse application status |
| 5 | The job application tracker spreadsheet | Template | job application tracker spreadsheet |
| 6 | Teal vs Huntr, from someone selling neither | Read | teal vs huntr |
| 7 | How this is written, and what we take money for | Read | trust page, not a query |
| 8 | Applying through Lever | Read | lever application process |
| 9 | Install Simplify — we do not do autofill | Read | simplify jobs review |
| 10 | The Harvard format, as a file | Template | harvard resume template download |
| 11 | What nine parsers did to the same resume | Study | two column resume ats |
| 12 | Hired vs a spreadsheet, honestly | Read | job tracker vs spreadsheet |

The first page that argues for the product comes after eleven that do not, and it is the one
where the honest answer is often "the spreadsheet is fine".

## What not to do

- **No listicles.** "10 resume tips that get you hired" is a lost SERP, and winning it would cost
  the section the voice that makes the other pages work.
- **No generated volume.** The ATS field guide is programmatic in shape only — nine pages on one
  spec, each written from having done it. The moment one is written from a search result the
  premise is gone.
- **No gating.** No address in exchange for a template. It contradicts the argument, for a list
  nobody needs.
- **No affiliate money.** Once, and the section is what it was competing against.
- **Do not move the product CTA up.** The one at the foot of a post is already right. A resources
  section that converts well is a resources section nobody trusts.
