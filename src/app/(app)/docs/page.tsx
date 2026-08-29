import Link from "next/link";
import { headers } from "next/headers";
import {
  BookOpenIcon,
  BrainIcon,
  Building2Icon,
  FileTextIcon,
  KanbanIcon,
  PlugZapIcon,
  ShieldIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyBlock } from "@/components/docs/copy-block";
import { toolsFor, promptsFor } from "@/lib/mcp/tools";
import { listSkills } from "@/lib/skills";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The manual.
 *
 * The tool and workflow reference is generated from the tools array rather than
 * written out, because a hand-maintained list of ninety-odd tools is a list that is
 * wrong within a week — and being wrong here is worse than being absent, since
 * this page is what someone reads to decide what to ask for.
 */

const AREAS = [
  {
    key: "brain",
    label: "Brain",
    icon: BrainIcon,
    blurb:
      "Everything you know about your own career. Roles hold an unlimited raw brain dump plus polished reusable bullets; there are also notes, projects, education, skills and certifications.",
    match: (name: string) =>
      /^(search_brain|get_brain_snapshot|list_roles|get_role|create_role|update_role|delete_role|append_role_brain_dump|list_highlights|create_highlights|update_highlight|delete_highlight|list_notes|create_note|update_note|list_extras|create_extra|update_extra|delete_extra|get_profile|update_profile|mine_brain_dump)$/.test(
        name,
      ),
  },
  {
    key: "resumes",
    label: "Resumes",
    icon: FileTextIcon,
    blurb:
      "Documents assembled from that material, in the Harvard OCS format by default. Any of them can be published to a public link or exported as a PDF.",
    match: (name: string) => /resume/.test(name),
  },
  {
    key: "pipeline",
    label: "Pipeline",
    icon: KanbanIcon,
    blurb:
      "Applications, stages, the activity timeline, tasks and follow-up dates that schedule themselves when a stage changes.",
    match: (name: string) =>
      /^(list_applications|get_application|create_application|capture_job_posting|update_application|move_application_stage|move_applications_stage|delete_application|log_activity|list_activities|list_tasks|create_task|complete_task|list_follow_ups|list_schedule|list_saved_views|save_view|delete_saved_view|pipeline_stats|diagnose_search|pipeline_review|log_my_week)$/.test(
        name,
      ),
  },
  {
    key: "crm",
    label: "CRM",
    icon: Building2Icon,
    blurb:
      "Companies and the people at them, as records in their own right — website, industry, size and whatever research has accumulated.",
    match: (name: string) => /compan|contact/.test(name) && !name.startsWith("admin_"),
  },
  {
    key: "admin",
    label: "Admin",
    icon: ShieldIcon,
    blurb:
      "Managing the instance: invitations, accounts, email and appearance. Members never see these in their tool list at all.",
    match: (name: string) => name.startsWith("admin_") || name === "onboard_teammate",
  },
] as const;

