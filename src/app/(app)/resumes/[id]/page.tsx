import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getResume, listResumes } from "@/lib/data/resumes";
import { getProfile } from "@/lib/data/brain";
import { requireUser } from "@/lib/auth";
import { ResumeEditor } from "@/components/resume/resume-editor";

export const dynamic = "force-dynamic";

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const headerList = await headers();
  const { id } = await params;
  const resume = await getResume(user.id, id);
  if (!resume) notFound();
  // Every other document, so "tailored from" can be set from the panel.
  const siblings = (await listResumes(user.id)).filter((row) => row.id !== id);

  // The editor gets the photo whether or not this document shows it, so the
  // toggle in the design popover previews instantly.
  const profile = await getProfile(user.id);

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <ResumeEditor
      id={resume.id}
      shareUrl={resume.slug ? `${proto}://${host}/r/${resume.slug}` : null}
      doc={resume.doc}
      meta={{
        name: resume.name,
        targetRole: resume.targetRole,
        targetCompany: resume.targetCompany,
        template: resume.template,
        accent: resume.accent,
        fontFamily: resume.fontFamily,
        fontSize: resume.fontSize,
        lineHeight: resume.lineHeight,
        pageMargin: resume.pageMargin,
        notes: resume.notes,
        isFavorite: resume.isFavorite,
        showPhoto: resume.showPhoto,
      }}
      photo={profile.photo}
      base={resume.base}
      siblings={siblings.map((row) => ({ id: row.id, name: row.name }))}
      applications={resume.applications.map((application) => ({
        id: application.id,
        roleTitle: application.roleTitle,
        stage: application.stage,
        company: application.company.name,
        appliedAt: application.appliedAt?.toISOString() ?? null,
      }))}
    />
  );
}
