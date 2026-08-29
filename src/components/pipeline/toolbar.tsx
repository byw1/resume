import Link from "next/link";
import { CalendarDaysIcon, KanbanIcon, ListIcon } from "lucide-react";
import type { Stage } from "@prisma/client";
import { BOARD_STAGES, STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import { SearchBox } from "@/components/crm/search-box";
import { cn } from "@/lib/utils";

/**
 * The pipeline's controls, across the top.
 *
 * Horizontal rather than down the side because a board is the widest thing in
 * the product and a rail was taking 216px out of it for nine links. Across the
 * top the same controls cost two rows and the columns get their width back.
 *
 * Everything is a Link, so the whole thing is server-rendered and the URL is
 * the state — a view, a filter and a search you can paste to yourself.
 */

export const PIPELINE_VIEWS = ["board", "list", "calendar"] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number];

export function parseView(value: string | undefined): PipelineView {
  return (PIPELINE_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as PipelineView)
    : "board";
}

/** `all`, `overdue`, `closed`, or one stage. */
export type PipelineFilter = "all" | "overdue" | "closed" | Stage;

/**
 * The filter is a set, not a single choice.
 *
 * It reads from one comma-separated `f` param — "SCREEN,INTERVIEW" — because
 * the URL is the state here and a link you can paste to yourself is worth more
 * than a tidier query string. An empty or unrecognised value means everything,
 * so an old single-stage link still works exactly as it did.
 *
 * `overdue` and `closed` are cuts across stages rather than stages, so they do
 * not combine: picking one replaces the set.
 */
export function parseFilters(value: string | undefined, stages: readonly Stage[]): PipelineFilter[] {
  const parts = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.includes("overdue")) return ["overdue"];
  if (parts.includes("closed")) return ["closed"];
  const picked = parts.filter((part) => (stages as readonly string[]).includes(part)) as Stage[];
  return picked.length > 0 ? picked : ["all"];
}

export type ToolbarCounts = {
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

function href(view: PipelineView, filters: PipelineFilter[], search: string) {
  const params = new URLSearchParams();
  if (view !== "board") params.set("view", view);
  const set = filters.filter((f) => f !== "all");
  if (set.length > 0) params.set("f", set.join(","));
  if (search) params.set("q", search);
  const query = params.toString();
  return query ? `/applications?${query}` : "/applications";
}

/**
 * What clicking a chip does. A stage toggles in and out of the set; the two
 * cross-cutting chips replace it. Clicking the last active stage off leaves
 * "everything" rather than a filter that matches nothing.
 */
function toggled(filters: PipelineFilter[], chip: PipelineFilter): PipelineFilter[] {
  if (chip === "all") return ["all"];
  if (chip === "overdue" || chip === "closed") {
    return filters.includes(chip) ? ["all"] : [chip];
  }
  const stages = filters.filter((f) => f !== "all" && f !== "overdue" && f !== "closed");
  const next = stages.includes(chip) ? stages.filter((f) => f !== chip) : [...stages, chip];
  return next.length > 0 ? next : ["all"];
}

export function PipelineToolbar({
  view,
  filters,
  search,
  counts,
  action,
  views,
  share,
}: {
  view: PipelineView;
  filters: PipelineFilter[];
  search: string;
  counts: ToolbarCounts;
  action: React.ReactNode;
  views: React.ReactNode;
  share: React.ReactNode;
}) {
  const on = (chip: PipelineFilter) => filters.includes(chip);
  return (
    <div className="mb-4 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-inset shadow-field inline-flex items-center gap-0.5 rounded-control p-0.5">
          {VIEWS.map(({ view: candidate, label, icon: Icon }) => {
            const active = candidate === view;
            return (
              <Link
                key={candidate}
                href={href(candidate, filters, search)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "touch-target flex h-11 items-center gap-1.5 rounded-chip px-2.5 text-[12.5px] font-medium transition-colors duration-150 md:h-7",
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

        <SearchBox placeholder="Search companies, roles, notes…" className="w-full sm:w-72" />

        {views}
        {share}

        <div className="ml-auto">{action}</div>
      </div>

      {/* Stages combine — "Screening and Interviewing" is one question, not
          two views. Scrolls sideways on a narrow screen rather than wrapping
          into a wall of chips. */}
      <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
        <Chip href={href(view, ["all"], search)} active={on("all")} count={counts.all}>
          Everything
        </Chip>
        <Chip
          href={href(view, toggled(filters, "overdue"), search)}
          active={on("overdue")}
          count={counts.overdue}
          tone={counts.overdue > 0 ? "var(--destructive)" : undefined}
          emphasis={counts.overdue > 0}
        >
          Needs a nudge
        </Chip>

        <span className="bg-border mx-1 h-4 w-px shrink-0" />

        {BOARD_STAGES.map((stage) => (
          <Chip
            key={stage}
            href={href(view, toggled(filters, stage), search)}
            active={on(stage)}
            count={counts.byStage[stage]}
            tone={STAGE_TONE[stage]}
          >
            {STAGE_LABEL[stage]}
          </Chip>
        ))}

        <span className="bg-border mx-1 h-4 w-px shrink-0" />

        <Chip href={href(view, toggled(filters, "closed"), search)} active={on("closed")} count={counts.closed}>
          Closed
        </Chip>
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  count,
  tone,
  emphasis,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  tone?: string;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "touch-target flex h-11 shrink-0 items-center gap-1.5 rounded-chip px-2 text-[12.5px] transition-colors duration-150 md:h-7",
        active
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {tone && <span className="size-1.5 shrink-0 rounded-full" style={{ background: tone }} />}
      {children}
      <span
        className={cn(
          "meta text-[11.5px]",
          emphasis ? "text-destructive font-medium" : "text-faint",
        )}
      >
        {count || ""}
      </span>
    </Link>
  );
}
