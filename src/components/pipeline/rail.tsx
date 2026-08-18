import Link from "next/link";
import { CalendarDaysIcon, CircleSlashIcon, KanbanIcon, LayersIcon, ListIcon } from "lucide-react";
import type { Stage } from "@prisma/client";
import { BOARD_STAGES, STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import { cn } from "@/lib/utils";

/**
 * The pipeline's own rail: which view you are in, and which slice of the
 * pipeline you are looking at.
 *
 * It sits between the app's navigation and the content rather than inside
 * either. The app nav answers "which part of the product", the rail answers
 * "which cut of this part" — the same split a CRM makes between its object list
 * and its saved views, and the reason the two never share a control.
 *
 * Everything here is a Link, so the whole thing is server-rendered and the URL
 * is the state. A view and a filter you can paste to yourself is worth more
 * than one that animates.
 */

export const PIPELINE_VIEWS = ["board", "list", "calendar"] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number];

export function parseView(value: string | undefined): PipelineView {
  return (PIPELINE_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as PipelineView)
    : "board";
}

/** `all`, `overdue`, `closed`, or one stage. One at a time, like a saved view. */
export type PipelineFilter = "all" | "overdue" | "closed" | Stage;

export function parseFilter(value: string | undefined, stages: readonly Stage[]): PipelineFilter {
  if (value === "overdue" || value === "closed") return value;
  if (value && (stages as readonly string[]).includes(value)) return value as Stage;
  return "all";
}

export type RailCounts = {
  all: number;
  overdue: number;
  closed: number;
  byStage: Record<Stage, number>;
};

const VIEWS: { view: PipelineView; label: string; icon: typeof ListIcon }[] = [
  { view: "board", label: "Board", icon: KanbanIcon },
  { view: "list", label: "List", icon: ListIcon },
  { view: "calendar", label: "Calendar", icon: CalendarDaysIcon },
];

function href(view: PipelineView, filter: PipelineFilter) {
  const params = new URLSearchParams();
  if (view !== "board") params.set("view", view);
  if (filter !== "all") params.set("f", filter);
  const query = params.toString();
  return query ? `/applications?${query}` : "/applications";
}

export function PipelineRail({
  view,
  filter,
  counts,
}: {
  view: PipelineView;
  filter: PipelineFilter;
  counts: RailCounts;
}) {
  return (
    <aside className="bg-background sticky top-16 hidden h-[calc(100svh-4rem)] w-[13.5rem] shrink-0 overflow-y-auto border-r px-2.5 py-6 lg:block">
      <Section label="Views" />
      <div className="space-y-px">
        {VIEWS.map(({ view: candidate, label, icon: Icon }) => (
          <Row
            key={candidate}
            href={href(candidate, filter)}
            active={candidate === view}
            icon={<Icon className="size-[15px]" />}
          >
            {label}
          </Row>
        ))}
      </div>

      <Section label="Filter" className="mt-5" />
      <div className="space-y-px">
        <Row
          href={href(view, "all")}
          active={filter === "all"}
          icon={<LayersIcon className="size-[15px]" />}
          count={counts.all}
        >
          Everything
        </Row>

        {/* The one question the daily loop actually asks, so it sits above the
            stages rather than at the bottom with the leftovers. */}
        <Row
          href={href(view, "overdue")}
          active={filter === "overdue"}
          icon={
            <span
              className={cn(
                "size-1.5 rounded-full",
                counts.overdue > 0 ? "bg-destructive" : "bg-faint",
              )}
            />
          }
          count={counts.overdue}
          emphasis={counts.overdue > 0}
        >
          Needs a nudge
        </Row>

        <div className="my-1.5 border-t" />

        {BOARD_STAGES.map((stage) => (
          <Row
            key={stage}
            href={href(view, stage)}
            active={filter === stage}
            icon={
              <span
                className="size-1.5 rounded-full"
                style={{ background: STAGE_TONE[stage] }}
              />
            }
            count={counts.byStage[stage]}
          >
            {STAGE_LABEL[stage]}
          </Row>
        ))}

        <div className="my-1.5 border-t" />

        <Row
          href={href(view, "closed")}
          active={filter === "closed"}
          icon={<CircleSlashIcon className="size-[15px]" />}
          count={counts.closed}
        >
          Closed
        </Row>
      </div>
    </aside>
  );
}

function Section({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-faint mb-1.5 px-2 text-[11px] font-medium tracking-[0.06em] uppercase",
        className,
      )}
    >
      {label}
    </div>
  );
}

/**
 * A rail row. Deliberately shorter and quieter than an app-nav item — this is
 * the second most important thing on screen, and it should read that way.
 */
function Row({
  href,
  active,
  icon,
  count,
  emphasis,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  count?: number;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-control px-2 text-[13px] transition-colors duration-100",
        active
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="flex size-[15px] shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            "nums shrink-0 text-[11.5px]",
            emphasis ? "text-destructive font-medium" : "text-faint",
          )}
        >
          {count || ""}
        </span>
      )}
    </Link>
  );
}
