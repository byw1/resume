"use client";

import { useTransition } from "react";
import { CalendarIcon, CheckIcon, MailIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { disconnectGoogleAction } from "@/server/actions";
import { agoDay } from "@/lib/utils";

/**
 * Your own Gmail and Google Calendar, read live by the app.
 *
 * Connecting is a link out through Google's consent screen rather than an
 * action, because that is where the permission is given. Disconnecting is an
 * action: it revokes the token at Google and deletes the only thing this
 * instance holds. The panel says both of those things in words, because a
 * person handing over their inbox deserves to know exactly what that means
 * here — read-only, nothing copied, gone the moment they say so.
 */
export function GooglePanel({
  connection,
  ready,
  notice,
}: {
  connection: {
    email: string;
    mail: boolean;
    calendar: boolean;
    connectedAt: string;
    lastUsedAt: string | null;
    lastError: string;
  } | null;
  /** Whether an admin has configured a Google OAuth client at all. */
  ready: boolean;
  /** The outcome of a connect that just came back from Google, if one did. */
  notice: { ok: boolean; message: string } | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gmail and Calendar</CardTitle>
        <CardDescription>
          Connect your own Google account and the threads and meetings behind every contact,
          company and application show up on their pages — and an assistant can read them
          when you ask where something stands. Read-only: the app can never send, accept,
          archive or delete anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {notice && (
          <p
            className={
              notice.ok
                ? "flex items-center gap-1.5 text-sm text-[var(--success)]"
                : "text-destructive flex items-start gap-1.5 text-sm"
            }
          >
            {notice.ok ? (
              <CheckIcon className="size-3.5 shrink-0" />
            ) : (
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            )}
            {notice.message}
          </p>
        )}

        {!ready ? (
          <p className="text-muted-foreground text-[13px]">
            This instance has no Google OAuth client yet. An admin adds one under Admin →
            Configuration → Sign-in; the same client is what lets you connect here.
          </p>
        ) : connection ? (
          <>
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
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href="/api/auth/google?data=1">Reconnect</a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await disconnectGoogleAction();
                      toast.success("Google disconnected");
                    })
                  }
                >
                  Disconnect
                </Button>
              </div>
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
                Threads with the people and companies on your pipeline, matched by their
                address and domain. Searchable by an assistant.
              </Granted>
              <Granted
                on={connection.calendar}
                icon={<CalendarIcon className="size-3.5" />}
                label="Calendar"
              >
                Interviews and calls with anyone on your pipeline, on the pipeline&apos;s
                calendar view and next to the application.
              </Granted>
            </ul>
            {(!connection.mail || !connection.calendar) && (
              <p className="text-faint text-xs leading-snug">
                The unticked one was left off Google&apos;s consent screen. Reconnect and tick it
                to turn it on.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground max-w-md text-[13px]">
              Google will ask for read-only access to Gmail and Calendar. You can leave either
              unticked. Nothing from your account is copied to this server: every page asks
              Google when you open it, and disconnecting deletes the only thing kept, the token.
            </p>
            <Button asChild size="sm">
              <a href="/api/auth/google?data=1">Connect Google</a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Granted({
  on,
  icon,
  label,
  children,
}: {
  on: boolean;
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
          <span className="text-faint ml-1.5 font-normal">{on ? "on" : "not granted"}</span>
        </p>
        <p className="text-muted-foreground text-xs leading-snug">{children}</p>
      </div>
    </li>
  );
}
