"use client";

import { useState } from "react";
import { logoUrl, monogram, monogramHue } from "@/lib/company";
import { cn } from "@/lib/utils";

/**
 * A company's favicon, with a monogram underneath it.
 *
 * The monogram is not a placeholder that gets replaced — it is always drawn,
 * and the image sits on top of it. So a company with no domain, a domain with
 * no favicon, and a browser that never reaches the service all land in the
 * same place with no layout shift and nothing to load.
 *
 * The request goes to a third party, which therefore learns which companies
 * are in someone's pipeline. `no-referrer` keeps our URLs out of it, and the
 * whole thing is off when an admin turns off logos.
 */
export function CompanyAvatar({
  name,
  domain,
  size = 28,
  className,
}: {
  name: string;
  /** Null when logos are off, or when no domain could be worked out. */
  domain: string | null;
  size?: number;
  className?: string;
}) {
  // Three states, not two. A request that never resolves — offline, blocked by
  // a network policy, a slow CDN — is not the same as one that errored, and if
  // the image paints its backing before it has pixels the monogram underneath
  // is covered by a white square that may never fill in.
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const hue = monogramHue(name);

  /**
   * Settle from the element rather than from the event.
   *
   * An image that is already in cache finishes before React attaches its
   * handlers, so onLoad and onError never fire and the logo would stay hidden
   * for the rest of the session — on every visit after the first, which is
   * every visit that matters. `complete` is true either way once the browser
   * is done, and a failed decode leaves naturalWidth at 0, so one check covers
   * both outcomes. A 1px response is a miss dressed up as a hit.
   */
  const settle = (img: HTMLImageElement | null) => {
    if (img?.complete) setStatus(img.naturalWidth > 1 ? "loaded" : "failed");
  };

  return (
    <span
      className={cn(
        "monogram relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-chip font-semibold select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        ["--hue" as string]: hue,
      }}
      aria-hidden
    >
      {monogram(name)}
      {domain && status !== "failed" && (
        <img
          src={logoUrl(domain, size * 2)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          ref={settle}
          onLoad={(event) => settle(event.currentTarget)}
          onError={(event) => settle(event.currentTarget)}
          className={cn(
            "absolute inset-0 size-full bg-white object-contain transition-opacity duration-200",
            status === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </span>
  );
}
