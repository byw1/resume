"use client";

import { useRouter } from "next/navigation";
import {
  BrainIcon,
  BuildingIcon,
  FileTextIcon,
  KanbanIcon,
  LayoutDashboardIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export type PaletteIndex = {
  roles: { id: string; label: string; sub: string }[];
  resumes: { id: string; label: string; sub: string }[];
  applications: { id: string; label: string; sub: string }[];
};

export function CommandPalette({
  open,
  onOpenChange,
  index,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: PaletteIndex;
}) {
  const router = useRouter();

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a role, resume, company…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/")}>
            <LayoutDashboardIcon /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/brain")}>
            <BrainIcon /> Brain
          </CommandItem>
          <CommandItem onSelect={() => go("/resumes")}>
            <FileTextIcon /> Resumes
          </CommandItem>
          <CommandItem onSelect={() => go("/applications")}>
            <KanbanIcon /> Pipeline
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <SettingsIcon /> Settings
            <CommandShortcut>MCP</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Create">
          <CommandItem onSelect={() => go("/brain?new=role")}>
            <PlusIcon /> New role
          </CommandItem>
          <CommandItem onSelect={() => go("/resumes?new=1")}>
            <PlusIcon /> New resume
          </CommandItem>
          <CommandItem onSelect={() => go("/applications?new=1")}>
            <PlusIcon /> Track a new job
          </CommandItem>
        </CommandGroup>

        {index.roles.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Roles">
              {index.roles.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`role ${item.label} ${item.sub}`}
                  onSelect={() => go(`/brain/${item.id}`)}
                >
                  <BrainIcon />
                  <span>{item.label}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{item.sub}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {index.resumes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Resumes">
              {index.resumes.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`resume ${item.label} ${item.sub}`}
                  onSelect={() => go(`/resumes/${item.id}`)}
                >
                  <FileTextIcon />
                  <span>{item.label}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{item.sub}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {index.applications.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Applications">
              {index.applications.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`application ${item.label} ${item.sub}`}
                  onSelect={() => go(`/applications/${item.id}`)}
                >
                  <BuildingIcon />
                  <span>{item.label}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{item.sub}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
