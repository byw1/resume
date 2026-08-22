import Link from "next/link";
import { Building2Icon, ExternalLinkIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { CrmTabs } from "@/components/crm/tabs";
import { SearchBox } from "@/components/crm/search-box";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { NewCompanyDialog } from "@/components/crm/new-company-dialog";
import { listCompanies } from "@/lib/data/pipeline";
import { requireUser } from "@/lib/auth";
import { companyDomain } from "@/lib/company";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const search = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const [companies, { companyLogos }] = await Promise.all([
    listCompanies(user.id, { search: search || undefined }),
    getSettings(),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="CRM"
        title="Companies"
        description="Everywhere you have applied, plus anywhere you are still thinking about. The website here is what puts a logo on the pipeline."
        actions={
          <>
            <CrmTabs current="companies" />
            <NewCompanyDialog />
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Search companies…" className="w-full sm:w-72" />
        <span className="text-faint nums ml-auto text-[12px]">
          {companies.length} {companies.length === 1 ? "company" : "companies"}
        </span>
      </div>

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title={search ? "Nothing matches that" : "No companies yet"}
          description={
            search
              ? "Try a shorter search, or clear it to see everything."
              : "Track a job and its company appears here, or add one now to keep research somewhere before you apply."
          }
          action={search ? undefined : <NewCompanyDialog />}
        />
      ) : (
        <div className="bg-card shadow-card overflow-hidden rounded-xl">
          <div className="eyebrow bg-inset flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">Company</div>
            <div className="hidden w-40 shrink-0 md:block">Industry</div>
            <div className="hidden w-40 shrink-0 lg:block">Location</div>
            <div className="w-20 shrink-0 text-right">Applied</div>
            <div className="w-20 shrink-0 text-right">People</div>
          </div>

          <ul className="divide-y">
            {companies.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/crm/companies/${company.id}`}
                  className="hover:bg-accent/50 flex items-center gap-3 px-4 py-2.5 transition-colors duration-150"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <CompanyAvatar
                      name={company.name}
                      domain={
                        companyLogos
                          ? companyDomain({ name: company.name, website: company.website })
                          : null
                      }
                      size={26}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{company.name}</div>
                      <div className="text-faint truncate text-[12px]">
                        {company.website || "No website on file"}
                      </div>
                    </div>
                  </div>
                  <div className="text-muted-foreground hidden w-40 shrink-0 truncate text-[12px] md:block">
                    {company.industry || "—"}
                  </div>
                  <div className="text-faint hidden w-40 shrink-0 truncate text-[12px] lg:block">
                    {company.location || "—"}
                  </div>
                  <div className="nums text-muted-foreground w-20 shrink-0 text-right text-[12px]">
                    {company._count.applications || "—"}
                  </div>
                  <div className="nums text-faint w-20 shrink-0 text-right text-[12px]">
                    {company._count.contacts || "—"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {companies.some((company) => !company.website) && (
        <p className="text-faint mt-3 flex items-center gap-1.5 text-[12px]">
          <ExternalLinkIcon className="size-3" />
          Companies without a website fall back to their initials. Open one to add it.
        </p>
      )}
    </PageShell>
  );
}
