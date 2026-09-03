"use client";

import { useTransition } from "react";
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
import { cn } from "@/lib/utils";

/**
 * Everything a chip row cannot hold, on any screen.
 *
 * Chips are for a handful of colour-coded values you reach for constantly. The
 * dimensions in here are unbounded — forty companies, a dozen tags, five
 * resumes — so a chip each would be a wall, and they belong behind one control
 * that says how many are on.
 *
 * The shell only. Each screen builds its own groups and its own hrefs, so the
 * pipeline's URL grammar and the CRM's stay separate while the popover, the
 * keyboard behaviour and the "Clear these" row are defined once.
 */
export type FacetRow = {
  /**
   * Unique across the whole list. cmdk keys selection on an item's `value`, so
   * two rows sharing one — a tag and a company both called "LinkedIn", which
   * is the likely case here — would both highlight and Enter would fire
   * whichever is first in the DOM.
   */
  id: string;
  label: string;
  /** Where clicking it goes. Built by the caller, in that screen's grammar. */
  href: string;
  on: boolean;
  count?: number;
  /** A resolved CSS colour, so this file never imports the tags module. */
  dot?: string;
};

export type FacetGroup = {
  heading: string;
  rows: FacetRow[];
  /** Draw a rule above this group. */
  separated?: boolean;
};

export function FacetMenu({
  groups,
  activeCount,
  clearHref,
  placeholder,
  note,
  label = "Filter",
  ariaLabel,
}: {
  groups: FacetGroup[];
  activeCount: number;
  clearHref: string;
  placeholder: string;
  /** Shown above the groups when the current view cannot honour all of them. */
  note?: string;
  label?: string;
  ariaLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Rows navigate through the router rather than being anchors: cmdk's
  // CommandItem has no `asChild`, so a Link inside one is not a thing that can
  // exist.
  const go = (href: string) => startTransition(() => router.push(href));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={activeCount > 0 ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          aria-label={ariaLabel}
          aria-busy={pending}
        >
          <FilterIcon />
          {label}
          {activeCount > 0 && <span className="nums ml-0.5">{activeCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command loop>
          <CommandInput placeholder={placeholder} className="h-9" />
          <CommandList className="max-h-[22rem]">
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {note && (
              <p className="text-muted-foreground border-b px-3 py-2 text-[12px]">{note}</p>
            )}

            {groups.map((group) =>
              group.rows.length === 0 ? null : (
                <div key={group.heading}>
                  {group.separated && <CommandSeparator />}
                  <CommandGroup heading={group.heading}>
                    {group.rows.map((row) => (
                      <CommandItem
                        key={row.id}
                        value={`${row.label} ${row.id}`}
                        onSelect={() => go(row.href)}
                        className="px-2 py-1.5"
                      >
                        <span
                          className={cn(
                            "flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border",
                            row.on && "bg-primary border-primary text-primary-foreground",
                          )}
                        >
                          {row.on && <span className="text-[9px] leading-none">✓</span>}
                        </span>
                        {row.dot && (
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: row.dot }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{row.label}</span>
                        {row.count !== undefined && (
                          <span className="text-faint nums text-[11px]">{row.count}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              ),
            )}

            {activeCount > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="clear these filters"
                    onSelect={() => go(clearHref)}
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
