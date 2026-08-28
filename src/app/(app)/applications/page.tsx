import { PageHeader, PageShell } from "@/components/page-header";
import {
  BOARD_STAGES,
  STAGES,
  STAGE_LABEL,
  TERMINAL_STAGES,
  listApplications,
  listSchedule,
  pipelineStats,
} from "@/lib/data/pipeline";
import { listResumes } from "@/lib/data/resumes";
import { PipelineBoard } from "@/components/pipeline/board";
import { PipelineList } from "@/components/pipeline/list";
import { parseSort, sortRows, type ListRow } from "@/lib/pipeline-list";
import {
  PipelineCalendar,
  monthWindow,
  parseMonth,
  type CalendarEntry,
} from "@/components/pipeline/calendar";
import {
  PipelineToolbar,
  parseFilter,
  parseView,
  type PipelineFilter,
  type PipelineView,
} from "@/components/pipeline/toolbar";
import { ApplicationPanelProvider } from "@/components/pipeline/application-panel";
import { NewApplicationDialog } from "@/components/pipeline/new-application-dialog";
import { requireUser } from "@/lib/auth";
import { companyDomain } from "@/lib/company";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const BLURB: Record<PipelineView, string> = {
  board: "Drag a card to move it forward. Follow-up dates set themselves when the stage changes.",
  list: "Every application in one table. Click a column to sort by it, again to reverse.",
  calendar: "Follow-ups, task deadlines and everything you have logged, by the day it lands.",
};

function filterLabel(filter: PipelineFilter) {
  if (filter === "all") return null;
  if (filter === "overdue") return "Needs a nudge";
  if (filter === "closed") return "Closed";
  return STAGE_LABEL[filter];
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);
  const view = parseView(one("view"));
  const filter = parseFilter(one("f"), STAGES);
  const search = one("q")?.trim() ?? "";

  // Resolved once per request: with logos off, no domain reaches the browser
  // at all, so there is nothing for it to go and fetch.
  const [{ companyLogos }, resumes, stats] = await Promise.all([
    getSettings(),
    listResumes(user.id),
    pipelineStats(user.id),
  ]);
  const domainFor = (application: { company: { name: string; website: string } }) =>
    companyLogos
      ? companyDomain({ name: application.company.name, website: application.company.website })
      : null;

  const counts = {
    all: stats.total,
    overdue: stats.followUpsDue,
    closed: TERMINAL_STAGES.reduce((sum, stage) => sum + stats.counts[stage], 0),
    byStage: stats.counts,
  };

  const chrome = (content: React.ReactNode) => (
    <ApplicationPanelProvider>
      <PageShell className="max-w-none">
        <PageHeader
          eyebrow={filterLabel(filter) ? `Pipeline · ${filterLabel(filter)}` : "Pipeline"}
          title="Every conversation in flight"
          description={BLURB[view]}
        />
        <PipelineToolbar
          view={view}
          filter={filter}
          search={search}
          counts={counts}
          action={
            <NewApplicationDialog
              resumes={resumes.map((resume) => ({ id: resume.id, name: resume.name }))}
            />
          }
        />
        {content}
      </PageShell>
    </ApplicationPanelProvider>
  );

  if (view === "calendar") {
    const { year, month } = parseMonth(one("month"));
    const { from, to } = monthWindow(year, month);
    const schedule = await listSchedule(user.id, from, to);
    // A calendar entry belongs to an application, so a stage filter narrows it
    // the same way it narrows every other view. Entries with no application —
    // a standalone task — drop out, which is right: they have no stage.
    const kept = schedule.filter((entry) => {
      if (search && !`${entry.title} ${entry.detail}`.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (filter === "all") return true;
      if (!entry.stage) return false;
      if (filter === "overdue") return entry.kind === "FOLLOW_UP";
      if (filter === "closed") return TERMINAL_STAGES.includes(entry.stage);
      return entry.stage === filter;
    });
    const entries: CalendarEntry[] = kept.map((entry) => ({
      kind: entry.kind,
      id: entry.id,
      day: entry.date.toISOString().slice(0, 10),
      title: entry.title,
      applicationId: entry.applicationId,
      contactId: entry.contactId,
      done: entry.done,
    }));
    return chrome(
      <PipelineCalendar
        year={year}
        month={month}
        entries={entries}
        today={new Date().toISOString().slice(0, 10)}
      />,
    );
  }

  const all = await listApplications(user.id, {
    includeClosed: true,
    ...(search ? { search } : {}),
  });
  const now = Date.now();
  const matches = (application: (typeof all)[number]) => {
    if (filter === "all") return true;
    if (filter === "overdue") {
      return (
        !TERMINAL_STAGES.includes(application.stage) &&
        application.nextFollowUpAt !== null &&
        application.nextFollowUpAt.getTime() <= now
      );
    }
    if (filter === "closed") return TERMINAL_STAGES.includes(application.stage);
    return application.stage === filter;
  };
  const visible = all.filter(matches);

  if (view === "list") {
    const rows: ListRow[] = visible.map((application) => ({
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
    return chrome(<PipelineList rows={sortRows(rows, sort, desc)} sort={sort} desc={desc} />);
  }

  const toCard = (application: (typeof all)[number]) => ({
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

  // Which columns the board draws. Filtering to one stage should show that one
  // column, not five empty ones beside it; filtering to Closed should show no
  // columns at all, because closed applications live under the board.
  const columns =
    filter === "closed"
      ? []
      : filter !== "all" && filter !== "overdue" && BOARD_STAGES.includes(filter)
        ? [filter]
        : BOARD_STAGES;

  return chrome(
    <PipelineBoard
      open={visible.filter((a) => !TERMINAL_STAGES.includes(a.stage)).map(toCard)}
      closed={visible.filter((a) => TERMINAL_STAGES.includes(a.stage)).map(toCard)}
      columns={columns}
    />,
  );
}
