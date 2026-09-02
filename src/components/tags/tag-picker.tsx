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
import { TagChip, type TagValue } from "@/components/tags/tag-chip";
import { TAG_COLORS, TAG_KIND_LABEL, TAG_SUGGESTIONS, tagTone } from "@/lib/data/tags";
import type { TagKind } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  createTagAction,
  deleteTagAction,
  listTagsAction,
  seedTagsAction,
  updateTagAction,
} from "@/server/actions";

export type TagOption = TagValue & { count: number };

/**
 * One picker for every list a person owns: where an application came from, an
 * industry, a size, a location, how a contact is filed.
 *
 * It was six different things once — one multi-select and five free-text boxes
 * — which meant a typo you fixed record by record, one value where several
 * were true, and no way to delete an option you never wanted. Now every list
 * behaves the same: tick to attach, type to create, recolour from the swatch
 * row, and delete outright. Deleting says how many things it comes off,
 * because that is what you want to know before you do it rather than after.
 *
 * Options are fetched when it opens rather than threaded through every page:
 * the list changes from anywhere (an assistant creating one over MCP included)
 * and a stale catalogue is how duplicates get made.
 */
export function TagPicker({
  kind,
  value,
  options: initialOptions,
  onChange,
  onCatalogChange,
  placeholder,
  className,
}: {
  kind: TagKind;
  value: TagValue[];
  /** What the page already knows, so the picker opens populated. */
  options?: TagOption[];
  onChange: (next: TagValue[]) => void;
  /**
   * Called when the CATALOGUE changed — a tag created, recoloured or deleted —
   * as opposed to which ones this thing wears. Hosts that render from a server
   * action rather than the route need it: router.refresh() alone leaves them
   * on the snapshot they opened with.
   */
  onCatalogChange?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<TagOption[]>(initialOptions ?? []);
  const [loaded, setLoaded] = useState(Boolean(initialOptions));
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const label = TAG_KIND_LABEL[kind];
  const seedable = (TAG_SUGGESTIONS[kind] ?? []).length > 0;

  const load = () => {
    startTransition(async () => {
      try {
        setOptions(await listTagsAction(kind));
        setLoaded(true);
      } catch {
        // A picker that cannot read its list can still create one.
        setLoaded(true);
      }
    });
  };

  const notify = () => {
    load();
    router.refresh();
    onCatalogChange?.();
  };

  const has = (id: string) => value.some((item) => item.id === id);

  const toggle = (tag: TagValue) => {
    onChange(has(tag.id) ? value.filter((item) => item.id !== tag.id) : [...value, tag]);
  };

  const create = () => {
    const name = query.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const created = await createTagAction({ kind, name });
        onChange([...value, created]);
        setQuery("");
        notify();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create that.");
      }
    });
  };

  const recolour = (tag: TagOption, color: string) => {
    startTransition(async () => {
      try {
        await updateTagAction(tag.id, { color });
        // Whatever is attached here has to change colour too, or the chips
        // above disagree with the list below until a reload.
        onChange(value.map((item) => (item.id === tag.id ? { ...item, color } : item)));
        notify();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not recolour that.");
      }
    });
  };

  const remove = (tag: TagOption) => {
    const warning =
      tag.count > 0
        ? `Delete "${tag.name}"? It comes off ${tag.count} thing${tag.count === 1 ? "" : "s"}, which are otherwise untouched.`
        : `Delete "${tag.name}"?`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      try {
        await deleteTagAction(tag.id);
        onChange(value.filter((item) => item.id !== tag.id));
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
    <div className={cn("space-y-1.5", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <span key={tag.id} className="inline-flex items-center">
              <TagChip tag={tag} className="pr-0.5" />
              <button
                type="button"
                onClick={() => toggle(tag)}
                aria-label={`Remove ${tag.name}`}
                className="text-muted-foreground hover:text-foreground -ml-1 rounded p-0.5 transition-colors"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next && !loaded) load();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground w-full justify-start font-normal"
          >
            <PlusIcon className="size-3.5" />
            {value.length === 0
              ? (placeholder ?? `Add ${label.one.toLowerCase()}`)
              : `Add another`}
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
                    {loaded
                      ? `No ${label.many.toLowerCase()} yet. Name one above${seedable ? ", or start with the usual set" : ""}.`
                      : "Reading your list…"}
                  </p>
                  {loaded && seedable && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            setOptions(await seedTagsAction(kind));
                            router.refresh();
                            onCatalogChange?.();
                          } catch {
                            toast.error("Could not add those.");
                          }
                        });
                      }}
                    >
                      Add the usual ones
                    </Button>
                  )}
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
                        style={{ background: tagTone(option.color) }}
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
                        {option.count || 0}
                      </button>
                    </CommandItem>

                    {editing === option.id && (
                      <div className="flex items-center gap-1 px-2 pb-2 pl-8">
                        {TAG_COLORS.map((colour) => (
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
                            style={{ background: tagTone(colour) }}
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
