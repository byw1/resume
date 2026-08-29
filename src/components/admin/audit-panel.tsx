import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  targetEmail: string;
  detail: string;
  createdAt: string;
};

/**
 * What admins have done to accounts.
 *
 * Read-only by design and with no delete control: a log an admin can edit
 * answers nothing. Rows outlive the accounts they describe, which is why a
 * deleted user still appears here by address.
 */

const LABEL: Record<string, string> = {
  "user.invite": "Invited",
  "user.invite_revoke": "Invitation revoked",
  "user.role": "Role changed",
  "user.suspend": "Suspended",
  "user.reactivate": "Reactivated",
  "user.delete": "Deleted",
  "user.password_reset": "Password reset",
  "billing.link": "Billing linked",
  "billing.unlink": "Billing unlinked",
};

/** The ones that took something away. Worth spotting in a wall of rows. */
const SEVERE = new Set(["user.delete", "user.suspend", "user.password_reset"]);

export function AuditPanel({ rows }: { rows: AuditRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">Account activity</CardTitle>
        <p className="text-muted-foreground text-sm">
          Every administrative change to an account on this instance, newest first. Nothing here
          touches anyone&apos;s brain, resumes or applications — admins never see those.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-[13px]">
            Nothing yet. Invitations, role changes, suspensions and password resets are recorded
            here as they happen.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5">
                <span
                  className={cn(
                    "shrink-0 text-[13px] font-medium",
                    SEVERE.has(row.action) && "text-destructive",
                  )}
                >
                  {LABEL[row.action] ?? row.action}
                </span>
                {row.targetEmail && (
                  <span className="text-muted-foreground truncate text-[13px]">
                    {row.targetEmail}
                  </span>
                )}
                <span className="text-faint meta ml-auto shrink-0 text-[11.5px]">
                  {new Date(row.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <div className="text-faint w-full text-[12px]">
                  {row.detail ? `${row.detail} · ` : ""}by {row.actorEmail}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
