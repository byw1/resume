import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { getApplication, listCompanies, listSources } from "@/lib/data/pipeline";
import { getResume, listResumeNames } from "@/lib/data/resumes";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getGoogleConnection } from "@/lib/data/google";
import { ApplicationDetail } from "@/components/pipeline/application-detail";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [application, resumes, sourceOptions, companies, { companyLogos }, googleConnection] =
    await Promise.all([
      getApplication(user.id, id),
      listResumeNames(user.id),
      listSources(user.id),
      listCompanies(user.id),
      getSettings(),
      getGoogleConnection(user.id),
    ]);
  if (!application) notFound();

  // Fetched only when one is attached: the document carries the owner's photo
  // as a data URI, which is not something to ship for a card nobody asked for.
  const attached = application.resumeId ? await getResume(user.id, application.resumeId) : null;

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
          sourceOptions={sourceOptions.map((source) => ({ id: source.id, name: source.name, color: source.color, applications: source._count.applications }))}
          company={{
            id: application.companyId,
            name: application.company.name,
            website: application.company.website,
          }}
          companies={companies.map((item) => ({
            id: item.id,
            name: item.name,
            website: item.website,
          }))}
          resumePreview={
            attached
              ? {
                  id: attached.id,
                  name: attached.name,
                  doc: attached.doc,
                  settings: {
                    template: attached.template,
                    accent: attached.accent,
                    fontFamily: attached.fontFamily,
                    fontSize: attached.fontSize,
                    lineHeight: attached.lineHeight,
                    pageMargin: attached.pageMargin,
                    photo: attached.showPhoto ? attached.photo : "",
                  },
                }
              : null
          }
          logos={companyLogos}
          googleAccess={
            googleConnection ? { mail: googleConnection.mail, calendar: googleConnection.calendar } : null
          }
        />
      </FadeIn>
    </PageShell>
  );
}
