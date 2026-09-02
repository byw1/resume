import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CircleUserRoundIcon,
  CheckCircle2Icon,
  FlameIcon,
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
import { requireUser } from "@/lib/auth";
import {
  ACTIVITY_LABEL,
  BOARD_STAGES,
  STAGE_LABEL,
  STAGE_TONE,
  contactFollowUpsDue,
  diagnoseSearch,
  followUpsDue,
  listActivities,
  listTasks,
  pipelineStats,
} from "@/lib/data/pipeline";
import type { Stage } from "@prisma/client";
import { getProfile } from "@/lib/data/me";
import { relativeDay, truncate } from "@/lib/utils";
import { TaskList } from "@/components/dashboard/task-list";
import { FollowUpList } from "@/components/dashboard/follow-up-list";
import { DiagnosisCard } from "@/components/dashboard/diagnosis";
import { SetupStrip } from "@/components/dashboard/setup-strip";
import { setupStatus } from "@/lib/data/onboarding";
import { QuickLog } from "@/components/dashboard/quick-log";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, diagnosis, followUps, contactPings, tasks, activities, profile, setup, counts] =
    await Promise.all([
    pipelineStats(user.id),
    diagnoseSearch(user.id),
    followUpsDue(user.id, 3),
    contactFollowUpsDue(user.id, 3),
    listTasks(user.id, { done: false, limit: 8 }),
    listActivities(user.id, undefined, 8),
    getProfile(user.id),
    setupStatus(user.id),
    Promise.all([
      db.role.count({ where: { userId: user.id } }),
      db.resume.count({ where: { userId: user.id } }),
      db.highlight.count({ where: { userId: user.id } }),
    ]),
  ]);

  const [roleCount, resumeCount, highlightCount] = counts;

  // One chase list: applications to follow up and people to ping, due first.
  const chase = [
    ...followUps.map((item) => ({
      id: item.id,
      company: item.company.name,
      roleTitle: item.roleTitle,
      stage: item.stage as Stage | null,
      dueAt: item.nextFollowUpAt,
      kind: "application" as const,
    })),
    ...contactPings.map((contact) => ({
      id: contact.id,
      company: contact.name,
      roleTitle:
        [contact.title, ...contact.companies.map((company) => company.name)]
          .filter(Boolean)
          .join(" · ") || "Contact",
      stage: null,
      dueAt: contact.nextFollowUpAt,
      kind: "contact" as const,
    })),
  ].sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  const firstName = (profile.fullName || user.name).split(" ")[0];
  const isEmpty = roleCount === 0 && stats.total === 0 && resumeCount === 0;
  const maxStage = Math.max(1, ...BOARD_STAGES.map((stage) => stats.counts[stage]));

  return (
    <PageShell>
      <PageHeader
        eyebrow={greeting()}
        title={firstName ? `Let's go, ${firstName}.` : "Your career, in one place."}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/me">
                <CircleUserRoundIcon /> Me
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/resumes?new=1">
                <SparklesIcon /> New resume
              </Link>
            </Button>
          </>
        }
      />

      {setup.outstanding && <SetupStrip status={setup} />}

      {isEmpty ? null : (
        <div className="space-y-4">
          {/* Above the numbers, because reporting what happened is the thing
              you came here to do; the numbers are what you read afterwards. */}
          <QuickLog />

          {/* Two up from the narrowest screen. One card per row made the four
              numbers a four-screen scroll on a phone, which is the opposite of
              what a summary is for. */}
          <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              icon={CircleUserRoundIcon}
              label="Me"
              value={highlightCount}
              hint={`${roleCount} role${roleCount === 1 ? "" : "s"} · ${resumeCount} resume${resumeCount === 1 ? "" : "s"}`}
            />
          </Stagger>

          <FadeIn delay={0.08}>
            <DiagnosisCard diagnosis={diagnosis} />
          </FadeIn>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <FadeIn delay={0.1} className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-[15px]">
                    <CalendarClockIcon className="text-muted-foreground size-4" />
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
                    items={chase.map((item) => ({
                      id: item.id,
                      company: item.company,
                      roleTitle: item.roleTitle,
                      stage: item.stage,
                      due: item.dueAt ? relativeDay(item.dueAt) : "",
                      overdue: item.dueAt ? item.dueAt < new Date() : false,
                      kind: item.kind,
                    }))}
                  />
                </CardContent>
              </Card>
            </FadeIn>

            <FadeIn delay={0.15}>
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-[15px]">
                    <CheckCircle2Icon className="text-muted-foreground size-4" />
                    Tasks
                  </CardTitle>
                  {/* The glance is eight rows. The whole list, with dates and
                      roles you can change, is its own page. */}
                  <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
                    <Link href="/tasks">
                      All tasks <ArrowRightIcon />
                    </Link>
                  </Button>
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

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <FadeIn delay={0.2}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-[15px]">Funnel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  {BOARD_STAGES.map((stage) => (
                    <div key={stage}>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-muted-foreground text-[13px]">{STAGE_LABEL[stage]}</span>
                        <span className="nums text-[13px] font-medium">{stats.counts[stage]}</span>
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
                          <span className="bg-border ring-background absolute top-1.5 -left-5 size-[7px] rounded-full ring-4" />
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <Link
                              href={
                                activity.applicationId
                                  ? `/applications/${activity.applicationId}`
                                  : `/crm/contacts/${activity.contactId}`
                              }
                              className="text-sm font-medium hover:underline"
                            >
                              {activity.application?.company.name ??
                                activity.contact?.name ??
                                "Note"}
                            </Link>
                            <Badge variant="outline" className="text-[10px]">
                              {ACTIVITY_LABEL[activity.type]}
                            </Badge>
                            <span className="text-faint meta ml-auto text-[11.5px]">
                              {activity.occurredAt.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-[13px]">
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
      <Card className="group relative overflow-hidden transition-shadow duration-200 ease-[var(--ease-settle)] hover:shadow-raised">
        <CardContent className="relative px-4 pt-3.5 pb-3.5">
          <div className="flex items-center gap-1.5">
            <Icon className="text-faint size-3.5" />
            <span className="text-muted-foreground meta text-[11px] font-medium">{label}</span>
          </div>
          {/* Tabular figures so the four numbers line up as a row rather than
              jittering against each other. */}
          <div className="nums mt-1.5 text-[26px] leading-none font-semibold tracking-tight">
            <AnimatedNumber value={value} suffix={suffix} />
          </div>
          <p className="text-faint mt-1.5 text-[11.5px]">{hint}</p>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}


function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
