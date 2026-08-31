"use client";

import { useState, useTransition } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { CompanyChip } from "@/components/crm/company-chip";
import { companyDomain } from "@/lib/company";
import { setContactCompaniesAction } from "@/server/actions";

export type CompanyRef = { id: string; name: string; website: string };

/**
 * Everywhere a person represents, as chips you can add to and take away.
 *
 * A contact used to point at one company, which meant choosing which of a
 * founder's three hats to keep. The set is written whole on every change —
 * same rule as an application's sources — and the server hands back what it
 * stored, so the chips settle on the truth rather than on what was clicked.
 */
export function ContactCompanies({
  contactId,
  companies,
  options,
  logos,
  size = "sm",
  onChanged,
}: {
  contactId: string;
  companies: CompanyRef[];
  /** Every company on file, for the picker. */
  options: CompanyRef[];
  logos: boolean;
  size?: "sm" | "md";
  onChanged?: (companies: CompanyRef[]) => void;
}) {
  const [value, setValue] = useState(companies);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const write = (ids: string[], create?: string) => {
    startTransition(async () => {
      try {
        const next = await setContactCompaniesAction(contactId, ids, create);
        setValue(next);
        onChanged?.(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not change that.");
      }
    });
  };

  const add = (company: CompanyRef) => {
    setOpen(false);
    setQuery("");
    if (value.some((item) => item.id === company.id)) return;
    write([...value.map((item) => item.id), company.id]);
  };

  const create = (name: string) => {
    setOpen(false);
    setQuery("");
    write(
      value.map((item) => item.id),
      name,
    );
  };

  const drop = (id: string) =>
    write(value.filter((item) => item.id !== id).map((item) => item.id));

  const linked = new Set(value.map((item) => item.id));
  const typed = query.trim();
  const exists = options.some((item) => item.name.toLowerCase() === typed.toLowerCase());

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((company) => (
        // The remove control sits beside the chip's link rather than inside
        // it: a button nested in an anchor is invalid, and the chip's whole
        // job is to be a link to the company.
        <span key={company.id} className="relative inline-flex max-w-full items-center">
          <CompanyChip company={company} logos={logos} size={size} className="pr-6" />
          <button
            type="button"
            onClick={() => drop(company.id)}
            disabled={pending}
            aria-label={`Unlink ${company.name}`}
            title={`Unlink ${company.name}`}
            className="text-faint hover:text-destructive absolute right-1 flex size-4 items-center justify-center rounded-full transition-colors"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            disabled={pending}
            className="text-muted-foreground gap-1 px-1.5"
          >
            <PlusIcon className="size-3" />
            {value.length === 0 ? "Company" : "Add"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command loop>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Which company?"
              className="h-9"
            />
            <CommandList>
              {/* Only when there is nothing to create either: a force-mounted
                  item never registers in cmdk's store, so it does not count
                  towards the filtered total and this would otherwise show
                  above the very "Create X" row that contradicts it. */}
              {!typed && <CommandEmpty>No company matches.</CommandEmpty>}
              {/* The ones already linked stay in the list, marked. Filtering
                  them out leaves typing their name showing nothing at all —
                  no match, and no "Create" row either, since the name exists. */}
              {options.map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.name} ${company.id}`}
                  onSelect={() => add(company)}
                  className="flex items-center gap-2 px-2 py-1.5 text-[13px]"
                >
                  <CompanyAvatar
                    name={company.name}
                    domain={
                      logos ? companyDomain({ name: company.name, website: company.website }) : null
                    }
                    size={18}
                  />
                  <span className="min-w-0 flex-1 truncate">{company.name}</span>
                  {linked.has(company.id) && <span className="text-faint text-[11px]">linked</span>}
                </CommandItem>
              ))}
              {typed && !exists && (
                <CommandItem
                  forceMount
                  value="±new±"
                  onSelect={() => create(typed)}
                  className="flex items-center gap-2 px-2 py-1.5 text-[13px]"
                >
                  <PlusIcon className="size-3.5" />
                  Create “{typed}”
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
