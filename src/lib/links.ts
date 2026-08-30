/**
 * The places a person can be reached, and how to read a link to one.
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

/**
 * Which platform a pasted link belongs to, or null when it is not a link at
 * all. Anything that IS a link but matches no known host is a website.
 */
export function detectPlatform(value: string): PlatformKey | null {
  const host = hostOf(value);
  if (!host) return null;
  const match = PLATFORMS.find((platform) =>
    platform.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`)),
  );
  return match?.key ?? "website";
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
