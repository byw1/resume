"use client";

import { useState } from "react";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/**
 * Where an application came from, as chips plus a picker.
 *
 * A select would force one answer and an enum would force our answers; real
 * applications come from several directions at once ("LinkedIn" AND "Referral")
 * and from channels nobody predicted. So: multi-select over suggestions — the
 * person's own past sources first, then the starters — with a typed value one
 * keystroke away from becoming a new option.
 */
export function SourcesInput({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string[];
  /** Offered choices. The person's own past sources, then the starter set. */
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const has = (candidate: string) =>
    value.some((item) => item.toLowerCase() === candidate.toLowerCase());

  const toggle = (candidate: string) => {
    const clean = candidate.trim();
    if (!clean) return;
    onChange(
      has(clean)
        ? value.filter((item) => item.toLowerCase() !== clean.toLowerCase())
        : [...value, clean],
    );
    setQuery("");
  };

  // Selected values that came from nowhere (an assistant wrote them, an old
  // record) still need to be listed, or they could never be unticked.
  const listed = [
    ...options,
    ...value.filter((item) => !options.some((option) => option.toLowerCase() === item.toLowerCase())),
  ];
  const trimmedQuery = query.trim();
  const queryIsNew =
    trimmedQuery.length > 0 &&
    !listed.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((source) => (
            <span
              key={source}
              className="bg-inset text-foreground flex items-center gap-1 rounded-chip py-0.5 pr-1 pl-2 text-[12px] font-medium"
            >
              {source}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(source)}
                  aria-label={`Remove ${source}`}
                  className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="text-muted-foreground w-full justify-start font-normal"
          >
            <PlusIcon className="size-3.5" />
            {value.length === 0 ? "Where did this come from?" : "Add a source"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command loop>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Pick or type your own…"
              className="h-9"
            />
            <CommandList>
              <CommandGroup>
                {listed.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => toggle(option)}
                    className="px-2 py-1.5"
                  >
                    <CheckIcon
                      className={cn("size-3.5", has(option) ? "opacity-100" : "opacity-0")}
                    />
                    {option}
                  </CommandItem>
                ))}
                {queryIsNew && (
                  <CommandItem
                    // forceMount with a value the query won't score against,
                    // so this row sorts BELOW every real match: Enter on
                    // "linked" picks LinkedIn rather than minting a
                    // near-duplicate "linked". With no matches at all it is
                    // the only row, and Enter creates.
                    forceMount
                    value="±add±"
                    onSelect={() => toggle(trimmedQuery)}
                    className="px-2 py-1.5"
                  >
                    <PlusIcon className="size-3.5" />
                    Add “{trimmedQuery}”
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
