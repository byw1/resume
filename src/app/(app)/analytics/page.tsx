import Link from "next/link";
import {
  ChartNoAxesColumnIcon,
  CircleUserRoundIcon,
  FlameIcon,
  TargetIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
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
  diagnoseSearch,
  funnelFlows,
  listActivities,
  pipelineStats,
} from "@/lib/data/pipeline";
import { truncate } from "@/lib/utils";
import { DiagnosisCard } from "@/components/dashboard/diagnosis";
import { FunnelSankey } from "@/components/analytics/funnel-sankey";
import { ShareFunnel } from "@/components/analytics/share-funnel";

export const dynamic = "force-dynamic";

/**
 * The search as numbers, kept apart from the search as a to-do list.
 *
 * The front door is what you owe today; this is the shape of the whole thing —
 * where applications go in, where they leak out, and what that says about the
 * search. Nothing here is actionable on purpose: the moment a due date or a
 * checkbox lands on this page it stops being the page you look at monthly and
 * starts competing with the one you look at every morning.
 */
export default async function AnalyticsPage() {
  const user = await requireUser();
  const [stats, diagnosis, funnel, activities, counts] = await Promise.all([
    pipelineStats(user.id),
    diagnoseSearch(user.id),
    funnelFlows(user.id),
    listActivities(user.id, undefined, 8),
    Promise.all([
      db.role.count({ where: { userId: user.id } }),
      db.resume.count({ where: { userId: user.id } }),
      db.highlight.count({ where: { userId: user.id } }),
    ]),
  ]);

  const [roleCount, resumeCount, highlightCount] = counts;
  const isEmpty = roleCount === 0 && stats.total === 0 && resumeCount === 0;
  const maxStage = Math.max(1, ...BOARD_STAGES.map((stage) => stats.counts[stage]));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Pipeline"
        title="How the search is going"
        description="The shape of it, not the to-do list: what is in flight, what is converting, and where applications are actually leaking out."
        actions={<ShareFunnel disabled={funnel.applied === 0} />}
      />

      {isEmpty ? (
        <EmptyState
          icon={ChartNoAxesColumnIcon}
          title="Nothing to measure yet"
          description="Track an application or two and this fills in: the funnel, the response rate, and a chart of where each one ended up."
          action={
            <Button asChild>
              <Link href="/applications">Go to the pipeline</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px]">Where each application ended up</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <FunnelSankey rungs={funnel.rungs} />
                {funnel.wishlist > 0 && (
                  <p className="text-faint mt-3 text-[12px]">
                    {funnel.wishlist} on the wishlist, not applied to — they never entered the
                    funnel, so they are not drawn.
                  </p>
                )}
              </CardContent>
            </Card>
          </FadeIn>

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
            <FadeIn delay={0.2}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-[15px]">On the board now</CardTitle>
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
