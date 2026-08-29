"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookmarkIcon, CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteSavedViewAction, saveViewAction } from "@/server/actions";
import { cn } from "@/lib/utils";

export type SavedViewRow = { id: string; name: string; query: string };

/**
 * Named cuts of the pipeline.
 *
 * The URL is already the state of this screen, so a saved view is a name for a
 * query string and the whole feature is a list of links. It lives in a menu
 * rather than as another row of chips because the filter strip is already the
 * busiest thing on the page, and a view is something you reach for
 * occasionally rather than something you scan.
 */
export function SavedViews({ views, current }: { views: SavedViewRow[]; current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const query = params.toString();
  const active = views.find((view) => view.query === current);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await saveViewAction(trimmed, query);
        setName("");
        setNaming(false);
        setOpen(false);
        toast.success(`Saved "${trimmed}"`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save that view.");
      }
    });
  };

  const remove = (view: SavedViewRow) =>
    startTransition(async () => {
      try {
        await deleteSavedViewAction(view.id);
        toast.success(`Deleted "${view.name}"`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete that view.");
      }
    });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BookmarkIcon className="size-3.5" />
          {active ? active.name : "Views"}
          {views.length > 0 && !active && (
            <span className="text-faint meta text-[11.5px]">{views.length}</span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        {views.length === 0 && !naming && (
          <p className="text-muted-foreground px-2 py-2 text-[12.5px] leading-snug">
            Filter and sort the pipeline the way you want it, then save it here and it becomes
            one click.
          </p>
        )}

        {views.map((view) => (
          <DropdownMenuItem key={view.id} asChild className="group/view">
            <Link href={`/applications${view.query ? `?${view.query}` : ""}`}>
              <CheckIcon
                className={cn("size-3.5 shrink-0", active?.id === view.id ? "" : "opacity-0")}
              />
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              {/* A destructive control inside a menu item: it stops the click
                  from also navigating, which is the one thing that would make
                  deleting a view feel like a trap. */}
              <button
                type="button"
                aria-label={`Delete ${view.name}`}
                className="text-faint hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover/view:opacity-100"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  remove(view);
                }}
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </Link>
          </DropdownMenuItem>
        ))}

        {views.length > 0 && <DropdownMenuSeparator />}

        {naming ? (
          <div className="flex gap-1.5 p-1.5">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") setNaming(false);
              }}
              placeholder="Chasing"
              className="h-8 md:h-8"
            />
            <Button size="sm" onClick={save} disabled={pending || !name.trim()}>
              Save
            </Button>
          </div>
        ) : (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setNaming(true);
            }}
          >
            <PlusIcon className="size-3.5" />
            Save this view
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
