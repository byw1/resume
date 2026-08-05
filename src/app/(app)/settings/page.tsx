import { headers } from "next/headers";
import { PageHeader, PageShell } from "@/components/page-header";
import { FadeIn } from "@/components/motion";
import { requireUser, isAdmin } from "@/lib/auth";
import { McpPanel } from "@/components/settings/mcp-panel";
import { AccountPanel } from "@/components/settings/account-panel";
import { toolsFor, promptsFor } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const headerList = await headers();

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  const visibleTools = toolsFor(user);
  const visiblePrompts = promptsFor(user);

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Your connection"
        description="One URL wires your Claude into your brain, your resumes and your pipeline. It's yours alone — nobody else's data is reachable through it."
      />

      <div className="space-y-6">
        <FadeIn>
          <McpPanel
            url={`${baseUrl}/api/mcp/${user.mcpToken}`}
            toolCount={visibleTools.length}
            adminToolCount={visibleTools.filter((tool) => tool.adminOnly).length}
            isAdmin={isAdmin(user)}
            promptNames={visiblePrompts.map((prompt) => ({
              name: prompt.name,
              title: prompt.title,
              description: prompt.description,
            }))}
          />
        </FadeIn>

        <FadeIn delay={0.08}>
          <AccountPanel
            user={{ name: user.name, email: user.email, role: user.role }}
          />
        </FadeIn>
      </div>
    </PageShell>
  );
}
