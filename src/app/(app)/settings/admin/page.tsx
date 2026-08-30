import { headers } from "next/headers";
import { PageHeader, PageShell } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/animated-number";
import { requireAdmin } from "@/lib/auth";
import { instanceStats, listInvites, listUsers } from "@/lib/data/users";
import { listWaitlist, waitlistStats } from "@/lib/data/waitlist";
import { listAudit } from "@/lib/data/audit";
import { instanceHealth, listSystemEvents } from "@/lib/data/system";
import {
  billingIsConfigured,
  emailIsConfigured,
  getSettings,
  listVariables,
  maskSecret,
} from "@/lib/settings";
import { billedUserCount } from "@/lib/billing";
import { BillingPanel } from "@/components/admin/billing-panel";
import { UsersPanel } from "@/components/admin/users-panel";
import { InvitesPanel } from "@/components/admin/invites-panel";
import { WaitlistPanel } from "@/components/admin/waitlist-panel";
import { EmailPanel } from "@/components/admin/email-panel";
import { InstancePanel } from "@/components/admin/instance-panel";
import { VariablesPanel } from "@/components/admin/variables-panel";
import { AuditPanel } from "@/components/admin/audit-panel";
import { HealthPanel } from "@/components/admin/health-panel";
import { InboxIcon, ShieldIcon, UserPlusIcon, UsersIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const actor = await requireAdmin();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const [users, invites, stats, settings, waitlist, waiting] = await Promise.all([
    listUsers(),
    listInvites(),
    instanceStats(),
    getSettings(),
    listWaitlist(),
    waitlistStats(),
  ]);
  const [auditRows, health, systemEvents, variables] = await Promise.all([
    listAudit({ limit: 100 }),
    instanceHealth(),
    listSystemEvents({ limit: 50 }),
    listVariables(),
  ]);

  const emailReady = emailIsConfigured(settings);
  const billingReady = billingIsConfigured(settings);
  const billedUsers = await billedUserCount();
  const worstCheck = health.checks.some((check) => check.status === "down")
    ? "down"
    : health.checks.some((check) => check.status === "warn")
      ? "warn"
      : "ok";

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        eyebrow="Admin"
        title="Your platform"
        description="Invite people, manage accounts, and change how this instance behaves. Everyone gets their own private workspace — admins never see another person's brain or resumes."
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
          icon={InboxIcon}
          label="Waiting for access"
          value={waiting.waiting}
          hint={
            waiting.total === 0
              ? "Nobody has asked yet"
              : `${waiting.total} asked · ${waiting.invited} invited`
          }
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
          <TabsTrigger value="waitlist">
            Waitlist
            {waiting.waiting > 0 && (
              <span className="text-muted-foreground ml-1 text-xs tabular-nums">
                {waiting.waiting}
              </span>
            )}
          </TabsTrigger>
          {/* Email and billing were two tabs holding two forms each; they are
              one screen now, because "how this instance is set up" is a single
              question and nobody arrives wanting exactly one half of it. */}
          <TabsTrigger value="config">
            Configuration
            {!emailReady && <span className="ml-1 text-[var(--warning)]">•</span>}
          </TabsTrigger>
          <TabsTrigger value="variables">
            Variables
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">
              {variables.length}
            </span>
          </TabsTrigger>
          {/* The dot is why this tab does not need to be first: a healthy
              instance stays quiet, and a broken one says so from here. */}
          <TabsTrigger value="health">
            Health
            {worstCheck !== "ok" && (
              <span
                className={
                  worstCheck === "down" ? "ml-1 text-[var(--destructive)]" : "ml-1 text-[var(--warning)]"
                }
              >
                •
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit">Log</TabsTrigger>
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
                mcpLastUsedAt: user.mcpLastUsedAt ? user.mcpLastUsedAt.toISOString() : null,
                billed: Boolean(user.stripeCustomerId),
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

        <TabsContent value="waitlist">
          <FadeIn>
            <WaitlistPanel
              entries={waitlist.map((entry) => ({
                id: entry.id,
                email: entry.email,
                name: entry.name,
                context: entry.context,
                source: entry.source,
                notified: entry.notified,
                notifyError: entry.notifyError,
                invitedAt: entry.invitedAt ? entry.invitedAt.toISOString() : null,
                createdAt: entry.createdAt.toISOString(),
              }))}
            />
          </FadeIn>
        </TabsContent>

        <TabsContent value="config">
          <FadeIn>
            <div className="space-y-6">
              <InstancePanel
                settings={{
                  instanceName: settings.instanceName,
                  publicUrl: settings.publicUrl || `${proto}://${host}`,
                  companyLogos: settings.companyLogos,
                }}
              />
              <EmailPanel
                configured={emailReady}
                settings={{
                  resendApiKeyMasked: maskSecret(settings.resendApiKey),
                  hasApiKey: Boolean(settings.resendApiKey),
                  resendFromEmail: settings.resendFromEmail,
                  resendFromName: settings.resendFromName,
                }}
                ownEmail={actor.email}
              />
              <BillingPanel
                configured={billingReady}
                settings={{
                  stripeSecretKeyMasked: maskSecret(settings.stripeSecretKey),
                  hasSecretKey: Boolean(settings.stripeSecretKey),
                  stripeWebhookSecretMasked: maskSecret(settings.stripeWebhookSecret),
                  hasWebhookSecret: Boolean(settings.stripeWebhookSecret),
                  stripePaymentLink: settings.stripePaymentLink,
                }}
                billedUsers={billedUsers}
                webhookUrl={`${settings.publicUrl || `${proto}://${host}`}/api/stripe/webhook`}
              />
            </div>
          </FadeIn>
        </TabsContent>

        <TabsContent value="variables">
          <FadeIn>
            <VariablesPanel variables={variables} />
          </FadeIn>
        </TabsContent>
        <TabsContent value="health">
          <FadeIn>
            <HealthPanel
              checks={health.checks}
              events={systemEvents.map((event) => ({
                id: event.id,
                level: event.level,
                source: event.source,
                message: event.message,
                detail: event.detail,
                userEmail: event.userEmail,
                createdAt: event.createdAt.toISOString(),
              }))}
            />
          </FadeIn>
        </TabsContent>

        <TabsContent value="audit">
          <FadeIn>
            <AuditPanel
              filterable
              rows={auditRows.map((row) => ({
                id: row.id,
                actorEmail: row.actorEmail,
                action: row.action,
                targetEmail: row.targetEmail,
                detail: row.detail,
                createdAt: row.createdAt.toISOString(),
              }))}
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
      <Card className="group relative overflow-hidden transition-shadow duration-200 ease-[var(--ease-settle)] hover:shadow-raised">
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
