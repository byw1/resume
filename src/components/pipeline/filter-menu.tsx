"use client";

import { useRouter } from "next/navigation";
import { FilterIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { tagTone } from "@/lib/data/tags";
import {
  buildPipelineQuery,
  toggleIn,
  type PipelineFilters,
} from "@/lib/pipeline-filters";
import { cn } from "@/lib/utils";

export type FilterFacets = {
  tags: { id: string; name: string; color: string; count: number }[];
  companies: { id: string; name: string; count: number }[];
  resumes: { id: string; name: string; count: number }[];
};

const WAITING = [7, 14, 30];
const EXCITEMENT = [4, 5];

/**
 * Everything the chip row cannot hold.
 *
 * Stages stay as chips: there are six, they are colour-coded, and they are the
 * filter people use constantly. The dimensions here are unbounded — forty
 * companies, a dozen tags, five resumes — so a chip each would be a wall,
 * and they belong behind one control that says how many are on.
 *
 * Rows navigate through the router rather than being anchors: cmdk's
 * CommandItem has no `asChild`, so a Link inside one is not a thing that can
 * exist. Counts come from the rows already on the page, so they never claim
 * twelve when the search has left one.
 */
export function FilterMenu({
  filters,
  facets,
  view,
  sort,
  dir,
  limited = false,
}: {
  filters: PipelineFilters;
  facets: FilterFacets;
  view: string;
  sort?: string;
  dir?: string;
  /** The current view can only honour stages and overdue. Say so. */
  limited?: boolean;
}) {
  const router = useRouter();
  const go = (next: PipelineFilters) =>
    router.push(buildPipelineQuery({ view, filters: next, sort, dir }));

  const active =
    filters.tags.length +
    filters.companies.length +
    filters.resumes.length +
    (filters.waiting !== null ? 1 : 0) +
    (filters.quiet !== null ? 1 : 0) +
    (filters.excitement !== null ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={active > 0 ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          aria-label="Filter the pipeline"
        >
          <FilterIcon />
          Filter
          {active > 0 && <span className="nums ml-0.5">{active}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command loop>
          <CommandInput placeholder="Tag, company, resume…" className="h-9" />
          <CommandList className="max-h-[22rem]">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {limited && (
              <p className="text-muted-foreground border-b px-3 py-2 text-[12px]">
                The calendar shows dates, so only the stage chips and Needs a nudge narrow
                it. These apply on the board and the table.
              </p>
            )}

            {facets.tags.length > 0 && (
              <CommandGroup heading="Tags">
                {facets.tags.map((tag) => (
                  <Row
                    key={tag.id}
                    id={`src-${tag.id}`}
                    label={tag.name}
                    count={tag.count}
                    on={filters.tags.includes(tag.id)}
                    dot={tagTone(tag.color)}
                    onPick={() => go({ ...filters, tags: toggleIn(filters.tags, tag.id) })}
                  />
                ))}
              </CommandGroup>
            )}

            {facets.companies.length > 0 && (
              <CommandGroup heading="Company">
                {facets.companies.map((company) => (
                  <Row
                    key={company.id}
                    id={`co-${company.id}`}
                    label={company.name}
                    count={company.count}
                    on={filters.companies.includes(company.id)}
                    onPick={() =>
                      go({ ...filters, companies: toggleIn(filters.companies, company.id) })
                    }
                  />
                ))}
              </CommandGroup>
            )}

            {facets.resumes.length > 0 && (
              <CommandGroup heading="Resume sent">
                {facets.resumes.map((resume) => (
                  <Row
                    key={resume.id}
                    id={`cv-${resume.id}`}
                    label={resume.name}
                    count={resume.count}
                    on={filters.resumes.includes(resume.id)}
                    onPick={() =>
                      go({ ...filters, resumes: toggleIn(filters.resumes, resume.id) })
                    }
                  />
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
            <CommandGroup heading="Sitting still for">
              {WAITING.map((days) => (
                <Row
                  key={days}
                  id={`w-${days}`}
                  label={`${days} days or more`}
                  on={filters.waiting === days}
                  onPick={() =>
                    go({ ...filters, waiting: filters.waiting === days ? null : days })
                  }
                />
              ))}
            </CommandGroup>

            {/* Sitting still is about the stage; quiet is about you. An
                application can be three days into Screening and three weeks
                since anyone said anything. */}
            <CommandGroup heading="Nothing logged for">
              {WAITING.map((days) => (
                <Row
                  key={days}
                  id={`qd-${days}`}
                  label={`${days} days or more`}
                  on={filters.quiet === days}
                  onPick={() => go({ ...filters, quiet: filters.quiet === days ? null : days })}
                />
              ))}
            </CommandGroup>

            <CommandGroup heading="Want it at least">
              {EXCITEMENT.map((score) => (
                <Row
                  key={score}
                  id={`x-${score}`}
                  label={score === 5 ? "5 — the dream" : "4 or more"}
                  on={filters.excitement === score}
                  onPick={() =>
                    go({ ...filters, excitement: filters.excitement === score ? null : score })
                  }
                />
              ))}
            </CommandGroup>

            {active > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="clear these filters"
                    onSelect={() =>
                      go({
                        ...filters,
                        tags: [],
                        companies: [],
                        resumes: [],
                        waiting: null,
                        quiet: null,
                        excitement: null,
                      })
                    }
                    className="px-2 py-1.5"
                  >
                    <XIcon className="size-3.5" />
                    Clear these
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  id,
  label,
  count,
  on,
  dot,
  onPick,
}: {
  /**
   * Unique across the whole list. cmdk keys selection on an item's `value`, so
   * two rows sharing one — a tag and a company both called "LinkedIn", which
   * is the likely case here — would both highlight and Enter would fire
   * whichever is first in the DOM.
   */
  id: string;
  label: string;
  count?: number;
  on: boolean;
  dot?: string;
  onPick: () => void;
}) {
  return (
    <CommandItem value={`${label} ${id}`} onSelect={onPick} className="px-2 py-1.5">
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border",
          on && "bg-primary border-primary text-primary-foreground",
        )}
      >
        {on && <span className="text-[9px] leading-none">✓</span>}
      </span>
      {dot && (
        <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-faint nums text-[11px]">{count}</span>}
    </CommandItem>
  );
}
