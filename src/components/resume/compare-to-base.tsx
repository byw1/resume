"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GitCompareIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { diffResumeDocs } from "@/lib/resume-diff";
import type { ResumeDoc } from "@/lib/resume-schema";

/**
 * The tailoring, made reviewable. Lives in the editor toolbar of any resume
 * with a recorded base, and computes the diff live from the document being
 * edited — no save, no fetch — so the button's own label answers "have I
 * actually changed anything yet?".
 */
export function CompareToBase({
  base,
  doc,
}: {
  base: { id: string; name: string; doc: ResumeDoc };
  doc: ResumeDoc;
}) {
  const diff = useMemo(() => diffResumeDocs(base.doc, doc), [base.doc, doc]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hidden md:inline-flex">
          <GitCompareIcon className="size-3.5" />
          <span className="max-w-[14rem] truncate">
            {diff.identical ? "Same as base" : diff.summary}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80svh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compared to {base.name}</DialogTitle>
          <DialogDescription>
            {diff.identical
              ? "This variant still matches its base exactly."
              : "What this variant changes. A reworded bullet shows as removed and added, old wording beside new."}
          </DialogDescription>
        </DialogHeader>

        {!diff.identical && (
          <div className="space-y-4 text-[13px]">
            {diff.headerChanged.length > 0 && (
              <div>
                <div className="font-medium">Header</div>
                <p className="text-muted-foreground text-xs">
                  Changed: {diff.headerChanged.join(", ")}
                </p>
              </div>
            )}

            {diff.sections.map((section, index) => (
              <div key={`${section.kind}-${section.heading}-${index}`}>
                <div className="flex items-baseline gap-2 font-medium">
                  {section.heading || section.kind}
                  {section.status !== "changed" && (
                    <span className="text-muted-foreground text-xs font-normal">
                      section {section.status}
                    </span>
                  )}
                  {section.detail && (
                    <span className="text-muted-foreground text-xs font-normal">
                      {section.detail}
                    </span>
                  )}
                </div>

                {section.textChanged && (
                  <p className="text-muted-foreground text-xs">Text rewritten.</p>
                )}

                {section.items.map((item) => (
                  <div key={item.label + item.status} className="mt-1.5">
                    <div className="text-xs font-medium">
                      {item.label}
                      {item.status !== "changed" && (
                        <span className="text-muted-foreground ml-1.5 font-normal">
                          {item.status}
                        </span>
                      )}
                      {item.summaryChanged && (
                        <span className="text-muted-foreground ml-1.5 font-normal">
                          summary edited
                        </span>
                      )}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {item.bulletsRemoved.map((bullet) => (
                        <li key={`r-${bullet}`} className="text-destructive flex gap-1.5 text-xs">
                          <MinusIcon className="mt-0.5 size-3 shrink-0" />
                          <span className="line-through decoration-[color:var(--destructive)]/40">
                            {bullet}
                          </span>
                        </li>
                      ))}
                      {item.bulletsAdded.map((bullet) => (
                        <li key={`a-${bullet}`} className="text-success flex gap-1.5 text-xs">
                          <PlusIcon className="mt-0.5 size-3 shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href={`/resumes/${base.id}`}>Open the base resume</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
