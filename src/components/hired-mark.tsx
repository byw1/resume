/**
 * The Hired mark: three stacked bars of increasing length.
 *
 * Not a letter. A lettered square is what every tool in this category has, and
 * a letter also ties the mark to the name — this one survives another rename.
 * The bars are the record getting longer, which is the product.
 *
 * Drawn inline rather than loaded from a file so the fills are theme tokens:
 * the tile is the foreground ink and the bars are cut out of it, so the mark
 * inverts with the theme the way the rest of the interface does. An <img> would
 * need two files and would still be wrong at the moment someone switches theme.
 *
 * Geometry is a 64-unit grid and every size scales from it — bar height 10.9%
 * of the tile, gap 7%, longest bar 50%, corner radius 23.4%.
 */
export function HiredMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="64" height="64" rx="15" fill="var(--foreground)" />
      <rect x="16" y="17" width="13" height="7" rx="1.5" fill="var(--background)" />
      <rect x="16" y="28.5" width="22.5" height="7" rx="1.5" fill="var(--background)" />
      <rect x="16" y="40" width="32" height="7" rx="1.5" fill="var(--background)" />
    </svg>
  );
}
