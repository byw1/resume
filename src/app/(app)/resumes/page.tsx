import { headers } from "next/headers";
import { FileTextIcon } from "lucide-react";
import { PageHeader, PageShell, EmptyState, SectionEmpty } from "@/components/page-header";
import { Stagger, StaggerItem, Lift } from "@/components/motion";
import { SearchBox } from "@/components/crm/search-box";
import { ResumeSortSelect } from "@/components/resume/resume-sort";
import { listResumes } from "@/lib/data/resumes";
import { parseResumeDoc } from "@/lib/resume-schema";
import { diffResumeDocs } from "@/lib/resume-diff";
import { estimatePages } from "@/lib/resume-text";
import { NewResumeDialog } from "@/components/resume/new-resume-dialog";
import { ResumeCard } from "@/components/resume/resume-card";
import { ResumePaper } from "@/components/resume/resume-paper";
import { PaperThumb } from "@/components/resume/paper-thumb";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResumesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const q = one("q")?.trim() ?? "";
  const sortParam = one("sort");
  const sort = sortParam === "name" || sortParam === "used" ? sortParam : "recent";

  const [resumes, roleCount, profile, headerList] = await Promise.all([
    listResumes(user.id, { search: q, sort }),
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

  // Parsed once per document: the thumbnail, the page gauge and the lineage
  // diff all read the same object.
  const docs = new Map(resumes.map((resume) => [resume.id, parseResumeDoc(resume.data)]));
  const byId = new Map(resumes.map((resume) => [resume.id, resume]));
  const variantCounts = new Map<string, number>();
  for (const resume of resumes) {
    if (resume.baseResumeId) {
      variantCounts.set(resume.baseResumeId, (variantCounts.get(resume.baseResumeId) ?? 0) + 1);
    }
  }

  // In the default view, a base is followed by its variants, so twelve
  // near-identical thumbnails read as one family rather than a wall. A chosen
  // sort or an active search means the person asked for a different order —
  // honour it flat.
  const ordered =
    sort === "recent" && !q
      ? (() => {
          const out: typeof resumes = [];
          const seen = new Set<string>();
          for (const resume of resumes) {
            if (seen.has(resume.id)) continue;
            if (resume.baseResumeId && byId.has(resume.baseResumeId)) continue;
            seen.add(resume.id);
            out.push(resume);
            for (const variant of resumes) {
              if (variant.baseResumeId === resume.id && !seen.has(variant.id)) {
                seen.add(variant.id);
                out.push(variant);
              }
            }
          }
          for (const resume of resumes) if (!seen.has(resume.id)) out.push(resume);
          return out;
        })()
      : resumes;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Documents"
        title="Resumes"
        description="One base resume, then a tailored variant per job. Ask Claude to build them from your brain — it will save them straight here."
        actions={<NewResumeDialog hasBrain={roleCount > 0} />}
      />

      {(resumes.length > 0 || q) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchBox placeholder="Search resumes…" className="w-full sm:w-72" />
          <ResumeSortSelect className="ml-auto" />
        </div>
      )}

      {resumes.length === 0 && q ? (
        <SectionEmpty>Nothing matches “{q}”. Clear the search to see everything.</SectionEmpty>
      ) : resumes.length === 0 ? (
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
          {ordered.map((resume) => {
            const doc = docs.get(resume.id)!;
            const baseRow = resume.baseResumeId ? byId.get(resume.baseResumeId) : undefined;
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
                    outcomes={resume.outcomes}
                    lineage={
                      resume.baseResume
                        ? {
                            baseId: resume.baseResume.id,
                            baseName: resume.baseResume.name,
                            changes: baseRow
                              ? diffResumeDocs(docs.get(baseRow.id)!, doc).summary
                              : "",
                          }
                        : null
                    }
                    variants={variantCounts.get(resume.id) ?? 0}
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
