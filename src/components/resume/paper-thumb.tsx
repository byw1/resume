"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** 8.5in at CSS's 96dpi. The paper always renders at this width. */
const PAGE_WIDTH = 816;

/**
 * A real page, shrunk to whatever width the card happens to be.
 *
 * The scale has to be measured rather than hardcoded: the resume grid is
 * responsive, so a fixed `scale(0.29)` fits exactly one breakpoint and leaves
 * the document stranded to one side at every other. The page renders at its
 * true 816px and gets scaled down, which keeps the type crisp and the layout
 * identical to what prints.
 *
 * Children come in as a slot so the document itself is still server-rendered —
 * only the measuring is client work.
 */
export function PaperThumb({
  children,
  className,
}: {
  children: React.ReactNode;
  /** Override the crop, e.g. a taller aspect for the template picker's minis. */
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / PAGE_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className={cn("relative overflow-hidden bg-white", className ?? "aspect-[7/5]")}>
      <div
        className="absolute top-0 left-0 origin-top-left transition-opacity duration-200"
        style={{
          width: PAGE_WIDTH,
          transform: `scale(${scale})`,
          // Hidden for the one frame before the observer reports a width, so a
          // full-size page never flashes across the card.
          opacity: scale ? 1 : 0,
        }}
        aria-hidden
      >
        {children}
      </div>
    </div>
  );
}
