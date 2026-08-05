import { PageHeader, PageShell } from "@/components/page-header";
import { listApplications } from "@/lib/data/pipeline";
import { listResumes } from "@/lib/data/resumes";
import { PipelineBoard } from "@/components/pipeline/board";
import { NewApplicationDialog } from "@/components/pipeline/new-application-dialog";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const [open, closed, resumes] = await Promise.all([
    listApplications(),
    listApplications({ includeClosed: true }),
    listResumes(),
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
  });

  return (
    <PageShell className="max-w-none">
      <PageHeader
        eyebrow="Pipeline"
        title="Every conversation in flight"
        description="Drag a card to move it forward. Follow-up dates set themselves when the stage changes."
        actions={
          <NewApplicationDialog
            resumes={resumes.map((resume) => ({ id: resume.id, name: resume.name }))}
          />
        }
      />

      <PipelineBoard open={open.map(toCard)} closed={closedOnly.map(toCard)} />
    </PageShell>
  );
}
