import { headers } from "next/headers";
import { PageHeader, PageShell } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/animated-number";
import { requireAdmin } from "@/lib/auth";
import { instanceStats, listInvites, listUsers } from "@/lib/data/users";
import { emailIsConfigured, getSettings, maskSecret } from "@/lib/settings";
import { UsersPanel } from "@/components/admin/users-panel";
import { InvitesPanel } from "@/components/admin/invites-panel";
import { EmailPanel } from "@/components/admin/email-panel";
import { MailCheckIcon, ShieldIcon, UserPlusIcon, UsersIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const actor = await requireAdmin();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const [users, invites, stats, settings] = await Promise.all([
    listUsers(),
    listInvites(),
    instanceStats(),
    getSettings(),
  ]);

  const emailReady = emailIsConfigured(settings);

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        eyebrow="Admin"
        title="Your platform"
        description="Invite people, manage accounts, and configure how invitation emails go out. Everyone gets their own private workspace — admins never see another person's brain or resumes."
      />

      <Stagger className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={UsersIcon} label="Members" value={stats.users} hint={`${stats.active} active`} />
        <Stat
          icon={ShieldIcon}
          label="Admins"
          value={stats.admins}
          hint="Can invite and manage"
        />
        <Stat
          icon={UserPlusIcon}
          label="Pending invites"
          value={stats.pendingInvites}
          hint="Not yet accepted"
        />
        <Stat
          icon={MailCheckIcon}
          label="Built so far"
          value={stats.resumes}
          hint={`${stats.roles} roles · ${stats.applications} applications`}
        />
      </Stagger>

      <Tabs defaultValue="people">
        <TabsList className="mb-6">
          <TabsTrigger value="people">
            People
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">{users.length}</span>
          </TabsTrigger>
          <TabsTrigger value="invites">
            Invites
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">{invites.length}</span>
          </TabsTrigger>
          <TabsTrigger value="email">
            Email
            {!emailReady && <span className="ml-1 text-[var(--warning)]">•</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people">
          <FadeIn>
            <UsersPanel
              actor={{ id: actor.id, role: actor.role }}
              users={users.map((user) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
                lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
                createdAt: user.createdAt.toISOString(),
                invitedBy: user.invitedBy ? user.invitedBy.name || user.invitedBy.email : null,
                counts: user._count,
              }))}
            />
          </FadeIn>
        </TabsContent>

        <TabsContent value="invites">
          <FadeIn>
            <InvitesPanel
              canInviteAdmins={actor.role === "SUPER_ADMIN"}
              emailReady={emailReady}
              baseUrl={settings.publicUrl || `${proto}://${host}`}
              invites={invites.map((invite) => ({
                id: invite.id,
                email: invite.email,
                role: invite.role,
                token: invite.token,
                expiresAt: invite.expiresAt.toISOString(),
                emailSent: invite.emailSent,
                emailError: invite.emailError,
                invitedBy: invite.invitedBy.name || invite.invitedBy.email,
              }))}
            />
          </FadeIn>
        </TabsContent>

        <TabsContent value="email">
          <FadeIn>
            <EmailPanel
              configured={emailReady}
              settings={{
                instanceName: settings.instanceName,
                resendApiKeyMasked: maskSecret(settings.resendApiKey),
                hasApiKey: Boolean(settings.resendApiKey),
                resendFromEmail: settings.resendFromEmail,
                resendFromName: settings.resendFromName,
                publicUrl: settings.publicUrl || `${proto}://${host}`,
              }}
              ownEmail={actor.email}
            />
          </FadeIn>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <StaggerItem>
      <Card className="group relative overflow-hidden transition-shadow hover:elev-2">
        <div className="from-primary/8 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <CardContent className="relative pt-5">
          <div className="flex items-center gap-2">
            <Icon className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground text-[12px] font-medium tracking-wide">
              {label}
            </span>
          </div>
          <div className="mt-2 text-[30px] leading-none font-semibold tracking-tight">
            <AnimatedNumber value={value} />
          </div>
          <p className="text-muted-foreground mt-2 text-xs">{hint}</p>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}
