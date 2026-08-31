"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SourceChip, type SourceValue } from "@/components/pipeline/source-chip";
import { SOURCE_COLORS, sourceTone } from "@/lib/data/pipeline";
import { cn } from "@/lib/utils";
import {
  createSourceAction,
  deleteSourceAction,
  seedSourcesAction,
  updateSourceAction,
} from "@/server/actions";

export type SourceOption = SourceValue & { applications: number };

/**
 * Where an application came from, as categories the person owns.
 *
 * The old version offered every string anyone had ever typed plus six starters
 * hardcoded into the list, and there was no way to remove any of it — which is
 * precisely the complaint this replaces. Now the list is rows: tick to attach,
 * recolour from the swatch row, rename, and delete outright. Deleting takes the
 * category off every application that carried it and says how many, because
 * that is the thing you want to know before you do it, not after.
 */
export function SourcesInput({
  value,
  options,
  onChange,
  onCatalogChange,
}: {
  value: SourceValue[];
  /** Every category on file, with usage counts. */
  options: SourceOption[];
  onChange: (next: SourceValue[]) => void;
  /**
   * Called when the CATALOGUE changed — a category created, recoloured or
   * deleted — as opposed to which ones this application wears. The host has to
   * re-fetch `options`, and in the slide-over that is a server action rather
   * than the route, so router.refresh() alone would leave the list stale.
   */
  onCatalogChange?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const notify = () => {
    router.refresh();
    onCatalogChange?.();
  };

  const has = (id: string) => value.some((item) => item.id === id);

  const toggle = (source: SourceValue) => {
    onChange(
      has(source.id) ? value.filter((item) => item.id !== source.id) : [...value, source],
    );
  };

  const create = () => {
    const name = query.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const created = await createSourceAction({ name });
        onChange([...value, created]);
        setQuery("");
        notify();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create that.");
      }
    });
  };

  const recolour = (source: SourceOption, color: string) => {
    startTransition(async () => {
      try {
        await updateSourceAction(source.id, { color });
        // Whatever is attached here has to change colour too, or the chips
        // above disagree with the list below until a reload.
        onChange(value.map((item) => (item.id === source.id ? { ...item, color } : item)));
        notify();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not recolour that.");
      }
    });
  };

  const remove = (source: SourceOption) => {
    const warning =
      source.applications > 0
        ? `Delete "${source.name}"? It comes off ${source.applications} application${source.applications === 1 ? "" : "s"}, which are otherwise untouched.`
        : `Delete "${source.name}"?`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      try {
        await deleteSourceAction(source.id);
        onChange(value.filter((item) => item.id !== source.id));
        setEditing(null);
        notify();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete that.");
      }
    });
  };

  const typed = query.trim();
  const exists = options.some((option) => option.name.toLowerCase() === typed.toLowerCase());

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((source) => (
            <span key={source.id} className="inline-flex items-center">
              <SourceChip source={source} className="pr-0.5" />
              <button
                type="button"
                onClick={() => toggle(source)}
                aria-label={`Take ${source.name} off this application`}
                className="text-muted-foreground hover:text-foreground -ml-1 rounded p-0.5 transition-colors"
              >
                <XIcon className="size-3" />
              </button>
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
            className="text-muted-foreground w-full justify-start font-normal"
          >
            <PlusIcon className="size-3.5" />
            {value.length === 0 ? "Where did this come from?" : "Add a source"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command loop>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Pick or name a new one…"
              className="h-9"
            />
            <CommandList>
              {options.length === 0 && (
                <div className="space-y-2 p-3 text-center">
                  <p className="text-muted-foreground text-[13px]">
                    No categories yet. Name one above, or start with the usual set.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await seedSourcesAction();
                          notify();
                        } catch {
                          toast.error("Could not add those.");
                        }
                      });
                    }}
                  >
                    Add the usual six
                  </Button>
                </div>
              )}
              <CommandGroup>
                {options.map((option) => (
                  <div key={option.id}>
                    <CommandItem
                      value={option.name}
                      onSelect={() => toggle(option)}
                      className="px-2 py-1.5"
                    >
                      <CheckIcon
                        className={cn("size-3.5", has(option.id) ? "opacity-100" : "opacity-0")}
                      />
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: sourceTone(option.color) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{option.name}</span>
                      <button
                        type="button"
                        aria-label={`Edit ${option.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(editing === option.id ? null : option.id);
                        }}
                        className="text-faint hover:text-foreground shrink-0 text-[11px]"
                      >
                        {option.applications || 0}
                      </button>
                    </CommandItem>

                    {editing === option.id && (
                      <div className="flex items-center gap-1 px-2 pb-2 pl-8">
                        {SOURCE_COLORS.map((colour) => (
                          <button
                            key={colour}
                            type="button"
                            aria-label={`Colour ${option.name} ${colour}`}
                            disabled={pending}
                            onClick={() => recolour(option, colour)}
                            className={cn(
                              "size-4 rounded-full transition-transform hover:scale-110",
                              option.color === colour && "ring-foreground ring-2 ring-offset-1",
                            )}
                            style={{ background: sourceTone(colour) }}
                          />
                        ))}
                        <button
                          type="button"
                          aria-label={`Delete ${option.name}`}
                          disabled={pending}
                          onClick={() => remove(option)}
                          className="text-muted-foreground hover:text-destructive ml-auto p-1 transition-colors"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {typed && !exists && (
                  <CommandItem
                    forceMount
                    value="±new±"
                    onSelect={create}
                    className="px-2 py-1.5"
                  >
                    <PlusIcon className="size-3.5" />
                    Create “{typed}”
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
