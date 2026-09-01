"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { DownloadIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseResumeText } from "@/lib/resume-parse";
import { importBrainAction } from "@/server/actions";
import type { BrainImport } from "@/lib/data/brain";

/**
 * Paste a resume, check what it read, keep what is right.
 *
 * The empty workspace is the reason people leave before they start, and until
 * now the only way out of it was typing a career into a form. The parse is a
 * draft and is shown as one: every role it found is editable and removable
 * here, and nothing reaches the database until the button at the bottom.
 *
 * The better path is still the conversation — an assistant reads the document
 * and calls import_resume — and the dialog says so, because a person who
 * connects Claude once never needs this screen again.
 */
export function ImportDialog() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<BrainImport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (params.get("import")) setOpen(true);
  }, [params]);

  const roleCount = draft?.roles?.length ?? 0;
  const summary = useMemo(() => {
    if (!draft) return "";
    const counts = [
      [roleCount, "job"],
      [draft.education?.length ?? 0, "school"],
      [draft.skills?.reduce((sum, group) => sum + group.skills.length, 0) ?? 0, "skill"],
      [draft.certifications?.length ?? 0, "certification"],
      [draft.projects?.length ?? 0, "project"],
    ] as const;
    return counts
      .filter(([n]) => n > 0)
      .map(([n, word]) => `${n} ${word}${n > 1 ? "s" : ""}`)
      .join(", ");
  }, [draft, roleCount]);

  const read = () => {
    const body = text.trim();
    if (!body) return;
    const result = parseResumeText(body, "resume");
    setDraft(result.draft);
    setWarnings(result.warnings);
  };

  const commit = () => {
    if (!draft) return;
    startTransition(async () => {
      try {
        const report = await importBrainAction(draft, false);
        const created = report.roles.filter((row) => row.action === "created").length;
        const matched = report.roles.length - created;
        toast.success(
          matched > 0
            ? `Brought in ${created} job${created === 1 ? "" : "s"}; ${matched} ${matched === 1 ? "was" : "were"} already here`
            : `Brought in ${created} job${created === 1 ? "" : "s"}`,
        );
        setOpen(false);
        setText("");
        setDraft(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not import that.");
      }
    });
  };

  const editRole = (index: number, patch: Partial<NonNullable<BrainImport["roles"]>[number]>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            roles: (current.roles ?? []).map((role, position) =>
              position === index ? { ...role, ...patch } : role,
            ),
          }
        : current,
    );
  };

  const dropRole = (index: number) => {
    setDraft((current) =>
      current ? { ...current, roles: (current.roles ?? []).filter((_, i) => i !== index) } : current,
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <DownloadIcon /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bring your history in</DialogTitle>
          <DialogDescription>
            Paste a resume or a LinkedIn export and this reads what it can. Check it before it
            lands — nothing is saved until you press the button. Connected to Claude, you can skip
            this entirely: paste the document there and ask it to import, and it reads the page
            properly rather than guessing at headings.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-2">
            <Label htmlFor="import-text">The document, as text</Label>
            <Textarea
              id="import-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Open the PDF, select all, paste it here."
              className="min-h-64 font-mono text-[12px]"
            />
            <p className="text-faint text-xs">
              PDFs are not read directly on purpose: a two-column layout comes out interleaved and
              a wrong parse you cannot see is worse than a paste.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-inset rounded-control p-3 text-[13px]">
              Read {summary || "nothing it recognised"}. The whole document is saved as a note
              either way, so anything it missed stays searchable.
            </div>

            {warnings.length > 0 && (
              <ul className="space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="text-muted-foreground flex gap-1.5 text-[12px]">
                    <TriangleAlertIcon className="mt-0.5 size-3 shrink-0 text-[var(--warning)]" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3">
              {(draft.roles ?? []).map((role, index) => (
                <div key={index} className="rounded-control border p-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Company</Label>
                      <Input
                        value={role.company}
                        onChange={(event) => editRole(index, { company: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Title</Label>
                      <Input
                        value={role.title}
                        onChange={(event) => editRole(index, { title: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">From</Label>
                      <Input
                        value={role.startDate ?? ""}
                        placeholder="2021-03"
                        onChange={(event) => editRole(index, { startDate: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">To</Label>
                      <Input
                        value={role.isCurrent ? "Present" : (role.endDate ?? "")}
                        placeholder="2023-06"
                        onChange={(event) =>
                          editRole(index, {
                            endDate: event.target.value,
                            isCurrent: /present|current|now/i.test(event.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-faint text-[11.5px]">
                      {role.bullets?.length ?? 0} bullet
                      {(role.bullets?.length ?? 0) === 1 ? "" : "s"}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground hover:text-destructive ml-auto"
                      onClick={() => dropRole(index)}
                    >
                      Leave this one out
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {draft ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Back to the text
              </Button>
              <Button variant="default" onClick={commit} disabled={pending}>
                {pending && <LoaderCircleIcon className="animate-spin" />}
                Bring it in
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="default" onClick={read} disabled={!text.trim()}>
                Read it
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
