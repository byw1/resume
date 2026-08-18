import Link from "next/link";
import { CalendarDaysIcon, KanbanIcon, ListIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const PIPELINE_VIEWS = ["board", "list", "calendar"] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number];

export function parseView(value: string | undefined): PipelineView {
  return (PIPELINE_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as PipelineView)
    : "board";
}

const OPTIONS: { view: PipelineView; label: string; icon: typeof ListIcon }[] = [
  { view: "board", label: "Board", icon: KanbanIcon },
  { view: "list", label: "List", icon: ListIcon },
  { view: "calendar", label: "Calendar", icon: CalendarDaysIcon },
];

/**
 * The view lives in the URL rather than in component state, so a link to the
 * calendar is a link to the calendar — and the whole thing stays server
 * rendered, which matters because the list view sorts on the server.
 */
export function ViewSwitcher({ current }: { current: PipelineView }) {
  return (
    <div className="bg-inset shadow-field inline-flex items-center gap-0.5 rounded-control p-0.5">
      {OPTIONS.map(({ view, label, icon: Icon }) => {
        const active = view === current;
        return (
          <Link
            key={view}
            href={view === "board" ? "/applications" : `/applications?view=${view}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-chip px-2.5 text-[12.5px] font-medium transition-colors duration-150",
              active
                ? "bg-card text-foreground shadow-btn"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
