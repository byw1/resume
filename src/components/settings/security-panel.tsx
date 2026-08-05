import { KeyRoundIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SecurityPanel({ configured }: { configured: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div
            className={
              configured
                ? "bg-[var(--success)]/12 text-[var(--success)] flex size-9 items-center justify-center rounded-xl"
                : "bg-[var(--warning)]/14 text-[var(--warning)] flex size-9 items-center justify-center rounded-xl"
            }
          >
            {configured ? (
              <ShieldCheckIcon className="size-[18px]" />
            ) : (
              <TriangleAlertIcon className="size-[18px]" />
            )}
          </div>
          <div>
            <CardTitle className="text-[15px]">Access</CardTitle>
            <p className="text-muted-foreground text-sm">
              {configured
                ? "This app is password protected."
                : "This app is open to anyone with the link."}
            </p>
          </div>
          <Badge variant={configured ? "success" : "warning"} className="ml-auto">
            {configured ? "Locked" : "Open"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="text-muted-foreground space-y-2 text-sm">
          <p className="flex items-start gap-2">
            <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              To change the password, edit the{" "}
              <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
                APP_PASSWORD
              </code>{" "}
              variable on your Railway service. The app redeploys automatically and the new password
              takes effect immediately.
            </span>
          </p>
          <p className="pl-[1.375rem]">
            Changing it signs out every existing session, including your own.
          </p>
        </div>

        {!configured && (
          <div className="rounded-lg border border-[var(--warning)]/35 bg-[var(--warning)]/8 px-3.5 py-3 text-sm">
            <p className="font-medium">No password set</p>
            <p className="text-muted-foreground mt-1">
              Add an <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">APP_PASSWORD</code>{" "}
              variable in Railway → Variables to lock this down. Everything here is personal data.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
