import { headers } from "next/headers";
import { FileTextIcon } from "lucide-react";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { Stagger, StaggerItem, Lift } from "@/components/motion";
import { listResumes } from "@/lib/data/resumes";
import { parseResumeDoc } from "@/lib/resume-schema";
import { estimatePages } from "@/lib/resume-text";
import { NewResumeDialog } from "@/components/resume/new-resume-dialog";
import { ResumeCard } from "@/components/resume/resume-card";
import { ResumePaper } from "@/components/resume/resume-paper";
import { PaperThumb } from "@/components/resume/paper-thumb";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const user = await requireUser();
  const [resumes, roleCount, profile, headerList] = await Promise.all([
    listResumes(user.id),
    db.role.count({ where: { userId: user.id } }),
    // One read for the whole grid: the thumbnails all draw the same face.
    db.profile.findUnique({ where: { userId: user.id }, select: { photo: true } }),
    headers(),
  ]);
  const photo = profile?.photo ?? "";

  // For the copy-link action on published cards, built the same way the editor
  // builds its share URL.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <PageShell>
      <PageHeader
        eyebrow="Documents"
        title="Resumes"
        description="One base resume, then a tailored variant per job. Ask Claude to build them from your brain — it will save them straight here."
        actions={<NewResumeDialog hasBrain={roleCount > 0} />}
      />

      {resumes.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No resumes yet"
          description={
            roleCount > 0
              ? "Build one from your brain in a click, or ask Claude to tailor one to a job posting."
              : "Add a role to your brain first, then build a resume from it."
          }
          action={<NewResumeDialog hasBrain={roleCount > 0} />}
        />
      ) : (
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {resumes.map((resume) => {
            const doc = parseResumeDoc(resume.data);
            return (
              <StaggerItem key={resume.id}>
                <Lift>
                  <ResumeCard
                    id={resume.id}
                    name={resume.name}
                    target={[resume.targetRole, resume.targetCompany].filter(Boolean).join(" · ")}
                    template={resume.template}
                    pages={estimatePages(doc)}
                    publicUrl={resume.slug ? `${proto}://${host}/r/${resume.slug}` : null}
                    photoOnPublicPage={resume.showPhoto && Boolean(photo)}
                    applications={resume._count.applications}
                    isFavorite={resume.isFavorite}
                    updatedLabel={resume.updatedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  >
                    <PaperThumb>
                      <ResumePaper
                        doc={doc}
                        settings={{
                          template: resume.template,
                          accent: resume.accent,
                          fontFamily: resume.fontFamily,
                          fontSize: resume.fontSize,
                          lineHeight: resume.lineHeight,
                          pageMargin: resume.pageMargin,
                          photo: resume.showPhoto ? photo : "",
                        }}
                      />
                    </PaperThumb>
                  </ResumeCard>
                </Lift>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </PageShell>
  );
}
