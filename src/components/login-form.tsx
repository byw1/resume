"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HiredMark } from "@/components/hired-mark";
import { loginAction } from "@/server/actions";

export function LoginForm({ instanceName }: { instanceName: string }) {
  const [state, formAction] = useActionState(loginAction, undefined);

  return (
    <AuthCard title={instanceName} subtitle="Sign in to your career workspace.">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoFocus
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

        <SubmitButton label="Sign in" pendingLabel="Signing in…" />
      </form>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        Accounts here are invite-only. Ask an admin for an invitation.
      </p>
    </AuthCard>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-sm"
    >
      <div className="bg-card shadow-raised rounded-2xl p-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <HiredMark size={40} className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1.5 text-sm text-balance">{subtitle}</p>
        </div>
        {children}
      </div>
    </motion.div>
  );
}

export function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="default" size="lg" className="w-full" disabled={pending}>
      {pending && <LoaderCircleIcon className="animate-spin" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
