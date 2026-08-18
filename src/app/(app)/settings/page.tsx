import { headers } from "next/headers";
import { PageHeader, PageShell } from "@/components/page-header";
import { FadeIn } from "@/components/motion";
import { requireUser, isAdmin, ensureDefaultConnection } from "@/lib/auth";
import { ConnectionsPanel } from "@/components/settings/connections-panel";
import { AccountPanel } from "@/components/settings/account-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { listConnections } from "@/lib/data/connections";
import { toolsFor, promptsFor } from "@/lib/mcp/tools";
import { guessClient } from "@/lib/mcp/clients";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const headerList = await headers();

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  // Nobody should ever land here with nothing to copy.
  await ensureDefaultConnection(user.id);
  const connections = await listConnections(user.id);

  const visibleTools = toolsFor(user);
  const visiblePrompts = promptsFor(user);

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Your connections"
        description="Give any AI assistant a URL and it can read and write your brain, your resumes and your pipeline. Each connection is yours alone — nobody else's data is reachable through it."
      />

      <div className="space-y-6">
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
            isAdmin={isAdmin(user)}
            prompts={visiblePrompts.map((prompt) => ({
              name: prompt.name,
              title: prompt.title,
              description: prompt.description,
            }))}
          />
        </FadeIn>

        <FadeIn delay={0.08}>
          <AppearancePanel />
        </FadeIn>

        <FadeIn delay={0.12}>
          <AccountPanel user={{ name: user.name, email: user.email, role: user.role }} />
        </FadeIn>
      </div>
    </PageShell>
  );
}
