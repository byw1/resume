"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { LoaderCircleIcon, LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/actions";

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, formAction] = useActionState(loginAction, undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-sm"
    >
      <div className="surface ring-highlight rounded-2xl border p-8 elev-3">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-4 flex size-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklch,var(--primary)_55%,oklch(0.7_0.19_215)))] shadow-lg shadow-primary/25">
            <span className="text-primary-foreground text-xl font-bold">R</span>
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/25" />
          </div>
          <h1 className="text-gradient text-2xl font-semibold tracking-tight">Resume OS</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Your career brain, resumes and pipeline.
          </p>
        </div>

        {configured ? (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">
                <LockIcon className="size-3.5" /> Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoFocus
                autoComplete="current-password"
                placeholder="••••••••••"
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

            <SubmitButton />
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              No password is set, so this app is currently open to anyone with the link.
            </p>
            <p className="text-muted-foreground">
              Add an <code className="bg-muted rounded px-1 py-0.5 text-xs">APP_PASSWORD</code>{" "}
              variable in Railway to lock it down.
            </p>
            <Button asChild variant="gradient" className="w-full">
              <a href="/">Continue</a>
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
      {pending ? "Checking…" : "Enter"}
    </Button>
  );
}
