import Link from "next/link";
import {
  ArrowRightIcon,
  BrainIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  FileTextIcon,
  FlameIcon,
  PlugZapIcon,
  SparklesIcon,
  TargetIcon,
  TrendingUpIcon,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { AnimatedNumber } from "@/components/animated-number";
import { db } from "@/lib/db";
import {
  ACTIVITY_LABEL,
  BOARD_STAGES,
  STAGE_LABEL,
  STAGE_TONE,
  followUpsDue,
  listActivities,
  listTasks,
  pipelineStats,
} from "@/lib/data/pipeline";
import { getProfile } from "@/lib/data/brain";
import { relativeDay, truncate } from "@/lib/utils";
import { TaskList } from "@/components/dashboard/task-list";
import { FollowUpList } from "@/components/dashboard/follow-up-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, followUps, tasks, activities, profile, counts] = await Promise.all([
    pipelineStats(),
    followUpsDue(3),
    listTasks({ done: false, limit: 8 }),
    listActivities(undefined, 8),
    getProfile(),
    Promise.all([db.role.count(), db.resume.count(), db.highlight.count()]),
  ]);

  const [roleCount, resumeCount, highlightCount] = counts;
  const firstName = profile.fullName.split(" ")[0];
  const isEmpty = roleCount === 0 && stats.total === 0 && resumeCount === 0;
  const maxStage = Math.max(1, ...BOARD_STAGES.map((stage) => stats.counts[stage]));

  return (
    <PageShell>
      <PageHeader
        eyebrow={greeting()}
        title={firstName ? `Let's go, ${firstName}.` : "Your career, in one place."}
        description="Everything you know about yourself, the resumes you build from it, and every conversation in flight."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/brain">
                <BrainIcon /> Brain dump
              </Link>
            </Button>
            <Button asChild variant="gradient">
              <Link href="/resumes?new=1">
                <SparklesIcon /> New resume
              </Link>
            </Button>
          </>
        }
      />

      {isEmpty ? (
        <Onboarding />
      ) : (
        <div className="space-y-6">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={TargetIcon}
              label="In flight"
              value={stats.active}
              hint={`${stats.total} tracked all-time`}
            />
            <StatCard
              icon={TrendingUpIcon}
              label="Response rate"
              value={stats.responseRate}
              suffix="%"
              hint={`${stats.interviews} in interviews`}
            />
            <StatCard
              icon={FlameIcon}
              label="Applied this week"
              value={stats.thisWeek}
              hint={stats.offers > 0 ? `${stats.offers} offer${stats.offers > 1 ? "s" : ""} on the table` : "Keep the streak"}
            />
            <StatCard
              icon={BrainIcon}
              label="Brain"
              value={highlightCount}
              hint={`${roleCount} role${roleCount === 1 ? "" : "s"} · ${resumeCount} resume${resumeCount === 1 ? "" : "s"}`}
            />
          </Stagger>

          <div className="grid gap-6 lg:grid-cols-3">
            <FadeIn delay={0.1} className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-[15px]">
                    <CalendarClockIcon className="text-primary size-4" />
                    Needs you now
                  </CardTitle>
                  <Button asChild variant="ghost" size="xs">
                    <Link href="/applications">
                      Pipeline <ArrowRightIcon />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  <FollowUpList
                    items={followUps.map((item) => ({
                      id: item.id,
                      company: item.company.name,
                      roleTitle: item.roleTitle,
                      stage: item.stage,
                      due: item.nextFollowUpAt ? relativeDay(item.nextFollowUpAt) : "",
                      overdue: item.nextFollowUpAt ? item.nextFollowUpAt < new Date() : false,
                    }))}
                  />
                </CardContent>
              </Card>
            </FadeIn>

            <FadeIn delay={0.15}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[15px]">
                    <CheckCircle2Icon className="text-primary size-4" />
                    Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TaskList
                    tasks={tasks.map((task) => ({
                      id: task.id,
                      title: task.title,
                      due: task.dueAt ? relativeDay(task.dueAt) : "",
                      overdue: task.dueAt ? task.dueAt < new Date() : false,
                      context: task.application
                        ? `${task.application.company.name}`
                        : "",
                    }))}
                  />
                </CardContent>
              </Card>
            </FadeIn>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <FadeIn delay={0.2}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-[15px]">Funnel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  {BOARD_STAGES.map((stage) => (
                    <div key={stage}>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-muted-foreground">{STAGE_LABEL[stage]}</span>
                        <span className="font-medium tabular-nums">{stats.counts[stage]}</span>
                      </div>
                      <Progress
                        value={(stats.counts[stage] / maxStage) * 100}
                        indicatorClassName="bg-[var(--stage-tone)]"
                        style={{ ["--stage-tone" as string]: STAGE_TONE[stage] }}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </FadeIn>

            <FadeIn delay={0.25} className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-[15px]">Recent activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {activities.length === 0 ? (
                    <p className="text-muted-foreground py-6 text-center text-sm">
                      Nothing logged yet.
                    </p>
                  ) : (
                    <ol className="relative space-y-4 pl-5">
                      <span className="bg-border absolute top-1.5 bottom-1.5 left-[3px] w-px" />
                      {activities.map((activity) => (
                        <li key={activity.id} className="relative">
                          <span className="bg-primary ring-background absolute top-1.5 -left-5 size-[7px] rounded-full ring-4" />
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <Link
                              href={`/applications/${activity.applicationId}`}
                              className="text-sm font-medium hover:underline"
                            >
                              {activity.application.company.name}
                            </Link>
                            <Badge variant="outline" className="text-[10px]">
                              {ACTIVITY_LABEL[activity.type]}
                            </Badge>
                            <span className="text-muted-foreground ml-auto text-xs">
                              {activity.occurredAt.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-sm">
                            {truncate(activity.body, 140)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </FadeIn>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
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
            <AnimatedNumber value={value} suffix={suffix} />
          </div>
          <p className="text-muted-foreground mt-2 text-xs">{hint}</p>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}

function Onboarding() {
  const steps = [
    {
      icon: PlugZapIcon,
      title: "Connect Claude",
      body: "Copy your private connection URL from Settings and add it to Claude as a custom connector. Claude can then read and write everything here.",
      href: "/settings",
      cta: "Get my URL",
    },
    {
      icon: BrainIcon,
      title: "Dump your brain",
      body: "Add each role and paste in everything — projects, numbers, stories, praise, failures. Length is a feature. Or just tell Claude and let it file things for you.",
      href: "/brain",
      cta: "Start dumping",
    },
    {
      icon: FileTextIcon,
      title: "Build a resume",
      body: "Ask Claude to tailor a resume to a job posting. It mines your brain for real evidence, writes the bullets and saves it here, print-ready.",
      href: "/resumes",
      cta: "See resumes",
    },
  ];

  return (
    <Stagger className="grid gap-4 md:grid-cols-3">
      {steps.map((step, i) => (
        <StaggerItem key={step.title}>
          <Card className="group h-full transition-shadow hover:elev-2">
            <CardContent className="flex h-full flex-col pt-6">
              <div className="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-xl">
                <step.icon className="size-[18px]" />
              </div>
              <div className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
                Step {i + 1}
              </div>
              <h3 className="text-[15px] font-semibold">{step.title}</h3>
              <p className="text-muted-foreground mt-2 flex-1 text-sm leading-relaxed">
                {step.body}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-5 w-fit">
                <Link href={step.href}>
                  {step.cta} <ArrowRightIcon />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
