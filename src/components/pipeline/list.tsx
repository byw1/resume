"use client";

import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, FlameIcon } from "lucide-react";
import type { Stage } from "@prisma/client";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import type { ListRow, ListSort } from "@/lib/pipeline-list";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { useOpenApplication } from "@/components/pipeline/application-panel";
import { cn, relativeDay } from "@/lib/utils";

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
  const openPanel = useOpenApplication();
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
      <div className="eyebrow bg-inset flex items-center gap-3 px-4 py-2">
        {COLUMNS.map((column) => (
          <div key={column.label} className={column.className}>
            {column.key ? (
              <Link
                href={sortHref(column.key, sort, desc)}
                className="hover:text-foreground touch-target inline-flex min-h-11 items-center gap-1 transition-colors duration-150 md:min-h-0"
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
                onClick={(event) => {
                  if (!openPanel || event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  openPanel(row.id);
                }}
                style={{ ["--tone" as string]: STAGE_TONE[row.stage] }}
                className="stage-band hover:bg-accent/50 flex items-center gap-3 px-4 py-2.5 transition-colors duration-150"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <CompanyAvatar name={row.company} domain={row.domain} size={26} />
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

                <div className="w-28 shrink-0">
                  <span
                    className="stage-chip inline-block max-w-full truncate rounded-chip px-1.5 py-0.5 text-[11.5px] font-medium"
                    style={{ ["--tone" as string]: STAGE_TONE[row.stage] }}
                  >
                    {STAGE_LABEL[row.stage]}
                  </span>
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
