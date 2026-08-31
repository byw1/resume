"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HiredMark } from "@/components/hired-mark";
import { loginAction } from "@/server/actions";

/** The signed-in flag this instance leaves on a shared domain, if it leaves one. */
export type SignedInHint = { cookie: string; domain: string };

export function LoginForm({
  instanceName,
  googleReady,
  openSignup,
  allowedDomains,
  notice,
  signedInHint,
}: {
  instanceName: string;
  googleReady: boolean;
  /** Whether a stranger with a Google account can actually get in from here. */
  openSignup: boolean;
  allowedDomains: string;
  /** A refusal carried back from the Google callback, in Google's own words. */
  notice?: string;
  signedInHint: SignedInHint | null;
}) {
  const [state, formAction] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Reaching this page means there is no session here — it redirects into the
   * app when there is one. So a hint still sitting on the shared domain is
   * stale, left by a session that expired or was ended from somewhere else, and
   * the landing page would go on bouncing this browser here for another month.
   * Clearing it is one line and this is the only page that can: the cookie is
   * deliberately script-readable, and this is the page that knows it is wrong.
   */
  useEffect(() => {
    if (!signedInHint) return;
    document.cookie = `${signedInHint.cookie}=; Max-Age=0; Path=/; Domain=${signedInHint.domain}`;
  }, [signedInHint]);

  return (
    <AuthCard title={instanceName} subtitle="Sign in to your career workspace.">
      {notice && (
        <p className="border-warning/40 bg-warning-tint text-warning mb-5 rounded-lg border px-3 py-2 text-[13px]">
          {notice}
        </p>
      )}

      {googleReady && (
        <>
          <GoogleButton />
          <div className="my-5 flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-faint text-[11px] tracking-wide uppercase">or</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="text-faint hover:text-foreground absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-control transition-colors focus-visible:ring-ring/25 focus-visible:ring-2 outline-none"
            >
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>

        <label
          htmlFor="remember"
          className="text-muted-foreground flex w-fit cursor-pointer items-center gap-2 text-[13px] leading-none font-medium select-none"
        >
          {/* A real checkbox rather than the Radix one. This form posts to a
              server action and still works with scripting off, and Radix only
              grows the hidden input carrying its value once it has hydrated —
              which would quietly shorten the session of anyone without it. */}
          <input
            id="remember"
            name="remember"
            type="checkbox"
            defaultChecked
            className="accent-primary size-4 cursor-pointer"
          />
          Keep me signed in for a month
        </label>

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

      {/* The truth here changes with the sign-up setting, and getting it wrong
          in either direction wastes somebody's time: telling an invited person
          they cannot get in, or inviting a stranger to press a button that
          will refuse them. */}
      <p className="text-muted-foreground mt-6 text-center text-xs">
        {!openSignup
          ? "Accounts here are invite-only. Ask an admin for an invitation, or to reset a password you’ve lost."
          : allowedDomains
            ? `Continue with Google to create an account, if your address is on ${allowedDomains}.`
            : "Continue with Google to create an account, or ask an admin for an invitation."}
      </p>
    </AuthCard>
  );
}

/**
 * A link, not a button with an onClick — the whole flow is a browser redirect,
 * so there is no client-side work to do and this keeps working with JavaScript
 * still loading. The mark is inline SVG because the artifact CSP and the
 * offline-first posture both rule out fetching it from Google.
 */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  return (
    <Button asChild variant="outline" size="lg" className="w-full">
      <a href="/api/auth/google">
        <GoogleMark />
        {label}
      </a>
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
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
