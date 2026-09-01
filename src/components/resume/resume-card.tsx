"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  DownloadIcon,
  Link2Icon,
  LinkIcon,
  MoreVerticalIcon,
  PenLineIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  deleteResumeAction,
  duplicateResumeAction,
  updateResumeAction,
} from "@/server/actions";

/**
 * One resume in the grid. The thumbnail comes in as a server-rendered slot —
 * the document itself never becomes client work — and the card around it is a
 * client component so the actions that used to require opening the editor
 * (favourite, duplicate, PDF, copy link, delete) are one click from here.
 *
 * Deliberately NOT one big <Link>: the star, the menu and the badges are
 * interactive, and nesting controls inside an anchor is how a click on "delete"
 * also navigates. The thumbnail and the title are the links.
 */
export function ResumeCard({
  id,
  name,
  target,
  template,
  pages,
  publicUrl,
  photoOnPublicPage,
  applications,
  outcomes,
  isFavorite: initialFavorite,
  updatedLabel,
  children,
}: {
  id: string;
  name: string;
  target: string;
  template: string;
  /** Estimated page count, computed server-side from the same gauge the editor shows. */
  pages: number;
  /** The live public link, or null when unpublished. */
  publicUrl: string | null;
  /** True when the public page shows the owner's photo — worth a louder tooltip. */
  photoOnPublicPage: boolean;
  applications: number;
  /** Where the applications this resume went out with actually got to. */
  outcomes: { sent: number; interviewed: number; offers: number };
  isFavorite: boolean;
  updatedLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic: the star flips immediately, the revalidated grid re-orders on
  // its own time. Rendering `initialFavorite` until the server round-trip made
  // the click feel dead.
  const [favorite, setFavorite] = useState(initialFavorite);

  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    startTransition(async () => {
      await updateResumeAction(id, { isFavorite: next });
    });
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Public link copied");
  };

  return (
    <Card className="group overflow-hidden p-0 transition-shadow duration-200 ease-[var(--ease-settle)] hover:shadow-raised">
      {/* Live thumbnail of the actual document */}
      <Link
        href={`/resumes/${id}`}
        aria-label={`Open ${name}`}
        className="relative block border-b"
      >
        {children}
        {/* The page is cropped, so fade the cut rather than ending it on a
            hard line mid-sentence. The paper is white in both themes. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
      </Link>

      <CardContent className="pt-4">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <Link
              href={`/resumes/${id}`}
              className="block truncate text-sm font-semibold hover:underline"
            >
              {name}
            </Link>
            <div className="text-muted-foreground truncate text-xs">
              {target || "No target set"}
            </div>
          </div>

          <button
            onClick={toggleFavorite}
            aria-label={favorite ? "Unfavourite" : "Favourite"}
            aria-pressed={favorite}
            className={cn(
              "mt-0.5 shrink-0 rounded p-0.5 transition-colors",
              favorite
                ? "text-primary"
                : "text-muted-foreground/40 hover:text-muted-foreground",
            )}
          >
            <StarIcon className={cn("size-3.5", favorite && "fill-primary")} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground -mr-2 -mt-1 shrink-0"
                aria-label="Resume actions"
              >
                <MoreVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/resumes/${id}`}>
                  <PenLineIcon /> Open
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pending}
                onSelect={() =>
                  startTransition(async () => {
                    const copyId = await duplicateResumeAction(id);
                    toast.success("Duplicated");
                    router.push(`/resumes/${copyId}`);
                  })
                }
              >
                <CopyIcon /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/resumes/${id}/pdf`}>
                  <DownloadIcon /> Download PDF
                </a>
              </DropdownMenuItem>
              {publicUrl && (
                <DropdownMenuItem onSelect={copyLink}>
                  <Link2Icon /> Copy public link
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onSelect={() => {
                  if (confirm(`Delete "${name}"? This cannot be undone.`)) {
                    startTransition(async () => {
                      await deleteResumeAction(id);
                    });
                  }
                }}
              >
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Badge variant="secondary" className="text-[10px] capitalize">
            {template}
          </Badge>
          <Badge
            variant={pages > 1 ? "warning" : "success"}
            className="text-[10px] tabular-nums"
          >
            {pages} page{pages > 1 ? "s" : ""}
          </Badge>
          {publicUrl && (
            <button
              onClick={copyLink}
              title={
                photoOnPublicPage
                  ? "Anyone with the link can read this — including your photo. Click to copy."
                  : "Anyone with the link can read this. Click to copy."
              }
              aria-label="Copy public link"
            >
              <Badge variant="accent" className="text-[10px]">
                <Link2Icon className="size-2.5" /> Live
              </Badge>
            </button>
          )}
          {applications > 0 && (
            <Link
              href={`/applications?cv=${id}`}
              title="See the applications this resume went out with"
            >
              <Badge variant="outline" className="text-[10px] tabular-nums">
                <LinkIcon className="size-2.5" />
                {applications} application{applications > 1 ? "s" : ""}
              </Badge>
            </Link>
          )}
          <span className="text-muted-foreground ml-auto text-[11px]">{updatedLabel}</span>
        </div>

        {/* The track record: what actually came back from the applications
            this document went out with. The one thing a resume tool attached
            to a pipeline can say that a resume tool alone cannot. */}
        {outcomes.sent > 0 && (
          <div
            className="text-muted-foreground mt-2 text-[11px] tabular-nums"
            title="Counts include applications that interviewed and later closed"
          >
            {outcomes.sent} sent
            {outcomes.interviewed > 0
              ? ` · ${outcomes.interviewed} interview${outcomes.interviewed > 1 ? "s" : ""}`
              : " · no interviews yet"}
            {outcomes.offers > 0 && ` · ${outcomes.offers} offer${outcomes.offers > 1 ? "s" : ""}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