export default async function DocsPage() {
  const user = await requireUser();
  const [settings, skills] = await Promise.all([getSettings(), listSkills()]);
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000";
  const proto = head.get("x-forwarded-proto") ?? "http";
  const baseUrl = settings.publicUrl?.replace(/\/$/, "") || `${proto}://${host}`;

  const tools = toolsFor(user);
  const workflows = promptsFor(user);
  const workflowNames = new Set(workflows.map((workflow) => workflow.name));

  // Every tool lands in exactly one area, and anything that finds no home is
  // shown rather than silently dropped — an undocumented tool is the bug this
  // page exists to prevent.
  const placed = new Set<string>();
  const byArea = AREAS.map((area) => {
    const owned = tools.filter((tool) => !placed.has(tool.name) && area.match(tool.name));
    owned.forEach((tool) => placed.add(tool.name));
    return { ...area, tools: owned };
  });
  const unplaced = tools.filter((tool) => !placed.has(tool.name));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Docs"
        title="How to drive this thing"
        description="Hired is built to be talked to. This page is what your assistant can do once it is connected, the workflows that come with it, and the skills worth installing so it knows how to behave before you have to tell it."
        actions={
          <Button asChild variant="default">
            <Link href="/settings">
              <PlugZapIcon /> Connect an assistant
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-4">
          {/* --- Getting started ------------------------------------------- */}
          <Card id="start" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <PlugZapIcon className="text-muted-foreground size-4" /> Getting connected
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13.5px] leading-relaxed">
              <ol className="space-y-2">
                <Step n={1}>
                  Open <Link href="/settings" className="text-primary hover:underline">Settings</Link>{" "}
                  and create a connection. Each assistant gets its own URL, so you can disconnect one
                  without touching the rest.
                </Step>
                <Step n={2}>
                  Paste that URL into Claude, Claude Code, ChatGPT, Cursor, VS Code or Windsurf —
                  the exact steps for each are on the Settings page.
                </Step>
                <Step n={3}>
                  Install the skills below. They are what stop you having to explain the rules every
                  time you start a conversation.
                </Step>
                <Step n={4}>
                  Fill the brain before you build a resume. Length is a feature — the raw material is
                  what the evidence gets mined from.
                </Step>
              </ol>
              <p className="text-muted-foreground">
                Your connection URL is a password. Anyone holding it can read and write everything in
                your workspace, so treat it like one — and revoke it from Settings if it leaks.
              </p>
            </CardContent>
          </Card>

          {/* --- Skills ------------------------------------------------------ */}
          <Card id="skills" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <SparklesIcon className="text-muted-foreground size-4" /> Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-[13.5px] leading-relaxed">
              <p className="text-muted-foreground">
                A skill is a file that teaches Claude how to behave before you ask it anything.
                These three ship with your instance. The first is the one to install if you install
                only one — it carries the rules that keep a resume honest.
              </p>

              <div className="bg-inset shadow-hairline rounded-control px-3.5 py-3">
                <div className="mb-1.5 text-[13px] font-medium">Where they go</div>
                <ul className="text-muted-foreground space-y-1 text-[13px]">
                  <li>
                    <span className="text-foreground font-medium">Claude Code</span> —{" "}
                    <code className="bg-card rounded px-1 py-0.5 font-mono text-[12px]">
                      ~/.claude/skills/&lt;name&gt;/SKILL.md
                    </code>{" "}
                    for every project, or{" "}
                    <code className="bg-card rounded px-1 py-0.5 font-mono text-[12px]">
                      .claude/skills/
                    </code>{" "}
                    inside one.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Claude apps</span> — Settings →
                    Capabilities → Skills → upload the file.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Anything else</span> — paste the
                    contents in at the start of a conversation. Less tidy, same effect.
                  </li>
                </ul>
              </div>

              {skills.length === 0 ? (
                <p className="text-faint">No skills found in this deployment.</p>
              ) : (
                <div className="space-y-4">
                  {skills.map((skill) => (
                    <div key={skill.slug} className="space-y-2">
                      <div>
                        <div className="font-mono text-[13px] font-medium">{skill.name}</div>
                        <p className="text-muted-foreground mt-0.5 text-[13px]">
                          {skill.description}
                        </p>
                      </div>
                      <CopyBlock
                        body={skill.body}
                        downloadHref={`/docs/skills/${skill.slug}`}
                        downloadName="SKILL.md"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* --- Workflows --------------------------------------------------- */}
          <Card id="workflows" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <BookOpenIcon className="text-muted-foreground size-4" /> Workflows
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13.5px] leading-relaxed">
              <p className="text-muted-foreground">
                Multi-step jobs that come with the connection. They arrive as slash commands in
                clients that support prompts, and as ordinary tools everywhere else — so they work
                either way. Ask for one by name, or just describe what you want.
              </p>
              <ul className="divide-y">
                {workflows.map((workflow) => (
                  <li key={workflow.name} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <code className="font-mono text-[13px] font-medium">{workflow.name}</code>
                      <span className="text-faint text-[12px]">{workflow.title}</span>
                      {workflow.adminOnly && (
                        <span className="stage-chip rounded-chip px-1.5 py-0.5 text-[11px] font-medium" style={{ ["--tone" as string]: "var(--warning)" }}>
                          admin
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[13px]">{workflow.description}</p>
                    {workflow.arguments.length > 0 && (
                      <p className="text-faint mt-1 text-[12px]">
                        Takes:{" "}
                        {workflow.arguments
                          .map((argument) => `${argument.name}${argument.required ? "" : " (optional)"}`)
                          .join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* --- Tools ------------------------------------------------------- */}
          <Card id="tools" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px]">
                <WrenchIcon className="text-muted-foreground size-4" /> Every tool
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-[13.5px] leading-relaxed">
              <p className="text-muted-foreground">
                {tools.length} tools, generated from the server itself — so this list is what your
                assistant actually sees, not a description of it.
              </p>

              {byArea.map((area) => (
                <section key={area.key} id={`tools-${area.key}`} className="scroll-mt-20">
                  <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                    <area.icon className="text-muted-foreground size-4" />
                    {area.label}
                    <span className="text-faint nums text-[12px] font-normal">
                      {area.tools.length}
                    </span>
                  </h3>
                  <p className="text-muted-foreground mt-1 text-[13px]">{area.blurb}</p>
                  <ul className="mt-2 divide-y">
                    {area.tools.map((tool) => (
                      <ToolRow key={tool.name} tool={tool} isWorkflow={workflowNames.has(tool.name)} />
                    ))}
                  </ul>
                </section>
              ))}

              {unplaced.length > 0 && (
                <section>
                  <h3 className="text-[14px] font-semibold">Everything else</h3>
                  <ul className="mt-2 divide-y">
                    {unplaced.map((tool) => (
                      <ToolRow key={tool.name} tool={tool} isWorkflow={workflowNames.has(tool.name)} />
                    ))}
                  </ul>
                </section>
              )}
            </CardContent>
          </Card>

          {/* --- Things to say ------------------------------------------------ */}
          <Card id="say" className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="text-[15px]">Things worth saying</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[13.5px]">
              {[
                "Here's a posting — tailor my resume to it and tell me what I can't evidence.",
                "I just had a call with the Helios recruiter. They said the team is six people and they want someone to own billing. Log it.",
                "What do I need to chase this week?",
                "Research Stripe and put it on their record.",
                "Get me ready for my system design round at Vercel.",
                "Here's everything I did last quarter, file it against the right roles.",
                "Publish my base resume and give me the link.",
              ].map((line) => (
                <p key={line} className="bg-inset shadow-hairline rounded-control px-3 py-2">
                  <span className="text-faint">“</span>
                  {line}
                  <span className="text-faint">”</span>
                </p>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* --- Contents ------------------------------------------------------ */}
        <nav className="sticky top-20 hidden h-fit space-y-px lg:block">
          <div className="eyebrow mb-1.5 px-2">
            On this page
          </div>
          {[
            ["#start", "Getting connected"],
            ["#skills", "Skills"],
            ["#workflows", "Workflows"],
            ["#tools", "Every tool"],
            ...byArea.map((area) => [`#tools-${area.key}`, area.label] as const),
            ["#say", "Things worth saying"],
          ].map(([href, label], index) => (
            <a
              key={href}
              href={href}
              className={cn(
                "text-muted-foreground hover:bg-accent/60 hover:text-foreground flex h-7 items-center rounded-control px-2 text-[13px] transition-colors duration-100",
                index > 3 && index < 4 + byArea.length && "pl-5 text-[12.5px]",
              )}
            >
              {label}
            </a>
          ))}

          <div className="text-faint mt-4 px-2 text-[12px] leading-relaxed">
            Your connection URL lives at{" "}
            <code className="font-mono">{baseUrl.replace(/^https?:\/\//, "")}/api/mcp/…</code>
          </div>
        </nav>
      </div>
    </PageShell>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="bg-inset text-muted-foreground nums mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11.5px] font-medium">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function ToolRow({
  tool,
  isWorkflow,
}: {
  tool: { name: string; title: string; description: string; adminOnly?: boolean };
  isWorkflow: boolean;
}) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <code className="font-mono text-[13px] font-medium">{tool.name}</code>
        <span className="text-faint text-[12px]">{tool.title}</span>
        {isWorkflow && (
          <span className="text-faint bg-inset rounded-chip px-1.5 py-0.5 text-[11px]">workflow</span>
        )}
        {tool.adminOnly && (
          <span
            className="stage-chip rounded-chip px-1.5 py-0.5 text-[11px] font-medium"
            style={{ ["--tone" as string]: "var(--warning)" }}
          >
            admin
          </span>
        )}
      </div>
      {/* Tool descriptions are prose written elsewhere, and some of them quote a
          query string or a URL — one unbreakable 45-character token is wider
          than this column on a phone and pushes the whole page sideways.
          Breaking anywhere costs nothing in normal prose and stops a
          description ever being able to do that. */}
      <p className="text-muted-foreground mt-0.5 text-[13px] leading-snug [overflow-wrap:anywhere]">
        {tool.description}
      </p>
    </li>
  );
}
