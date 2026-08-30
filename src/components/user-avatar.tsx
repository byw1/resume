import { cn } from "@/lib/utils";

/**
 * The person, as a circle.
 *
 * Initials are always drawn and the photo sits on top, the same arrangement
 * CompanyAvatar uses: no placeholder that swaps, no layout shift, and an
 * account with no picture is a finished state rather than a gap. The source is
 * a data URI held in the profile row, so there is nothing to fetch and no
 * moment where the circle is empty.
 */
export function UserAvatar({
  name,
  email,
  photo,
  size = 28,
  className,
}: {
  name: string;
  email: string;
  /** Data URI, or "" for initials only. */
  photo?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-foreground text-background relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      <span aria-hidden>{initials(name, email)}</span>
      {photo && (
        <img
          src={photo}
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
        />
      )}
    </span>
  );
}

export function initials(name: string, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}
