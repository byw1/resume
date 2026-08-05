"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckIcon, LoaderCircleIcon, LogOutIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  changeOwnPasswordAction,
  logoutAction,
  updateOwnAccountAction,
} from "@/server/actions";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function AccountPanel({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  const [values, setValues] = useState({ name: user.name, email: user.email });
  const [pending, startTransition] = useTransition();
  const [passwordState, passwordAction] = useActionState(changeOwnPasswordAction, undefined);

  const saveProfile = () => {
    startTransition(async () => {
      try {
        await updateOwnAccountAction(values);
        toast.success("Account updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/12 text-primary flex size-9 items-center justify-center rounded-xl">
            <UserIcon className="size-[18px]" />
          </div>
          <div>
            <CardTitle className="text-[15px]">Your account</CardTitle>
            <p className="text-muted-foreground text-sm">{user.email}</p>
          </div>
          <Badge variant={user.role === "MEMBER" ? "secondary" : "default"} className="ml-auto">
            {ROLE_LABEL[user.role] ?? user.role}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={values.name}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              value={values.email}
              onChange={(event) => setValues({ ...values, email: event.target.value })}
            />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={saveProfile} disabled={pending}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Save
        </Button>

        <Separator />

        <form action={passwordAction} className="space-y-3">
          <h3 className="text-[13px] font-semibold">Change password</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="At least 10 characters"
              />
            </div>
          </div>
          {passwordState?.error && (
            <p className="text-destructive text-sm">{passwordState.error}</p>
          )}
          {passwordState?.ok && (
            <p className="flex items-center gap-1.5 text-sm text-[var(--success)]">
              <CheckIcon className="size-3.5" /> Password changed. Other devices were signed out.
            </p>
          )}
          <Button type="submit" variant="outline" size="sm">
            Update password
          </Button>
        </form>

        <Separator />

        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            <LogOutIcon /> Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
