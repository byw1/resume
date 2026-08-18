/**
 * Working out what a company's website is, from whatever we happen to know.
 *
 * Nobody types a company's domain into a job tracker, so it has to be inferred
 * or the logos never appear. Three sources in descending order of trust:
 * the website on the company record, the posting URL, and finally the name.
 * Every one of them can be wrong — a wrong guess just 404s and the monogram
 * shows instead, which is why guessing is worth it at all.
 */

/**
 * Applicant tracking systems put the company in the path or the subdomain, so
 * a Greenhouse link is worth more than nothing. Job boards that aggregate
 * across employers (LinkedIn, Indeed) tell us only about the board.
 */
const ATS_PATH: Record<string, true> = {
  "boards.greenhouse.io": true,
  "job-boards.greenhouse.io": true,
  "jobs.lever.co": true,
  "jobs.ashbyhq.com": true,
  "apply.workable.com": true,
  "jobs.smartrecruiters.com": true,
  "breezy.hr": true,
  "app.dover.io": true,
};

const AGGREGATORS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "dice.com",
  "wellfound.com",
  "angel.co",
  "otta.com",
  "builtin.com",
  "google.com",
  "workatastartup.com",
];

function hostOf(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** "Vertex Payments, Inc." -> "vertexpayments". Suffixes are noise in a domain. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|ag|bv|pty|group|labs|technologies|technology)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * The best guess at a company's domain, or null when there isn't one worth
 * making. `website` wins outright; a posting URL is used only when it names the
 * employer; the name is a last resort and is only tried when it is short enough
 * to plausibly be a domain.
 */
export function companyDomain(input: {
  name: string;
  website?: string | null;
  jobUrl?: string | null;
}): string | null {
  const fromWebsite = hostOf(input.website ?? "");
  if (fromWebsite) return fromWebsite;

  const host = hostOf(input.jobUrl ?? "");
  if (host && !AGGREGATORS.some((bad) => host === bad || host.endsWith(`.${bad}`))) {
    // Workday: {company}.wd1.myworkdayjobs.com
    const workday = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/.exec(host);
    if (workday) return `${workday[1]}.com`;

    if (ATS_PATH[host]) {
      const slug = (input.jobUrl ?? "").split(host)[1]?.split("/").filter(Boolean)[0];
      return slug ? `${slug.toLowerCase()}.com` : null;
    }

    // Anything else is probably the company's own careers page.
    return host;
  }

  const slug = slugify(input.name);
  return slug.length >= 2 && slug.length <= 24 ? `${slug}.com` : null;
}

/** One or two letters, for when there is no logo to show. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A stable hue per company, so the same employer is the same colour on every
 * screen and two companies in a list are rarely the same. Only used behind a
 * monogram, where the colour is decoration rather than information — a stage
 * chip next to it is what actually carries meaning.
 */
export function monogramHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

/** twenty-icons.com is Twenty CRM's free favicon service. */
export function logoUrl(domain: string, size = 64): string {
  return `https://twenty-icons.com/${domain}/${size}`;
}
