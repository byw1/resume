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
  MenuIcon,
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommandPalette, type PaletteIndex } from "@/components/command-palette";
import { HiredMark } from "@/components/hired-mark";
import { logoutAction } from "@/server/actions";

// Navigation only. Settings and Admin are account actions, so they live in the
// profile menu at the top right rather than in the rail.
const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/brain", label: "Brain", icon: BrainIcon },
  { href: "/resumes", label: "Resumes", icon: FileTextIcon },
  { href: "/crm", label: "CRM", icon: Building2Icon },
  { href: "/applications", label: "Pipeline", icon: KanbanIcon },
];

// The rail remembers whether you collapsed it. Read after mount so the server
// and the first client render agree.
const COLLAPSE_KEY = "hired:sidebar-collapsed";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Navigating is the reason the drawer was opened, so arriving closes it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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
                  <HiredMark size={26} className="transition-opacity group-hover:opacity-0" />
                  <PanelLeftOpenIcon className="text-muted-foreground absolute size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <HiredMark size={26} className="shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px] font-semibold tracking-tight">Hired</div>
                {/* 10.5px, not 11px: the line is five pixels too wide for this
                    rail at 11 and ellipsises to "on the rec…", and a clipped
                    tagline is worse than a slightly smaller one. */}
                <div className="text-muted-foreground truncate text-[10.5px] tracking-[-0.004em]">
                  Your career, on the record
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
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon />
            </Button>
            {/* Five unlabelled icons told you nothing about where you were.
                The drawer holds the navigation; the bar just names the page. */}
            <span className="truncate text-[15px] font-semibold tracking-tight">
              {NAV.find((item) => isActive(item.href))?.label ?? "Hired"}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 md:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <SearchIcon />
            </Button>
            <ProfileMenu user={user} canAdmin={canAdmin} />
          </div>
        </header>

        <MobileNav
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          isActive={isActive}
          followUpCount={followUpCount}
          canAdmin={canAdmin}
          onSearch={() => {
            setDrawerOpen(false);
            setPaletteOpen(true);
          }}
        />

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} index={index} />
    </div>
  );
}

/**
 * The phone's navigation. Everything the desktop rail holds, plus the account
 * links that live in the profile menu — because on a phone the profile menu is
 * a 28px avatar and "where is Settings" should not depend on finding it.
 */
function MobileNav({
  open,
  onOpenChange,
  isActive,
  followUpCount,
  canAdmin,
  onSearch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isActive: (href: string) => boolean;
  followUpCount: number;
  canAdmin: boolean;
  onSearch: () => void;
}) {
  const secondary = [
    { href: "/docs", label: "Docs", icon: BookOpenIcon },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
    ...(canAdmin ? [{ href: "/settings/admin", label: "Admin", icon: ShieldIcon }] : []),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" showClose={false} className="gap-0 p-0 md:hidden">
        <SheetTitle className="sr-only">Menu</SheetTitle>

        <div className="flex h-16 items-center gap-2.5 px-5">
          <HiredMark size={26} className="shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-semibold tracking-tight">Hired</div>
            <div className="text-muted-foreground truncate text-[10.5px] tracking-[-0.004em]">
              Your career, on the record
            </div>
          </div>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={onSearch}
            className="text-muted-foreground hover:text-foreground hover:bg-accent bg-card flex h-11 w-full items-center gap-2 rounded-md border px-3 text-[14px] transition-colors"
          >
            <SearchIcon className="size-4" />
            <span>Search…</span>
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors",
                  active ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                <span>{item.label}</span>
                {item.href === "/applications" && followUpCount > 0 && (
                  <span className="bg-muted text-muted-foreground ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                    {followUpCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-0.5 border-t px-3 py-3">
          {secondary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground flex h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors"
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-muted-foreground flex h-11 w-full items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors"
            >
              <LogOutIcon className="size-4 shrink-0" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
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
          className="hover:bg-accent touch-target flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-2.5 transition-colors"
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
            <Link href="/settings/admin">
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
