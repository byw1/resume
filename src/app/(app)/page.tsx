import Link from "next/link";
import { CalendarClockIcon, ChartNoAxesColumnIcon, SparklesIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn } from "@/components/motion";
import { FollowUpList } from "@/components/dashboard/follow-up-list";
import { SetupStrip } from "@/components/dashboard/setup-strip";
import { QuickLog } from "@/components/dashboard/quick-log";
import { TaskPanel } from "@/components/tasks/task-panel";
import { PingScheduler } from "@/components/tasks/ping-scheduler";
import type { SubjectOption } from "@/components/tasks/subject-picker";
import { requireUser } from "@/lib/auth";
import { setupStatus } from "@/lib/data/onboarding";
import {
  contactFollowUpsDue,
  followUpsDue,
  listApplications,
  listCompanies,
  listContacts,
  listTasks,
} from "@/lib/data/pipeline";
import { listResumeNames } from "@/lib/data/resumes";
import { getProfile, listNotes, listRoles } from "@/lib/data/me";
import { taskSubjectOf } from "@/lib/task-subject";
import { relativeDay } from "@/lib/utils";
import type { Stage } from "@prisma/client";

/** Morning, afternoon or evening, on the server's clock. */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export const dynamic = "force-dynamic";

/**
 * Everything you owe, and it is the first thing you see.
 *
 * This used to be /tasks, behind a dashboard of numbers. The numbers were the
 * wrong front door: you open this app to do the next thing, not to read your
 * own statistics, and a screen you have to click past every morning is a tax.
 * The statistics moved to /analytics, where you go when the question is
 * actually "how is this going".
 *
 * Two lists here, deliberately not merged. Tasks are things you wrote down and
 * can tick off; the chase list is dates the app worked out for you — a
 * follow-up that has come round, a person you said you would ping. Ticking a
 * task and logging a chase mean different things, so they stay side by side
 * rather than interleaved into one column of look-alike rows.
 */
export default async function HomePage() {
  const user = await requireUser();
  const [
    tasks,
    applications,
    followUps,
    contactPings,
    contacts,
    companies,
    resumeNames,
    roles,
    notes,
    profile,
    setup,
  ] = await Promise.all([
    listTasks(user.id, { limit: 300 }),
    listApplications(user.id),
    // A week out, not just today: this is the page you plan from, and a list
    // that only ever shows what is already late plans nothing.
    followUpsDue(user.id, 7),
    contactFollowUpsDue(user.id, 7),
    listContacts(user.id),
    listCompanies(user.id),
    listResumeNames(user.id),
    listRoles(user.id),
    listNotes(user.id),
    getProfile(user.id),
    setupStatus(user.id),
  ]);
  const firstName = profile.fullName.trim().split(/\s+/)[0] ?? "";

  // Everything a task can be about, in one list for the picker. Built here
  // rather than in the client so the six reads happen once per page rather
  // than once per popover.
  const subjects: SubjectOption[] = [
    ...applications.map((application) => ({
      kind: "application" as const,
      id: application.id,
      label: application.roleTitle,
      hint: application.company.name,
    })),
    ...contacts.map((contact) => ({
      kind: "contact" as const,
      id: contact.id,
      label: contact.name,
      hint: contact.title || undefined,
    })),
    ...companies.map((company) => ({
      kind: "company" as const,
      id: company.id,
      label: company.name,
    })),
    ...resumeNames.map((resume) => ({
      kind: "resume" as const,
      id: resume.id,
      label: resume.name,
    })),
    ...roles.map((role) => ({
      kind: "role" as const,
      id: role.id,
      label: role.title,
      hint: role.company || undefined,
    })),
    ...notes.map((note) => ({
      kind: "note" as const,
      id: note.id,
      label: note.title || "Untitled note",
    })),
  ];

  const now = new Date();
  const chase = [
    ...followUps.map((application) => ({
      id: application.id,
      company: application.company.name,
      roleTitle: application.roleTitle,
      stage: application.stage as Stage | null,
      dueAt: application.nextFollowUpAt,
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
  ]
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0))
    .map((item) => ({
      ...item,
      due: relativeDay(item.dueAt),
      overdue: item.dueAt !== null && item.dueAt < now,
    }));

  const overdue = chase.filter((item) => item.overdue).length;

  return (
    <PageShell>
      <PageHeader
        eyebrow={greeting()}
        title={firstName ? `Let's go, ${firstName}.` : "What you owe yourself."}
        description="The things you wrote down, and the follow-ups that have come round. Your assistant can read and write this list too."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/analytics">
                <ChartNoAxesColumnIcon /> Analytics
              </Link>
            </Button>
            <Button asChild variant="default">
              <Link href="/me?tab=resumes&new=1">
                <SparklesIcon /> New resume
              </Link>
            </Button>
          </>
        }
      />

      {setup.outstanding && <SetupStrip status={setup} />}

      {/* Above the list, because reporting what happened is the thing you came
          here to do; the list is what you work down afterwards. */}
      <QuickLog />

      <FadeIn>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <TaskPanel
            tasks={tasks.map((task) => ({
              id: task.id,
              title: task.title,
              detail: task.detail,
              dueISO: task.dueAt?.toISOString() ?? "",
              dueDate: task.dueAt ? task.dueAt.toISOString().slice(0, 10) : "",
              done: task.done,
              subject: taskSubjectOf(task),
            }))}
            subjects={subjects}
          />

          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <CalendarClockIcon className="text-muted-foreground size-4" />
                  Chase
                </CardTitle>
                {overdue > 0 && (
                  <span className="text-destructive nums text-[12px] font-medium">
                    {overdue} overdue
                  </span>
                )}
              </CardHeader>
              <CardContent>
                <FollowUpList items={chase} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-[15px]">Ping someone</CardTitle>
              </CardHeader>
              <CardContent>
                <PingScheduler
                  contacts={contacts.map((contact) => ({
                    id: contact.id,
                    name: contact.name,
                    detail:
                      [contact.title, ...contact.companies.map((company) => company.name)]
                        .filter(Boolean)
                        .join(" · ") || "",
                  }))}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </FadeIn>
    </PageShell>
  );
}
