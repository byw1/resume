"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BookOpenIcon,
  BrainIcon,
  Building2Icon,
  ChevronDownIcon,
  FileTextIcon,
  KanbanIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandPalette, type PaletteIndex } from "@/components/command-palette";
import { logoutAction } from "@/server/actions";

// Navigation only. Settings and Admin are account actions, so they live in the
// profile menu at the top right rather than in the rail.
const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/brain", label: "Brain", icon: BrainIcon },
  { href: "/resumes", label: "Resumes", icon: FileTextIcon },
  { href: "/applications", label: "Pipeline", icon: KanbanIcon },
  { href: "/crm", label: "CRM", icon: Building2Icon },
];

// The rail remembers whether you collapsed it. Read after mount so the server
// and the first client render agree.
const COLLAPSE_KEY = "resume-os:sidebar-collapsed";

export type ShellUser = { name: string; email: string; role: string };

export function Shell({
  children,
  index,
  followUpCount,
  user,
}: {
  children: React.ReactNode;
  index: PaletteIndex;
  followUpCount: number;
  user: ShellUser;
}) {
  const canAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-svh">
      {/* Rail */}
      <aside
        className={cn(
          "bg-sidebar sticky top-0 z-30 hidden h-svh shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
          collapsed ? "w-[4.5rem]" : "w-[15rem]",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center gap-2.5",
            collapsed ? "justify-center px-2" : "px-5",
          )}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleCollapsed}
                  aria-label="Expand sidebar"
                  className="hover:bg-accent group relative flex size-9 items-center justify-center rounded-lg transition-colors"
                >
                  <span className="bg-foreground flex size-[26px] items-center justify-center rounded-[7px] transition-opacity group-hover:opacity-0">
                    <span className="text-background text-[13px] font-semibold">R</span>
                  </span>
                  <PanelLeftOpenIcon className="text-muted-foreground absolute size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <div className="bg-foreground flex size-[26px] shrink-0 items-center justify-center rounded-[7px]">
                <span className="text-background text-[13px] font-semibold">R</span>
              </div>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px] font-semibold tracking-tight">Resume OS</div>
                <div className="text-muted-foreground truncate text-[11px]">
                  Career operating system
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground -mr-1.5 ml-auto"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
              >
                <PanelLeftCloseIcon />
              </Button>
            </>
          )}
        </div>

        <div className={cn("pb-2", collapsed ? "px-2" : "px-3")}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent bg-card flex w-full items-center justify-center rounded-md border py-2 transition-colors"
                  aria-label="Search"
                >
                  <SearchIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search · ⌘K</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => setPaletteOpen(true)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent bg-card flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] transition-colors"
            >
              <SearchIcon className="size-3.5" />
              <span>Search…</span>
              <kbd className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </button>
          )}
        </div>

        <nav className={cn("flex flex-1 flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>
          {NAV.map((item) => {
            const active = isActive(item.href);
            const link = (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "group relative flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-2" : "gap-3 px-3",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="bg-accent absolute inset-0 rounded-lg"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon
                  className={cn(
                    "relative size-4 shrink-0 transition-colors",
                    active ? "text-primary" : "group-hover:text-foreground",
                  )}
                />
                {!collapsed && <span className="relative">{item.label}</span>}
                {item.href === "/applications" &&
                  followUpCount > 0 &&
                  (collapsed ? (
                    <span className="bg-primary absolute right-2.5 top-1.5 size-1.5 rounded-full" />
                  ) : (
                    <span className="bg-muted text-muted-foreground relative ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                      {followUpCount}
                    </span>
                  ))}
              </Link>
            );

            if (!collapsed) return link;
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                  {item.href === "/applications" && followUpCount > 0 && ` · ${followUpCount} due`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-2 border-b px-4 md:px-7">
          <nav className="flex items-center gap-1 md:hidden">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive(item.href) ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={item.label}
                >
                  <item.icon />
                </Button>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <SearchIcon />
            </Button>
            <ProfileMenu user={user} canAdmin={canAdmin} />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} index={index} />
    </div>
  );
}

function initials(user: ShellUser) {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

function ProfileMenu({ user, canAdmin }: { user: ShellUser; canAdmin: boolean }) {
  const roleLabel = user.role === "SUPER_ADMIN" ? "Owner" : canAdmin ? "Admin" : "Member";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="hover:bg-accent flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-2.5 transition-colors"
          aria-label="Account menu"
        >
          <span className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
            {initials(user)}
          </span>
          <span className="hidden max-w-[10rem] truncate text-[13px] font-medium sm:block">
            {user.name || user.email}
          </span>
          <ChevronDownIcon className="text-muted-foreground size-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
            {initials(user)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{user.name || user.email}</div>
            <div className="text-muted-foreground truncate text-[11px]">{user.email}</div>
          </div>
        </div>
        <div className="text-muted-foreground px-2 pb-1.5 text-[11px]">{roleLabel}</div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/docs">
            <BookOpenIcon /> Docs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon /> Settings
          </Link>
        </DropdownMenuItem>
        {canAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldIcon /> Admin
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
