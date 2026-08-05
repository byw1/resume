import { headers } from "next/headers";
import { PageHeader, PageShell } from "@/components/page-header";
import { FadeIn } from "@/components/motion";
import { getOrCreateMcpToken, passwordIsConfigured } from "@/lib/auth";
import { McpPanel } from "@/components/settings/mcp-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { tools, prompts } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const token = await getOrCreateMcpToken();
  const headerList = await headers();

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Connect &amp; secure"
        description="One URL wires Claude into everything here — your brain, your resumes and your pipeline."
      />

      <div className="space-y-6">
        <FadeIn>
          <McpPanel
            url={`${baseUrl}/api/mcp/${token}`}
            toolCount={tools.length}
            promptNames={prompts.map((prompt) => ({
              name: prompt.name,
              title: prompt.title,
              description: prompt.description,
            }))}
          />
        </FadeIn>

        <FadeIn delay={0.08}>
          <SecurityPanel configured={passwordIsConfigured()} />
        </FadeIn>
      </div>
    </PageShell>
  );
}
