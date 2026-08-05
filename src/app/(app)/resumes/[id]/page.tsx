import { notFound } from "next/navigation";
import { getResume } from "@/lib/data/resumes";
import { requireUser } from "@/lib/auth";
import { ResumeEditor } from "@/components/resume/resume-editor";

export const dynamic = "force-dynamic";

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const resume = await getResume(user.id, id);
  if (!resume) notFound();

  return (
    <ResumeEditor
      id={resume.id}
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
      }}
    />
  );
}
