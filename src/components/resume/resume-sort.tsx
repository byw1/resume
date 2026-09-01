"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDownIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Sort order for the resume grid, written to the URL so a sorted view is a
 * shareable, refreshable address — same contract as the pipeline toolbar.
 * "recent" is the default and therefore absent from the URL.
 */
const OPTIONS = [
  { value: "recent", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "used", label: "Most sent" },
] as const;

export function ResumeSortSelect({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("sort");
  const current = OPTIONS.some((option) => option.value === raw) ? (raw as string) : "recent";

  const change = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "recent") next.delete("sort");
    else next.set("sort", value);
    router.replace(next.toString() ? `?${next}` : "?", { scroll: false });
  };

  return (
    <Select value={current} onValueChange={change}>
      <SelectTrigger
        aria-label="Sort resumes"
        className={cn("h-8 w-auto gap-1.5 text-[13px]", className)}
      >
        <ArrowUpDownIcon className="text-muted-foreground size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
