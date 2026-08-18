"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  BrainIcon,
  FileTextIcon,
  KanbanIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CommandPalette, type PaletteIndex } from "@/components/command-palette";
import { logoutAction } from "@/server/actions";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/brain", label: "Brain", icon: BrainIcon },
  { href: "/resumes", label: "Resumes", icon: FileTextIcon },
  { href: "/applications", label: "Pipeline", icon: KanbanIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

const ADMIN_NAV = { href: "/admin", label: "Admin", icon: ShieldIcon };

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
  const nav = canAdmin ? [...NAV, ADMIN_NAV] : NAV;
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

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
      <aside className="bg-sidebar sticky top-0 z-30 hidden h-svh w-[15rem] shrink-0 flex-col border-r md:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="bg-foreground flex size-[26px] items-center justify-center rounded-[7px]">
            <span className="text-background text-[13px] font-semibold">R</span>
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Resume OS</div>
            <div className="text-muted-foreground text-[11px]">Career operating system</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
                    "relative size-4 transition-colors",
                    active ? "text-primary" : "group-hover:text-foreground",
                  )}
                />
                <span className="relative">{item.label}</span>
                {item.href === "/applications" && followUpCount > 0 && (
                  <span className="bg-muted text-muted-foreground relative ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                    {followUpCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pb-1">
          <div className="truncate text-[13px] font-medium">{user.name || user.email}</div>
          <div className="text-muted-foreground truncate text-[11px]">
            {user.email}
            {canAdmin && (
              <span className="text-muted-foreground ml-1.5 font-medium">
                {user.role === "SUPER_ADMIN" ? "· owner" : "· admin"}
              </span>
            )}
          </div>
        </div>

        <div className="p-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent flex w-full items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-[13px] transition-colors"
          >
            <SearchIcon className="size-3.5" />
            <span>Search…</span>
            <kbd className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-2 border-b px-4 md:px-7">
          <nav className="flex items-center gap-1 md:hidden">
            {nav.map((item) => (
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
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <form action={logoutAction}>
                  <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out">
                    <LogOutIcon />
                  </Button>
                </form>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} index={index} />
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
