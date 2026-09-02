import {
  DribbbleIcon,
  FacebookIcon,
  FigmaIcon,
  GithubIcon,
  GlobeIcon,
  InstagramIcon,
  LinkIcon,
  LinkedinIcon,
  SlackIcon,
  TwitchIcon,
  YoutubeIcon,
} from "lucide-react";
import { brandFor, type BrandKey, type PlatformKey } from "@/lib/social";
import { cn } from "@/lib/utils";

/**
 * X's own mark, because lucide's `TwitterIcon` is still the bird.
 *
 * The label beside it has said X since the rebrand, so the bird was the one
 * icon in the app that named a thing that no longer exists. Drawn here rather
 * than pulled from an icon pack: one glyph is not worth a dependency.
 */
function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

const MARKS: Record<BrandKey, (props: { className?: string }) => React.ReactNode> = {
  linkedin: LinkedinIcon,
  twitter: XMark,
  instagram: InstagramIcon,
  github: GithubIcon,
  youtube: YoutubeIcon,
  facebook: FacebookIcon,
  twitch: TwitchIcon,
  dribbble: DribbbleIcon,
  figma: FigmaIcon,
  slack: SlackIcon,
  website: GlobeIcon,
  other: LinkIcon,
};

/**
 * The mark for one link.
 *
 * Takes the raw stored value rather than a platform, because the five named
 * columns are not the whole story: everything else a person keeps lives in
 * `otherLinks`, where the platform has to be read back off the URL.
 */
export function PlatformIcon({
  value,
  brand,
  className,
}: {
  /** A stored link. Ignored when `brand` is given. */
  value?: string;
  /** The column it is filed under, when the caller knows (a named platform). */
  brand?: PlatformKey;
  className?: string;
}) {
  const Mark = MARKS[brandFor(value ?? "", brand)];
  return <Mark className={cn("size-3.5 shrink-0", className)} />;
}
