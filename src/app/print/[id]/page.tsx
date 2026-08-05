import { notFound, redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getResume } from "@/lib/data/resumes";
import { ResumePaper } from "@/components/resume/resume-paper";
import { PrintTrigger } from "@/components/resume/print-trigger";

export const dynamic = "force-dynamic";

/**
 * A bare page containing nothing but the document, sized to US Letter.
 * "Save as PDF" from the browser print dialog gives a real, selectable,
 * ATS-readable PDF — no headless Chrome on the server required.
 */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/login");

  const { id } = await params;
  const resume = await getResume(id);
  if (!resume) notFound();

  return (
    <div className="min-h-svh bg-neutral-200 py-8 print:bg-white print:py-0">
      <PrintTrigger fileName={resume.name} />
      <div className="mx-auto w-fit bg-white shadow-2xl print:shadow-none">
        <ResumePaper
          doc={resume.doc}
          linkify
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
    </div>
  );
}
