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
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const [resumes, roleCount] = await Promise.all([listResumes(), db.role.count()]);

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
                  <Link href={`/resumes/${resume.id}`} className="block">
                    <Card className="group overflow-hidden p-0 transition-all hover:border-primary/30 hover:elev-3">
                      {/* Live thumbnail of the actual document */}
                      <div className="relative h-[15rem] overflow-hidden border-b bg-white">
                        <div
                          className="absolute top-0 left-0 origin-top-left"
                          style={{ transform: "scale(0.29)", width: "8.5in" }}
                        >
                          <ResumePaper
                            doc={doc}
                            settings={{
                              template: resume.template,
                              accent: resume.accent,
                              fontFamily: resume.fontFamily,
                              fontSize: resume.fontSize,
                              lineHeight: resume.lineHeight,
                              pageMargin: resume.pageMargin,
                            }}
                          />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/12 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
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
