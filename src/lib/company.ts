/**
 * Working out what a company's website is.
 *
 * The website on the company record is the answer. A posting URL is not: job
 * listings live on Greenhouse, Ashby, Workday and a dozen other boards, so a
 * link to one tells you where the employer advertises, not who they are —
 * and a logo taken from it is the applicant tracking system's logo, which is
 * both wrong and confusingly identical across half the pipeline.
 *
 * When there is no website we guess the name as a domain, because that is
 * right often enough to be worth it and the failure is invisible: a wrong
 * guess 404s and the monogram was already on screen. The company page is
 * where you correct it.
 */

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

/**
 * "Vertex Payments, Inc." -> "vertexpayments". Suffixes are noise in a domain,
 * and they are the same noise that makes "Stripe" and "Stripe, Inc." two rows —
 * so this doubles as the key for spotting a duplicate employer.
 *
 * Deliberately aggressive: it also folds "Meta" and "Meta Labs" together. That
 * is why it may only ever SUGGEST a merge for a person to look at, never
 * perform one.
 */
export function companyKey(name: string): string {
  return slugify(name);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|ag|bv|pty|group|labs|technologies|technology)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * The best guess at a company's domain, or null when there isn't one worth
 * making. `website` wins outright; the name is a fallback and is only tried
 * when it is short enough to plausibly be a domain.
 */
export function companyDomain(input: { name: string; website?: string | null }): string | null {
  const fromWebsite = hostOf(input.website ?? "");
  if (fromWebsite) return fromWebsite;

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

/**
 * twenty-icons.com is Twenty CRM's free favicon service. It serves a fixed set
 * of sizes and answers 400 Invalid size for anything else — so asking for the
 * 52 pixels a 26px avatar actually wants gets you no logo at all, silently,
 * which is indistinguishable from the company not having one.
 *
 * Snapping happens here rather than at the call sites so the UI can keep
 * choosing whatever size the layout needs. Round up, never down: a larger
 * source scaled into a smaller box stays sharp, the reverse does not.
 */
const ICON_SIZES = [16, 32, 64, 128, 180, 192];

export function logoUrl(domain: string, size = 64): string {
  const served = ICON_SIZES.find((candidate) => candidate >= size) ?? ICON_SIZES[ICON_SIZES.length - 1];
  return `https://twenty-icons.com/${domain}/${served}`;
}
