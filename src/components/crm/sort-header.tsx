import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A column heading you can sort by.
 *
 * The href is built by the page from the filters it is already holding, so
 * sorting a filtered list keeps the filters — the bug this shape exists to
 * prevent is a fresh query string that silently throws them away.
 */
export function SortHeader({
  href,
  label,
  active,
  desc,
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  desc: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "hover:text-foreground flex items-center gap-1 transition-colors",
        className,
        active && "text-foreground",
      )}
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
    >
      {label}
      {active && (desc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
    </Link>
  );
}
