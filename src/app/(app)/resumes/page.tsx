import Link from "next/link";
import { FileTextIcon, LinkIcon, StarIcon } from "lucide-react";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lift, Stagger, StaggerItem } from "@/components/motion";
import { listResumes } from "@/lib/data/resumes";
import { parseResumeDoc } from "@/lib/resume-schema";
import { NewResumeDialog } from "@/components/resume/new-resume-dialog";
import { ResumePaper } from "@/components/resume/resume-paper";
import { PaperThumb } from "@/components/resume/paper-thumb";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const user = await requireUser();
  const [resumes, roleCount, profile] = await Promise.all([
    listResumes(user.id),
    db.role.count({ where: { userId: user.id } }),
    // One read for the whole grid: the thumbnails all draw the same face.
    db.profile.findUnique({ where: { userId: user.id }, select: { photo: true } }),
  ]);
  const photo = profile?.photo ?? "";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Documents"
        title="Resumes"
        description="One base resume, then a tailored variant per job. Ask Claude to build them from what is in Me — it will save them straight here."
        actions={<NewResumeDialog hasMaterial={roleCount > 0} />}
      />

      {resumes.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No resumes yet"
          description={
            roleCount > 0
              ? "Build one from Me in a click, or ask Claude to tailor one to a job posting."
              : "Add a role under Me first, then build a resume from it."
          }
          action={<NewResumeDialog hasMaterial={roleCount > 0} />}
        />
      ) : (
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {resumes.map((resume) => {
            const doc = parseResumeDoc(resume.data);
            return (
              <StaggerItem key={resume.id}>
                <Lift>
                  <Link href={`/resumes/${resume.id}`} className="block">
                    <Card className="group overflow-hidden p-0 transition-shadow duration-200 ease-[var(--ease-settle)] hover:shadow-raised">
                      {/* Live thumbnail of the actual document */}
                      <div className="relative border-b">
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
                        {/* The page is cropped, so fade the cut rather than
                            ending it on a hard line mid-sentence. */}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
                      </div>

                      <CardContent className="pt-4">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{resume.name}</div>
                            <div className="text-muted-foreground truncate text-xs">
                              {[resume.targetRole, resume.targetCompany].filter(Boolean).join(" · ") ||
                                "No target set"}
                            </div>
                          </div>
                          {resume.isFavorite && (
                            <StarIcon className="fill-primary text-primary size-3.5 shrink-0" />
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {resume.template}
                          </Badge>
                          {resume._count.applications > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              <LinkIcon className="size-2.5" />
                              {resume._count.applications}
                            </Badge>
                          )}
                          <span className="text-muted-foreground ml-auto text-[11px]">
                            {resume.updatedAt.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </Lift>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </PageShell>
  );
}
