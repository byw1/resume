"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, KeyRoundIcon, ShieldIcon, Trash2Icon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  adminResetPasswordAction,
  deleteUserAction,
  setUserActiveAction,
  setUserRoleAction,
} from "@/server/actions";

/**
 * The four things an admin can do to somebody else's account, laid out rather
 * than hidden behind a menu — on a page about one person there is room, and a
 * suspension is worth seeing before you click it.
 *
 * `manageable` is decided by the data layer, not here. When it is false the
 * controls are gone rather than disabled-and-explained, because the reasons
 * (it's you, it's the owner, it's another admin) are all permanent.
 */
export function PersonActions({
  userId,
  email,
  role,
  isActive,
  manageable,
  canChangeRole,
}: {
  userId: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  manageable: boolean;
  canChangeRole: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reset, setReset] = useState<{ password: string } | null>(null);

  if (!manageable) {
    return (
      <p className="text-muted-foreground text-[13px]">
        {role === "SUPER_ADMIN"
          ? "This is the instance owner. Nobody can suspend, demote or delete this account — that is what keeps an instance from being taken from the person who set it up."
          : "You can't act on this account. Admins manage members; only the owner manages admins."}
      </p>
    );
  }

  const run = (message: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(result.error ?? "That didn't work.");
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canChangeRole && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              role === "MEMBER"
                ? run("Promoted to admin", () => setUserRoleAction(userId, "ADMIN"))
                : run("Changed to member", () => setUserRoleAction(userId, "MEMBER"))
            }
          >
            {role === "MEMBER" ? <ShieldIcon /> : <UserIcon />}
            {role === "MEMBER" ? "Make admin" : "Make member"}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(isActive ? "Suspended" : "Reactivated", () =>
              setUserActiveAction(userId, !isActive),
            )
          }
        >
          {isActive ? "Suspend access" : "Reactivate"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                `Reset ${email}'s password? They will be signed out everywhere, and you will get a new password to pass on.`,
              )
            )
              return;
            startTransition(async () => {
              const result = await adminResetPasswordAction(userId);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              setReset({ password: result.password });
              router.refresh();
            });
          }}
        >
          <KeyRoundIcon /> Reset password
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive ml-auto"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                `Delete ${email}? This permanently removes their brain, resumes and applications.`,
              )
            )
              return;
            startTransition(async () => {
              const result = await deleteUserAction(userId);
              if (result.ok) {
                toast.success("Account deleted");
                router.push("/settings/admin");
              } else {
                toast.error(result.error ?? "Could not delete.");
              }
            });
          }}
        >
          <Trash2Icon /> Delete account
        </Button>
      </div>

      {reset && (
        <Card>
          <CardContent className="space-y-2 py-3.5">
            <p className="text-[13px] font-medium">
              New password for {email}. This is the only time it is shown.
            </p>
            <div className="bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{reset.password}</code>
              <CopyPassword password={reset.password} />
            </div>
            <p className="text-faint text-[12px]">
              Send it through something other than email if you can — an invite that bounced is
              often why you are on this page.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CopyPassword({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(password);
        setCopied(true);
        toast.success("Password copied");
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
