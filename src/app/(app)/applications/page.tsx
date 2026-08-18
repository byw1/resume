import { PageHeader, PageShell } from "@/components/page-header";
import { listApplications, listSchedule } from "@/lib/data/pipeline";
import { listResumes } from "@/lib/data/resumes";
import { PipelineBoard } from "@/components/pipeline/board";
import { PipelineList, parseSort, sortRows, type ListRow } from "@/components/pipeline/list";
import {
  PipelineCalendar,
  monthWindow,
  parseMonth,
  type CalendarEntry,
} from "@/components/pipeline/calendar";
import { ViewSwitcher, parseView } from "@/components/pipeline/view-switcher";
import { NewApplicationDialog } from "@/components/pipeline/new-application-dialog";
import { requireUser } from "@/lib/auth";
import { companyDomain } from "@/lib/company";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const BLURB = {
  board: "Drag a card to move it forward. Follow-up dates set themselves when the stage changes.",
  list: "Every application in one table. Click a column to sort by it, again to reverse.",
  calendar: "Follow-ups, task deadlines and everything you have logged, by the day it lands.",
};

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  // Resolved once per request: with logos off, no domain reaches the browser
  // at all, so there is nothing for it to go and fetch.
  const { companyLogos } = await getSettings();
  const domainFor = (application: { company: { name: string; website: string }; jobUrl: string }) =>
    companyLogos
      ? companyDomain({
          name: application.company.name,
          website: application.company.website,
          jobUrl: application.jobUrl,
        })
      : null;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);
  const view = parseView(one("view"));

  const resumes = await listResumes(user.id);
  const header = (
    <PageHeader
      eyebrow="Pipeline"
      title="Every conversation in flight"
      description={BLURB[view]}
      actions={
        <>
          <ViewSwitcher current={view} />
          <NewApplicationDialog
            resumes={resumes.map((resume) => ({ id: resume.id, name: resume.name }))}
          />
        </>
      }
    />
  );

  if (view === "calendar") {
    const { year, month } = parseMonth(one("month"));
    const { from, to } = monthWindow(year, month);
    const schedule = await listSchedule(user.id, from, to);
    const entries: CalendarEntry[] = schedule.map((entry) => ({
      kind: entry.kind,
      id: entry.id,
      day: entry.date.toISOString().slice(0, 10),
      title: entry.title,
      applicationId: entry.applicationId,
      done: entry.done,
    }));
    return (
      <PageShell className="max-w-none">
        {header}
        <PipelineCalendar
          year={year}
          month={month}
          entries={entries}
          today={new Date().toISOString().slice(0, 10)}
        />
      </PageShell>
    );
  }

  if (view === "list") {
    const all = await listApplications(user.id, { includeClosed: true });
    const rows: ListRow[] = all.map((application) => ({
      id: application.id,
      company: application.company.name,
      roleTitle: application.roleTitle,
      stage: application.stage,
      location: application.location,
      salaryRange: application.salaryRange,
      excitement: application.excitement,
      nextFollowUpAt: application.nextFollowUpAt?.toISOString() ?? null,
      activityCount: application._count.activities,
      updatedAt: application.updatedAt.toISOString(),
      domain: domainFor(application),
    }));
    const sort = parseSort(one("sort"));
    const desc = one("dir") === "desc";
    return (
      <PageShell className="max-w-none">
        {header}
        <PipelineList rows={sortRows(rows, sort, desc)} sort={sort} desc={desc} />
      </PageShell>
    );
  }

  const [open, closed] = await Promise.all([
    listApplications(user.id),
    listApplications(user.id, { includeClosed: true }),
  ]);
  const closedOnly = closed.filter(
    (application) => !open.some((item) => item.id === application.id),
  );

  const toCard = (application: (typeof open)[number]) => ({
    id: application.id,
    company: application.company.name,
    roleTitle: application.roleTitle,
    stage: application.stage,
    location: application.location,
    salaryRange: application.salaryRange,
    excitement: application.excitement,
    nextFollowUpAt: application.nextFollowUpAt ? application.nextFollowUpAt.toISOString() : null,
    resumeName: application.resume?.name ?? null,
    activityCount: application._count.activities,
    domain: domainFor(application),
  });

  return (
    <PageShell className="max-w-none">
      {header}
      <PipelineBoard open={open.map(toCard)} closed={closedOnly.map(toCard)} />
    </PageShell>
  );
}
