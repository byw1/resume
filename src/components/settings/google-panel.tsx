"use client";

import { useTransition } from "react";
import { CalendarIcon, MailIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { disconnectGoogleAction } from "@/server/actions";
import { agoDay } from "@/lib/utils";

/**
 * Your own Gmail and Google Calendar, read live by the app.
 *
 * Rendered inside the Google tile's slide-over on Settings → Connections,
 * beside the assistants — it is wiring of the other direction: they read the
 * workspace, this is the workspace reading you.
 *
 * Connecting is a link out through Google's consent screen rather than an
 * action, because that is where the permission is given. Disconnecting is an
 * action: it revokes the token at Google and deletes the only thing this
 * instance holds. The copy says both of those things in words, because a
 * person handing over their inbox deserves to know exactly what that means
 * here — read-only, nothing copied, gone the moment they say so.
 */

export type GoogleConnectionView = {
  email: string;
  mail: boolean;
  calendar: boolean;
  connectedAt: string;
  lastUsedAt: string | null;
  lastError: string;
};

export function GoogleDetails({
  connection,
  ready,
  onDisconnected,
}: {
  connection: GoogleConnectionView | null;
  /** Whether an admin has configured a Google OAuth client at all. */
  ready: boolean;
  onDisconnected?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (!ready) {
    return (
      <p className="text-muted-foreground text-[13px]">
        This instance has no Google OAuth client yet. An admin adds one under Admin →
        Configuration → Sign-in; the same client is what lets you connect here.
      </p>
    );
  }

  if (!connection) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Google will ask for read-only access to Gmail and Calendar. You can leave either
          unticked. Nothing from your account is copied to this server: every page asks Google
          when you open it, and disconnecting deletes the only thing kept, the token. The app can
          never send, accept, archive or delete anything.
        </p>
        <ul className="space-y-2">
          <Granted on={null} icon={<MailIcon className="size-3.5" />} label="Gmail">
            Threads with the people and companies on your pipeline, matched by their address
            and domain. Searchable by an assistant.
          </Granted>
          <Granted on={null} icon={<CalendarIcon className="size-3.5" />} label="Calendar">
            Interviews and calls with anyone on your pipeline, on the pipeline&apos;s calendar
            view and next to the application.
          </Granted>
        </ul>
        <Button asChild size="sm">
          <a href="/api/auth/google?data=1">Connect Google</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{connection.email}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Connected {agoDay(connection.connectedAt).toLowerCase()}
            {connection.lastUsedAt
              ? ` · last read ${agoDay(connection.lastUsedAt).toLowerCase()}`
              : " · nothing read yet"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/api/auth/google?data=1">Reconnect</a>
        </Button>
      </div>

      {connection.lastError && (
        <p className="text-destructive flex items-start gap-1.5 text-[13px]">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          The last read failed: {connection.lastError} Reconnect to fix it.
        </p>
      )}

      <Separator />

      <ul className="space-y-2">
        <Granted on={connection.mail} icon={<MailIcon className="size-3.5" />} label="Gmail">
          Threads with the people and companies on your pipeline, matched by their address and
          domain. Searchable by an assistant.
        </Granted>
        <Granted on={connection.calendar} icon={<CalendarIcon className="size-3.5" />} label="Calendar">
          Interviews and calls with anyone on your pipeline, on the pipeline&apos;s calendar view
          and next to the application.
        </Granted>
      </ul>
      {(!connection.mail || !connection.calendar) && (
        <p className="text-faint text-xs leading-snug">
          The unticked one was left off Google&apos;s consent screen. Reconnect and tick it to
          turn it on.
        </p>
      )}

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Disconnecting revokes the token at Google and deletes it here. Nothing else changes.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await disconnectGoogleAction();
              toast.success("Google disconnected");
              onDisconnected?.();
            })
          }
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function Granted({
  on,
  icon,
  label,
  children,
}: {
  /** True granted, false refused, null not connected yet. */
  on: boolean | null;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={
          on
            ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-[var(--success-tint)] text-[var(--success)]"
            : "bg-muted text-muted-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md"
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium">
          {label}
          {on !== null && (
            <span className="text-faint ml-1.5 font-normal">{on ? "on" : "not granted"}</span>
          )}
        </p>
        <p className="text-muted-foreground text-xs leading-snug">{children}</p>
      </div>
    </li>
  );
}
