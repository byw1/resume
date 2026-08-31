"use client";

import { cn } from "@/lib/utils";

/**
 * A filter toggle. Used by the Log tab and the Configuration tab, which is why
 * it lives here rather than inside whichever panel happened to need it first.
 *
 * `aria-pressed` rather than a checkbox: it is a control that changes what the
 * list below shows, not a value being submitted, and screen readers announce
 * the pressed state without any extra labelling.
 */
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // h-11 on a touch screen, 28px on a pointer: these sit in a scrolling
        // strip, so a pseudo-element hit area would be clipped by the scroll
        // container rather than enlarging anything.
        "touch-target rounded-chip flex h-11 shrink-0 items-center px-2.5 text-[12.5px] transition-colors duration-150 md:h-7",
        active
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
