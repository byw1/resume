"use client";

import { useActionState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard, GoogleButton, SubmitButton } from "@/components/login-form";
import { acceptInviteAction } from "@/server/actions";

export function AcceptInviteForm({
  token,
  email,
  inviter,
  instanceName,
  googleReady,
}: {
  token: string;
  email: string;
  inviter: string;
  instanceName: string;
  googleReady: boolean;
}) {
  const [state, formAction] = useActionState(acceptInviteAction, undefined);

  return (
    <AuthCard
      title={`Join ${instanceName}`}
      subtitle={
        googleReady
          ? `${inviter} invited you. Continue with Google, or pick a password.`
          : `${inviter} invited you. Pick a password and you're in.`
      }
    >
      {/* No token travels with this. The callback finds the outstanding
          invitation by the verified email Google hands back, so the button is
          the same one as on the sign-in page and cannot accept an invitation
          addressed to somebody else. */}
      {googleReady && (
        <>
          <GoogleButton label="Continue with Google" />
          <div className="my-5 flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-faint text-[11px] tracking-wide uppercase">or</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />

        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} readOnly disabled className="opacity-70" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoFocus placeholder="Ada Lovelace" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Choose a password</Label>
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

        <SubmitButton label="Create my account" pendingLabel="Creating…" />
      </form>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        You get your own private space. Nobody else can see your brain, resumes or applications.
      </p>
    </AuthCard>
  );
}
