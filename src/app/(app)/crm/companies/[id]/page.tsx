import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { CompanyDetail } from "@/components/crm/company-detail";
import { getCompany } from "@/lib/data/pipeline";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [company, { companyLogos }] = await Promise.all([getCompany(user.id, id), getSettings()]);
  if (!company) notFound();

  return (
    <PageShell>
      <FadeIn>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 mb-3">
          <Link href="/crm/companies">
            <ArrowLeftIcon /> Companies
          </Link>
        </Button>

        <CompanyDetail
          company={{
            id: company.id,
            name: company.name,
            website: company.website,
            industry: company.industry,
            size: company.size,
            location: company.location,
            notes: company.notes,
          }}
          applications={company.applications.map((application) => ({
            id: application.id,
            roleTitle: application.roleTitle,
            stage: application.stage,
            location: application.location,
            workMode: application.workMode,
            salaryRange: application.salaryRange,
            jobUrl: application.jobUrl,
            sources: application.sources,
            appliedAt: application.appliedAt?.toISOString() ?? null,
            nextFollowUpAt: application.nextFollowUpAt?.toISOString() ?? null,
          }))}
          contacts={company.contacts.map((contact) => ({
            id: contact.id,
            name: contact.name,
            title: contact.title,
            email: contact.email,
            relationship: contact.relationship,
          }))}
          logos={companyLogos}
        />
      </FadeIn>
    </PageShell>
  );
}
