import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  LibraryBigIcon,
  PaletteIcon,
  PlugZapIcon,
  ShieldIcon,
  UserRoundIcon,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { requireUser, isAdmin, ensureDefaultConnection } from "@/lib/auth";
import { ConnectionsPanel } from "@/components/settings/connections-panel";
import { AccountPanel } from "@/components/settings/account-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { listConnections } from "@/lib/data/connections";
import { getProfile } from "@/lib/data/brain";
import { toolsFor, promptsFor } from "@/lib/mcp/tools";
import { guessClient } from "@/lib/mcp/clients";
import { MANUAL_URL } from "@/lib/links";
import { getSettings, googleIsConfigured } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TABS = ["connections", "account", "appearance"] as const;

/**
 * Three tabs rather than one column of five cards.
 *
 * The page used to open on roughly twelve hundred pixels of connection
 * reference material, with the account you came to edit below all of it. Every
 * tab is now one subject, and the reference — the workflow catalogue, the
 * example sentences — is gone rather than folded, because /docs generates the
 * same list from the same array with more in it, and two renderings of one
 * generated list is one rendering that goes stale.
 *
 * Connections is the default. A new user's first ten minutes are the point of
 * this product, and they are spent pasting a URL into an assistant — not
 * changing a password.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const headerList = await headers();
  const { tab } = await searchParams;

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  // Nobody should ever land here with nothing to copy.
  await ensureDefaultConnection(user.id);
  const [connections, profile, settings] = await Promise.all([
    listConnections(user.id),
    getProfile(user.id),
    getSettings(),
  ]);

  const visibleTools = toolsFor(user);
  const visiblePrompts = promptsFor(user);
  const admin = isAdmin(user);

  // ?tab= so other screens can send someone to the right one — the resume
  // editor points at the photo, which lives under Account.
  const active = TABS.includes(tab as (typeof TABS)[number])
    ? (tab as (typeof TABS)[number])
    : "connections";

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="You and your assistants"
        description="Your account, how the app looks, and the URLs that let an assistant read and write your workspace. Each connection is yours alone — nobody else's data is reachable through one."
        actions={
          admin ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/admin">
                <ShieldIcon className="size-3.5" /> Admin
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue={active}>
        <TabsList className="mb-6">
          <TabsTrigger value="connections">
            <PlugZapIcon className="hidden size-4 sm:block" /> Connections
            <span className="text-muted-foreground ml-0.5 text-[11px] tabular-nums">
              {connections.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="account">
            <UserRoundIcon className="hidden size-4 sm:block" /> Account
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <PaletteIcon className="hidden size-4 sm:block" /> Appearance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          <div className="space-y-4">
            <FadeIn>
              <ConnectionsPanel
                baseUrl={baseUrl}
                connections={connections.map((connection) => ({
                  id: connection.id,
                  name: connection.name,
                  client: connection.client,
                  token: connection.token,
                  lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
                  lastUsedFrom: guessClient(connection.lastUsedFrom),
                }))}
                toolCount={visibleTools.length}
                adminToolCount={visibleTools.filter((tool) => tool.adminOnly).length}
                isAdmin={admin}
                promptCount={visiblePrompts.length}
              />
            </FadeIn>

            {/* Two places to read, and they are not the same place. /docs is
                generated from this instance — your tool count, your skills,
                your connection URL. The manual is the written guide to the
                product and lives outside any one deployment. A copy of either
                inside the other would be a second one to keep right. */}
            <FadeIn delay={0.06}>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Link
                  href="/docs"
                  className="text-muted-foreground hover:border-border hover:text-foreground flex items-start gap-2.5 rounded-xl border border-dashed px-4 py-3 text-[13px] transition-colors"
                >
                  <BookOpenIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block font-medium">Your tools</span>
                    {visibleTools.length} tools and {visiblePrompts.length} ready-made workflows come
                    with every connection. Listed as your assistant sees them.
                  </span>
                  <ArrowUpRightIcon className="mt-0.5 size-3.5 shrink-0" />
                </Link>

                <a
                  href={MANUAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:border-border hover:text-foreground flex items-start gap-2.5 rounded-xl border border-dashed px-4 py-3 text-[13px] transition-colors"
                >
                  <LibraryBigIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block font-medium">The manual</span>
                    Getting connected, filling the brain, tailoring a resume and running the search —
                    written out at docs.hired.tools.
                  </span>
                  <ArrowUpRightIcon className="mt-0.5 size-3.5 shrink-0" />
                </a>
              </div>
            </FadeIn>
          </div>
        </TabsContent>

        <TabsContent value="account">
          <FadeIn>
            <AccountPanel
              user={{
                name: user.name,
                email: user.email,
                role: user.role,
                photo: profile.photo,
                googleLinked: Boolean(user.googleId),
                hasPassword: Boolean(user.passwordHash),
              }}
              googleReady={googleIsConfigured(settings)}
            />
          </FadeIn>
        </TabsContent>

        <TabsContent value="appearance">
          <FadeIn>
            <AppearancePanel />
          </FadeIn>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
