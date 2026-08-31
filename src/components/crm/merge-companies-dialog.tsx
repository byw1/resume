"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CombineIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
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
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { companyDomain } from "@/lib/company";
import { mergeCompaniesAction, previewCompanyMergeAction } from "@/server/actions";

export type MergeCandidate = {
  id: string;
  name: string;
  website: string;
  applications: number;
  contacts: number;
};

type Plan = Awaited<ReturnType<typeof previewCompanyMergeAction>>;

/**
 * Folding a duplicate employer into this one.
 *
 * A one-way door, so it is built as one: you pick the duplicate, the server
 * says exactly what will move, and only then does the confirm button light up.
 * The plan comes from the data layer rather than being re-derived here —
 * whether the notes get appended is a rule about the data, and there is
 * supposed to be one implementation of it.
 *
 * CompanyAvatar rather than CompanyChip on the rows: the chip is a link, and a
 * link inside a dialog row you are trying to select is a trap.
 */
export function MergeCompaniesDialog({
  company,
  candidates,
  logos,
  suggestedId,
}: {
  company: { id: string; name: string };
  candidates: MergeCandidate[];
  logos: boolean;
  /** Pre-selected when the list flagged these two as probable duplicates. */
  suggestedId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<MergeCandidate | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, startLoading] = useTransition();
  const [merging, startMerging] = useTransition();

  const choose = (candidate: MergeCandidate) => {
    setPicked(candidate);
    setPlan(null);
    startLoading(async () => {
      try {
        setPlan(await previewCompanyMergeAction(company.id, candidate.id));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not work that out.");
        setPicked(null);
      }
    });
  };

  const confirm = () => {
    if (!picked || !plan) return;
    startMerging(async () => {
      try {
        await mergeCompaniesAction(company.id, picked.id);
        toast.success(`${picked.name} folded into ${company.name}`);
        setOpen(false);
        setPicked(null);
        setPlan(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not merge those.");
      }
    });
  };

  const others = candidates.filter((candidate) => candidate.id !== company.id);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPicked(null);
          setPlan(null);
        } else if (suggestedId) {
          const suggestion = others.find((candidate) => candidate.id === suggestedId);
          if (suggestion) choose(suggestion);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CombineIcon /> Merge
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge another company into {company.name}</DialogTitle>
          <DialogDescription>
            Everything on the company you pick moves here, and that company is deleted.{" "}
            {company.name} keeps its name.
          </DialogDescription>
        </DialogHeader>

        {others.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            There is nothing else on file to merge in.
          </p>
        ) : (
          <Command loop className="bg-inset rounded-lg">
            <CommandInput placeholder="Which company is the duplicate?" className="h-9" />
            <CommandList className="max-h-56">
              <CommandEmpty>No company matches.</CommandEmpty>
              {others.map((candidate) => (
                <CommandItem
                  key={candidate.id}
                  value={`${candidate.name} ${candidate.id}`}
                  onSelect={() => choose(candidate)}
                  className={cnRow(picked?.id === candidate.id)}
                >
                  <CompanyAvatar
                    name={candidate.name}
                    domain={
                      logos ? companyDomain({ name: candidate.name, website: candidate.website }) : null
                    }
                    size={20}
                  />
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                  <span className="text-faint shrink-0 text-[11.5px]">
                    {candidate.applications || 0} app{candidate.applications === 1 ? "" : "s"} ·{" "}
                    {candidate.contacts || 0} {candidate.contacts === 1 ? "person" : "people"}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}

        {loading && (
          <p className="text-muted-foreground flex items-center gap-2 text-[13px]">
            <LoaderCircleIcon className="size-3.5 animate-spin" /> Working out what would move…
          </p>
        )}

        {plan && picked && (
          <div className="space-y-2 rounded-control border p-3 text-[13px]">
            <p className="font-medium">
              {plan.applications === 0 && plan.contacts === 0
                ? `Nothing to move from ${plan.merge.name}.`
                : `Moving from ${plan.merge.name} to ${plan.keep.name}:`}
            </p>
            <ul className="text-muted-foreground space-y-0.5">
              {plan.applications > 0 && (
                <li>
                  {plan.applications} application{plan.applications === 1 ? "" : "s"}
                  {plan.movingRoles.length > 0 && (
                    <span className="text-faint"> — {plan.movingRoles.join(", ")}</span>
                  )}
                </li>
              )}
              {plan.contacts > 0 && (
                <li>
                  {plan.contacts} {plan.contacts === 1 ? "person" : "people"}
                </li>
              )}
              {plan.fills.length > 0 && (
                <li>
                  Filling {plan.keep.name}&apos;s empty{" "}
                  {plan.fills.map((fill) => fill.field).join(", ")}
                </li>
              )}
              {plan.notesAppended && <li>Their notes appended to yours, nothing overwritten</li>}
            </ul>
            <p className="text-destructive flex items-start gap-1.5 text-[12px]">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
              {plan.merge.name} is deleted and its page stops working. This cannot be undone, and
              nothing is de-duplicated — identical roles stay as two.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={confirm} disabled={!plan || merging}>
            {merging && <LoaderCircleIcon className="animate-spin" />}
            {plan ? `Merge ${plan.merge.name} in` : "Pick a company first"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cnRow(active: boolean) {
  return `flex items-center gap-2 px-2 py-1.5 text-[13px] ${active ? "bg-accent" : ""}`;
}
