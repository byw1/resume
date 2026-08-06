"use client";

import { useActionState } from "react";
import { motion } from "framer-motion";
import { KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard, SubmitButton } from "@/components/login-form";
import { setupAction } from "@/server/actions";

export function SetupForm({ requiresKey }: { requiresKey: boolean }) {
  const [state, formAction] = useActionState(setupAction, undefined);

  return (
    <AuthCard
      title="Claim this instance"
      subtitle="Your owner account is normally created automatically on first boot — check your server logs for the password. Use this page only if that didn't happen."
    >
      <form action={formAction} className="space-y-4">
        {requiresKey ? (
          <div className="space-y-2">
            <Label htmlFor="setupKey">
              <KeyRoundIcon className="size-3.5" /> Setup key
            </Label>
            <Input
              id="setupKey"
              name="setupKey"
              type="password"
              autoFocus
              placeholder="Your APP_PASSWORD"
            />
            <p className="text-muted-foreground text-xs">
              The <code className="bg-muted rounded px-1 py-0.5">APP_PASSWORD</code> variable from
              your host. This stops anyone else claiming the instance first.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/35 bg-[var(--warning)]/8 px-3 py-2.5 text-xs">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" />
            <span className="text-muted-foreground">
              No <code className="bg-muted rounded px-1">APP_PASSWORD</code> is set, so this page is
              open to anyone who finds it. Finish setup now, or set that variable first.
            </span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoFocus={!requiresKey} placeholder="Ada Lovelace" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
          />
        </div>

        {state?.error && (
          <motion.p
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-destructive text-sm"
          >
            {state.error}
          </motion.p>
        )}

        <SubmitButton label="Create owner account" pendingLabel="Setting up…" />
      </form>
    </AuthCard>
  );
}
