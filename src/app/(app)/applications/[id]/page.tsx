import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { getApplication, listSourceOptions } from "@/lib/data/pipeline";
import { listResumes } from "@/lib/data/resumes";
import { requireUser } from "@/lib/auth";
import { ApplicationDetail } from "@/components/pipeline/application-detail";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [application, resumes, sourceOptions] = await Promise.all([
    getApplication(user.id, id),
    listResumes(user.id),
    listSourceOptions(user.id),
  ]);
  if (!application) notFound();

  return (
    <PageShell>
      <FadeIn>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 mb-4">
          <Link href="/applications">
            <ArrowLeftIcon /> Pipeline
          </Link>
        </Button>

        <ApplicationDetail
          application={{
            id: application.id,
            company: application.company.name,
            companyId: application.companyId,
            roleTitle: application.roleTitle,
            stage: application.stage,
            jobUrl: application.jobUrl,
            jobDescription: application.jobDescription,
            location: application.location,
            workMode: application.workMode,
            salaryRange: application.salaryRange,
            sources: application.sources,
            excitement: application.excitement,
            fit: application.fit,
            notes: application.notes,
            appliedAt: application.appliedAt?.toISOString() ?? null,
            nextFollowUpAt: application.nextFollowUpAt?.toISOString() ?? null,
            resumeId: application.resumeId,
          }}
          activities={application.activities.map((activity) => ({
            id: activity.id,
            type: activity.type,
            body: activity.body,
            occurredAt: activity.occurredAt.toISOString(),
          }))}
          contacts={application.contacts.map((contact) => ({
            id: contact.id,
            name: contact.name,
            title: contact.title,
            email: contact.email,
            linkedin: contact.linkedin,
            relationship: contact.relationship,
          }))}
          tasks={application.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            done: task.done,
            dueAt: task.dueAt?.toISOString() ?? null,
          }))}
          resumes={resumes.map((resume) => ({ id: resume.id, name: resume.name }))}
          sourceOptions={sourceOptions}
        />
      </FadeIn>
    </PageShell>
  );
}
