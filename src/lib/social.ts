/**
 * The places a person can be reached, and how to read a link to one.
 *
 * Named `social`, not `links`: `src/lib/links.ts` is the project's own
 * addresses (the manual), and two unrelated things cannot share a filename
 * however well each name fits on its own.
 *
 * Pure — no database, no React — because both the contact form and anything
 * rendering a contact needs it, and a client component may not pull Prisma
 * into the browser bundle. Same reason `src/lib/audit-groups.ts` exists.
 *
 * A stored link is whatever the person typed. We normalise on the way in, but
 * every reader here tolerates the untidy forms already in the database:
 * "linkedin.com/in/will", "@will", a bare domain, a full URL.
 */

export type PlatformKey = "linkedin" | "twitter" | "instagram" | "github" | "website" | "other";

export type Platform = {
  key: PlatformKey;
  label: string;
  /** Hostnames that mean this platform. Empty for the catch-alls. */
  hosts: string[];
  /** Where a bare handle gets expanded to. Null when a handle is meaningless. */
  handleBase: string | null;
  placeholder: string;
};

/**
 * X is listed under `twitter` because that is the column's name and renaming a
 * column to follow a rebrand is a migration that buys nothing. The label is
 * what people see, and that says X.
 */
export const PLATFORMS: Platform[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    hosts: ["linkedin.com", "lnkd.in"],
    handleBase: "https://linkedin.com/in/",
    placeholder: "linkedin.com/in/…",
  },
  {
    key: "twitter",
    label: "X",
    hosts: ["x.com", "twitter.com"],
    handleBase: "https://x.com/",
    placeholder: "@handle or x.com/…",
  },
  {
    key: "instagram",
    label: "Instagram",
    hosts: ["instagram.com"],
    handleBase: "https://instagram.com/",
    placeholder: "@handle or instagram.com/…",
  },
  {
    key: "github",
    label: "GitHub",
    hosts: ["github.com"],
    handleBase: "https://github.com/",
    placeholder: "@handle or github.com/…",
  },
  {
    key: "website",
    label: "Website",
    hosts: [],
    handleBase: null,
    placeholder: "their site or blog",
  },
  {
    key: "other",
    label: "Other",
    hosts: [],
    handleBase: null,
    placeholder: "Bluesky, Mastodon, a Substack…",
  },
];

export const PLATFORM_LABEL: Record<PlatformKey, string> = Object.fromEntries(
  PLATFORMS.map((platform) => [platform.key, platform.label]),
) as Record<PlatformKey, string>;

/** The named columns on Contact, in the order a person reads them. */
export const NAMED_PLATFORMS: Exclude<PlatformKey, "other">[] = [
  "linkedin",
  "twitter",
  "instagram",
  "github",
  "website",
];

function hostOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("@")) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    // A bare handle parses as a hostname with no dot in it — "will" becomes
    // https://will. That is not a website, so it is not a link either.
    if (!url.hostname.includes(".")) return null;
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Does this hostname belong to one of these? Subdomains count. */
function hostMatches(host: string, hosts: string[]): boolean {
  return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

/**
 * Which platform a pasted link belongs to, or null when it is not a link at
 * all. Anything that IS a link but matches no known host is a website.
 */
export function detectPlatform(value: string): PlatformKey | null {
  const host = hostOf(value);
  if (!host) return null;
  const match = PLATFORMS.find((platform) => hostMatches(host, platform.hosts));
  return match?.key ?? "website";
}

/**
 * The mark to print beside a link.
 *
 * Wider than PLATFORMS on purpose. A contact has columns for five platforms,
 * so those are what the picker offers — but a link filed under "other" is
 * still somebody's YouTube or Twitch, and a chain-link icon on every one of
 * them says nothing. This list is read only for the icon: it never changes
 * where a link is stored or which slot it lands in.
 *
 * Only platforms whose mark is genuinely recognisable are listed. A Bluesky
 * link staying a chain link is better than one wearing a bird that isn't
 * theirs.
 */
export type BrandKey =
  | PlatformKey
  | "youtube"
  | "facebook"
  | "twitch"
  | "dribbble"
  | "figma"
  | "slack";

const BRAND_HOSTS: { key: BrandKey; hosts: string[] }[] = [
  ...PLATFORMS.filter((platform) => platform.hosts.length > 0).map((platform) => ({
    key: platform.key as BrandKey,
    hosts: platform.hosts,
  })),
  { key: "youtube", hosts: ["youtube.com", "youtu.be"] },
  { key: "facebook", hosts: ["facebook.com", "fb.com"] },
  { key: "twitch", hosts: ["twitch.tv"] },
  { key: "dribbble", hosts: ["dribbble.com"] },
  { key: "figma", hosts: ["figma.com"] },
  { key: "slack", hosts: ["slack.com"] },
];

export const BRAND_LABEL: Record<BrandKey, string> = {
  ...PLATFORM_LABEL,
  youtube: "YouTube",
  facebook: "Facebook",
  twitch: "Twitch",
  dribbble: "Dribbble",
  figma: "Figma",
  slack: "Slack",
};

/**
 * Which mark a stored link wears. Never null: something that is not a link at
 * all still has to render as something, and that something is a chain link.
 */
export function brandOf(value: string): BrandKey {
  const host = hostOf(value);
  if (!host) return "other";
  const match = BRAND_HOSTS.find((brand) => hostMatches(host, brand.hosts));
  return match?.key ?? "website";
}

/**
 * The platform to SHOW for a stored link.
 *
 * What the host says, mostly — a YouTube URL sitting in the website column is
 * still a YouTube link. The column it is filed under only gets a say when the
 * host said nothing useful, which is what an untidy stored value ("@will",
 * typed before there was a picker) reduces to.
 */
export function brandFor(value: string, filedAs?: PlatformKey): BrandKey {
  const detected = brandOf(value);
  if (detected !== "other" && detected !== "website") return detected;
  if (filedAs && filedAs !== "other" && filedAs !== "website") return filedAs;
  // A real URL nothing recognises is a website, not a chain link, whatever
  // slot it happens to be filed in.
  return detected;
}

/**
 * What to store. A full URL stays as it is; a bare handle is expanded against
 * the platform it was filed under, which is the whole reason the picker offers
 * a platform rather than guessing from "@will".
 */
export function normaliseLink(value: string, platform: PlatformKey): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (hostOf(trimmed)) return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const base = PLATFORMS.find((candidate) => candidate.key === platform)?.handleBase;
  if (!base) return trimmed;
  return `${base}${trimmed.replace(/^@/, "")}`;
}

/** An openable address for a stored value. Empty when there is nothing to open. */
export function linkHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return hostOf(trimmed) ? `https://${trimmed}` : "";
}

/**
 * The short form to print. A profile URL reads as its handle, because
 * "@bywilliaml" is what someone recognises and
 * "https://x.com/bywilliaml?utm=…" is not.
 */
export function linkLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed;

  const host = hostOf(trimmed);
  if (!host) return trimmed;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const path = url.pathname.replace(/\/+$/, "");
    const platform = detectPlatform(trimmed);
    if (platform && platform !== "website" && platform !== "other") {
      // "/in/will" and "/will" both end in the handle worth showing.
      const handle = path.split("/").filter(Boolean).pop();
      if (handle) return `@${handle}`;
    }
    return path ? `${host}${path}` : host;
  } catch {
    return trimmed;
  }
}
