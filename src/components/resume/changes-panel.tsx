"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import { resumeChangesAction, setResumeBaseAction } from "@/server/actions";
import type { Stage } from "@prisma/client";
import { cn } from "@/lib/utils";

type Changes = Awaited<ReturnType<typeof resumeChangesAction>>;

export type LinkedApplication = {
  id: string;
  roleTitle: string;
  stage: Stage;
  company: string;
  appliedAt: string | null;
};

/**
 * What this document is, against what it came from.
 *
 * Tailoring was a one-way street: duplicate, rewrite, send, and no way back to
 * what you changed. The panel answers three questions in one place — what
 * moved against the base, which of your own notes stand behind each claim, and
 * which jobs this document was actually sent to.
 *
 * The diff is computed on the server from what is SAVED, and the editor
 * flushes its autosave before opening: a diff of a document you are still
 * typing is a diff of a document that does not exist yet.
 */
export function ChangesPanel({
  resumeId,
  base,
  siblings,
  applications,
  onOpen,
}: {
  resumeId: string;
  base: { id: string; name: string } | null;
  /** Every other resume, for saying which one this was tailored from. */
  siblings: { id: string; name: string }[];
  applications: LinkedApplication[];
  /** Flush the editor's autosave. The diff reads saved data, not the screen. */
  onOpen: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [tab, setTab] = useState<"changes" | "evidence" | "sent">("changes");
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = () => {
    startLoading(async () => {
      try {
        await onOpen();
        setChanges(await resumeChangesAction(resumeId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not read the changes.");
      }
    });
  };

  const pickBase = (value: string) => {
    startSaving(async () => {
      try {
        await setResumeBaseAction(resumeId, value === "none" ? null : value);
        setChanges(await resumeChangesAction(resumeId));
        toast.success(value === "none" ? "Unlinked" : "Base set");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not set that base.");
      }
    });
  };

  const totals = changes?.diff?.totals;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        <GitBranchIcon /> Changes
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-xl sm:p-6">
          <SheetTitle>Changes</SheetTitle>
          <SheetDescription className="sr-only">
            What this resume changed against the one it was tailored from, the brain material
            behind each bullet, and the applications it was sent to.
          </SheetDescription>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-faint text-[12px]">Tailored from</span>
              <Select
                value={base?.id ?? "none"}
                onValueChange={pickBase}
                disabled={saving || loading}
              >
                <SelectTrigger size="sm" className="w-56">
                  <SelectValue placeholder="Nothing yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nothing — this is an original</SelectItem>
                  {siblings.map((sibling) => (
                    <SelectItem key={sibling.id} value={sibling.id}>
                      {sibling.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-1 border-b">
              {(
                [
                  ["changes", "What changed"],
                  ["evidence", "Evidence"],
                  ["sent", `Sent to ${applications.length}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "-mb-px border-b-2 px-2 py-1.5 text-[12.5px] transition-colors",
                    tab === key
                      ? "border-foreground text-foreground font-medium"
                      : "text-muted-foreground border-transparent hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {loading && (
              <div className="flex justify-center py-8">
                <LoaderCircleIcon className="text-faint size-5 animate-spin" />
              </div>
            )}

            {!loading && tab === "changes" && (
              <div className="space-y-4">
                {!changes?.diff ? (
                  <p className="text-muted-foreground text-[13px] leading-relaxed">
                    {changes?.note ??
                      "Nothing to compare against yet. Say what this was tailored from above and the changes appear here."}
                  </p>
                ) : changes.diff.identical ? (
                  <p className="text-muted-foreground text-[13px]">
                    Identical to {changes.base?.name}. Nothing has been tailored yet.
                  </p>
                ) : (
                  <>
                    {totals && (
                      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                        <Count n={totals.bulletsAdded} label="added" tone="add" />
                        <Count n={totals.bulletsRemoved} label="dropped" tone="drop" />
                        <Count n={totals.bulletsEdited} label="reworded" tone="edit" />
                        <Count n={totals.entriesRemoved} label="roles cut" tone="drop" />
                        <Count n={totals.sectionsHidden} label="sections hidden" tone="drop" />
                      </div>
                    )}

                    {changes.diff.header.length > 0 && (
                      <Block title="Header">
                        {changes.diff.header.map((field) => (
                          <div key={field.field} className="text-[12.5px]">
                            <span className="text-faint">{field.field}: </span>
                            <span className="text-muted-foreground line-through">
                              {field.from || "—"}
                            </span>
                            <ArrowRightIcon className="mx-1 inline size-3" />
                            <span>{field.to || "—"}</span>
                          </div>
                        ))}
                      </Block>
                    )}

                    {changes.diff.sections
                      .filter(
                        (section) =>
                          section.status !== "unchanged" ||
                          section.renamed ||
                          section.visibility ||
                          section.text ||
                          section.entries.some((entry) => entry.status !== "unchanged"),
                      )
                      .map((section, index) => (
                        <Block
                          key={`${section.kind}-${index}`}
                          title={section.heading}
                          note={
                            section.status !== "unchanged"
                              ? section.status
                              : section.visibility?.to === false
                                ? "hidden"
                                : section.renamed
                                  ? `renamed from ${section.renamed.from}`
                                  : undefined
                          }
                        >
                          {section.text && (
                            <p className="text-[12.5px] leading-relaxed">
                              <span className="text-muted-foreground line-through">
                                {section.text.from}
                              </span>
                              <br />
                              {section.text.to}
                            </p>
                          )}
                          {section.entries
                            .filter((entry) => entry.status !== "unchanged")
                            .map((entry, entryIndex) => (
                              <div key={`${entry.label}-${entryIndex}`} className="space-y-1">
                                <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
                                  {entry.label}
                                  {entry.status !== "edited" && (
                                    <span className="text-faint text-[11px] font-normal">
                                      {entry.status}
                                    </span>
                                  )}
                                </div>
                                {entry.fields.map((field) => (
                                  <div key={field.field} className="text-faint pl-3 text-[12px]">
                                    {field.field}: {field.from || "—"} → {field.to || "—"}
                                  </div>
                                ))}
                                {entry.bullets
                                  .filter((bullet) => bullet.status !== "unchanged")
                                  .map((bullet, bulletIndex) => (
                                    <Bullet key={bulletIndex} bullet={bullet} />
                                  ))}
                              </div>
                            ))}
                        </Block>
                      ))}
                  </>
                )}
              </div>
            )}

            {!loading && tab === "evidence" && changes && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-[12.5px] leading-relaxed">
                  Which of your own notes stand behind each claim, matched on the words
                  themselves. {changes.evidence.unbacked > 0 ? (
                    <>
                      <span className="text-foreground font-medium">
                        {changes.evidence.unbacked}
                      </span>{" "}
                      of {changes.evidence.bullets.length} have nothing behind them yet — those
                      are the lines you cannot expand on from your own material.
                    </>
                  ) : (
                    <>Every bullet here traces back to something you wrote down.</>
                  )}
                </p>
                {changes.evidence.bullets.map((row, index) => (
                  <div key={index} className="border-l-2 pl-3">
                    <div className="text-faint text-[11px]">{row.entry}</div>
                    <div className="text-[12.5px]">{row.bullet}</div>
                    {row.evidence.length === 0 ? (
                      <div className="text-[var(--warning)] mt-0.5 text-[11.5px]">
                        Nothing in your brain says this yet
                      </div>
                    ) : (
                      row.evidence.map((hit) => (
                        <div key={hit.highlightId} className="text-muted-foreground mt-0.5 text-[11.5px]">
                          {Math.round(hit.similarity * 100)}% · {hit.text}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}

            {!loading && tab === "sent" && (
              <div className="space-y-2">
                {applications.length === 0 ? (
                  <p className="text-muted-foreground text-[13px]">
                    This document has not gone anywhere yet. Attach it to an application and it
                    shows up here.
                  </p>
                ) : (
                  applications.map((application) => (
                    <Link
                      key={application.id}
                      href={`/applications/${application.id}`}
                      className="bg-inset hover:bg-accent flex items-center gap-2 rounded-control p-2 transition-colors"
                    >
                      <BriefcaseIcon className="text-muted-foreground size-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{application.company}</div>
                        <div className="text-faint truncate text-[11.5px]">
                          {application.roleTitle}
                        </div>
                      </div>
                      <span
                        className="stage-chip shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-medium"
                        style={{ ["--tone" as string]: STAGE_TONE[application.stage] }}
                      >
                        {STAGE_LABEL[application.stage]}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: "add" | "drop" | "edit" }) {
  if (n === 0) return null;
  return (
    <span
      className={cn(
        "flex items-center gap-1",
        tone === "add" && "text-[var(--success)]",
        tone === "drop" && "text-destructive",
      )}
    >
      <span className="nums font-medium">{n}</span> {label}
    </span>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {note && <span className="text-faint text-[11px]">{note}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Bullet({ bullet }: { bullet: { status: string; text: string; from?: string } }) {
  const icon =
    bullet.status === "added" ? (
      <PlusIcon className="mt-0.5 size-3 shrink-0 text-[var(--success)]" />
    ) : bullet.status === "removed" ? (
      <MinusIcon className="text-destructive mt-0.5 size-3 shrink-0" />
    ) : (
      <PencilIcon className="text-muted-foreground mt-0.5 size-3 shrink-0" />
    );

  return (
    <div className="flex gap-1.5 pl-3">
      {icon}
      <div className="min-w-0 text-[12.5px] leading-snug">
        {bullet.from && (
          <div className="text-muted-foreground line-through">{bullet.from}</div>
        )}
        <div className={cn(bullet.status === "removed" && "text-muted-foreground line-through")}>
          {bullet.text}
        </div>
      </div>
    </div>
  );
}
