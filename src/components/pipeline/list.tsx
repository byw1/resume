import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, FlameIcon } from "lucide-react";
import type { Stage } from "@prisma/client";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import { cn, relativeDay } from "@/lib/utils";

export const LIST_SORTS = ["followUp", "company", "stage", "updated", "salary"] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export function parseSort(value: string | undefined): ListSort {
  return (LIST_SORTS as readonly string[]).includes(value ?? "")
    ? (value as ListSort)
    : "followUp";
}

export type ListRow = {
  id: string;
  company: string;
  roleTitle: string;
  stage: Stage;
  location: string;
  salaryRange: string;
  excitement: number;
  nextFollowUpAt: string | null;
  activityCount: number;
  updatedAt: string;
};

const STAGE_ORDER: Stage[] = [
  "OFFER",
  "FINAL",
  "INTERVIEW",
  "SCREEN",
  "APPLIED",
  "WISHLIST",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
];

/**
 * Sorting happens here rather than in the query because the useful default —
 * soonest follow-up first, then everything with no date at all — is not an
 * ordering Postgres gives you for free, and the list is a person's own
 * pipeline: tens of rows, not thousands.
 */
export function sortRows(rows: ListRow[], sort: ListSort, desc: boolean): ListRow[] {
  const sorted = [...rows].sort((a, b) => {
    switch (sort) {
      case "company":
        return a.company.localeCompare(b.company) || a.roleTitle.localeCompare(b.roleTitle);
      case "stage":
        return STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
      case "updated":
        return b.updatedAt.localeCompare(a.updatedAt);
      case "salary":
        // No salary sorts last either way: a blank is not "cheapest".
        return (salaryFloor(b.salaryRange) || -1) - (salaryFloor(a.salaryRange) || -1);
      case "followUp":
      default:
        if (!a.nextFollowUpAt && !b.nextFollowUpAt) return b.updatedAt.localeCompare(a.updatedAt);
        if (!a.nextFollowUpAt) return 1;
        if (!b.nextFollowUpAt) return -1;
        return a.nextFollowUpAt.localeCompare(b.nextFollowUpAt);
    }
  });
  return desc ? sorted.reverse() : sorted;
}

/** First number that looks like money, so "$210k – $260k" sorts on 210000. */
function salaryFloor(range: string): number {
  const match = range.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|m)?/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  return unit === "k" ? value * 1000 : unit === "m" ? value * 1e6 : value;
}

const COLUMNS: { key: ListSort | null; label: string; className: string }[] = [
  { key: "company", label: "Company", className: "flex-1 min-w-0" },
  { key: "stage", label: "Stage", className: "w-28 shrink-0" },
  { key: "followUp", label: "Follow-up", className: "w-24 shrink-0" },
  { key: "salary", label: "Salary", className: "w-32 shrink-0 hidden lg:block" },
  { key: null, label: "Location", className: "w-32 shrink-0 hidden xl:block" },
  { key: null, label: "Log", className: "w-10 shrink-0 text-right" },
  { key: "updated", label: "Touched", className: "w-20 shrink-0 text-right" },
];

export function PipelineList({
  rows,
  sort,
  desc,
}: {
  rows: ListRow[];
  sort: ListSort;
  desc: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-faint rounded-xl border border-dashed py-16 text-center text-[13px]">
        Nothing tracked yet.
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="bg-card shadow-card overflow-hidden rounded-xl">
      <div className="text-faint bg-inset flex items-center gap-3 px-4 py-2 text-[11px] font-medium tracking-[0.04em] uppercase">
        {COLUMNS.map((column) => (
          <div key={column.label} className={column.className}>
            {column.key ? (
              <Link
                href={sortHref(column.key, sort, desc)}
                className="hover:text-foreground inline-flex items-center gap-1 transition-colors duration-150"
              >
                {column.label}
                {sort === column.key &&
                  (desc ? (
                    <ArrowDownIcon className="size-2.5" />
                  ) : (
                    <ArrowUpIcon className="size-2.5" />
                  ))}
              </Link>
            ) : (
              column.label
            )}
          </div>
        ))}
      </div>

      <ul className="divide-y">
        {rows.map((row) => {
          const due = row.nextFollowUpAt ? new Date(row.nextFollowUpAt) : null;
          const overdue = due ? due.getTime() < now : false;
          return (
            <li key={row.id}>
              <Link
                href={`/applications/${row.id}`}
                className="hover:bg-accent/50 flex items-center gap-3 px-4 py-2.5 transition-colors duration-150"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: STAGE_TONE[row.stage] }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium">{row.company}</span>
                      {row.excitement >= 4 && (
                        <FlameIcon className="text-warning size-3 shrink-0" />
                      )}
                    </div>
                    <div className="text-faint truncate text-[12px]">{row.roleTitle}</div>
                  </div>
                </div>

                <div className="text-muted-foreground w-28 shrink-0 truncate text-[12px]">
                  {STAGE_LABEL[row.stage]}
                </div>

                <div
                  className={cn(
                    "nums w-24 shrink-0 text-[12px]",
                    overdue ? "text-destructive font-medium" : "text-muted-foreground",
                  )}
                >
                  {due ? relativeDay(due) : "—"}
                </div>

                <div className="nums text-muted-foreground hidden w-32 shrink-0 truncate text-[12px] lg:block">
                  {row.salaryRange || "—"}
                </div>

                <div className="text-faint hidden w-32 shrink-0 truncate text-[12px] xl:block">
                  {row.location || "—"}
                </div>

                <div className="nums text-faint w-10 shrink-0 text-right text-[12px]">
                  {row.activityCount || "—"}
                </div>

                <div className="nums text-faint w-20 shrink-0 text-right text-[12px]">
                  {new Date(row.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Clicking the column you're already sorted by flips the direction. */
function sortHref(key: ListSort, sort: ListSort, desc: boolean) {
  const params = new URLSearchParams({ view: "list", sort: key });
  if (key === sort && !desc) params.set("dir", "desc");
  return `/applications?${params}`;
}
