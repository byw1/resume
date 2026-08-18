import Link from "next/link";
import { getInviteByToken } from "@/lib/data/users";
import { getSettings } from "@/lib/settings";
import { AuthCard } from "@/components/login-form";
import { Button } from "@/components/ui/button";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ status, invite }, settings] = await Promise.all([
    getInviteByToken(token),
    getSettings(),
  ]);

  if (status !== "valid" || !invite) {
    const message =
      status === "expired"
        ? "This invitation has expired. Ask whoever invited you to send a new one."
        : status === "used"
          ? "This invitation has already been used. Try signing in instead."
          : "This invitation link isn't valid.";
    return (
        <main className="flex min-h-svh items-center justify-center p-6">
          <AuthCard title="Invitation unavailable" subtitle={message}>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </AuthCard>
        </main>
  );
  }

  const inviter = invite.invitedBy.name || invite.invitedBy.email;

  return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <AcceptInviteForm
          token={token}
          email={invite.email}
          inviter={inviter}
          instanceName={settings.instanceName}
        />
      </main>
  );
}
