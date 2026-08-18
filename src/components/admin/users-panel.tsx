"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreVerticalIcon, ShieldIcon, Trash2Icon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, initials } from "@/lib/utils";
import {
  deleteUserAction,
  setUserActiveAction,
  setUserRoleAction,
} from "@/server/actions";

type Row = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  invitedBy: string | null;
  counts: { roles: number; resumes: number; applications: number };
};

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function UsersPanel({
  actor,
  users,
}: {
  actor: { id: string; role: UserRole };
  users: Row[];
}) {
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // Mirrors canManage() on the server; the server still enforces it.
  const canManage = (target: Row) =>
    target.id !== actor.id &&
    target.role !== "SUPER_ADMIN" &&
    (actor.role === "SUPER_ADMIN" || target.role === "MEMBER");

  const run = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(label);
      else toast.error(result.error ?? "That didn't work.");
    });

  const visible = users.filter((user) => !removed.has(user.id));

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {visible.map((user) => (
          <motion.div key={user.id} layout exit={{ opacity: 0, height: 0 }}>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 py-3.5">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                    user.isActive
                      ? "bg-primary-tint text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {initials(user.name || user.email)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {user.name || user.email.split("@")[0]}
                    </span>
                    {user.id === actor.id && (
                      <Badge variant="secondary" className="text-[10px]">
                        you
                      </Badge>
                    )}
                    {!user.isActive && (
                      <Badge variant="warning" className="text-[10px]">
                        suspended
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {user.email}
                    {user.invitedBy && <span> · invited by {user.invitedBy}</span>}
                  </div>
                </div>

                <div className="text-muted-foreground hidden text-xs tabular-nums md:block">
                  {user.counts.roles} roles · {user.counts.resumes} resumes ·{" "}
                  {user.counts.applications} apps
                </div>

                <div className="text-muted-foreground hidden w-28 text-right text-xs lg:block">
                  {user.lastLoginAt
                    ? `seen ${new Date(user.lastLoginAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}`
                    : "never signed in"}
                </div>

                <Badge
                  variant={user.role === "MEMBER" ? "outline" : "default"}
                  className="shrink-0"
                >
                  {user.role !== "MEMBER" && <ShieldIcon className="size-2.5" />}
                  {ROLE_LABEL[user.role]}
                </Badge>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canManage(user) || pending}
                      aria-label={`Manage ${user.email}`}
                    >
                      <MoreVerticalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {user.role === "MEMBER" && actor.role === "SUPER_ADMIN" && (
                      <DropdownMenuItem
                        onSelect={() =>
                          run("Promoted to admin", () => setUserRoleAction(user.id, "ADMIN"))
                        }
                      >
                        <ShieldIcon /> Make admin
                      </DropdownMenuItem>
                    )}
                    {user.role === "ADMIN" && actor.role === "SUPER_ADMIN" && (
                      <DropdownMenuItem
                        onSelect={() =>
                          run("Changed to member", () => setUserRoleAction(user.id, "MEMBER"))
                        }
                      >
                        <UserIcon /> Make member
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={() =>
                        run(user.isActive ? "Suspended" : "Reactivated", () =>
                          setUserActiveAction(user.id, !user.isActive),
                        )
                      }
                    >
                      {user.isActive ? "Suspend access" : "Reactivate"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        if (
                          confirm(
                            `Delete ${user.email}? This permanently removes their brain, resumes and applications.`,
                          )
                        ) {
                          setRemoved((prev) => new Set(prev).add(user.id));
                          void deleteUserAction(user.id).then((result) => {
                            if (result.ok) toast.success("Account deleted");
                            else toast.error(result.error ?? "Could not delete.");
                          });
                        }
                      }}
                    >
                      <Trash2Icon /> Delete account
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
