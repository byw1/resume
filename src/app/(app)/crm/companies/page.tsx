import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, Building2Icon, ExternalLinkIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { CrmTabs } from "@/components/crm/tabs";
import { SearchBox } from "@/components/crm/search-box";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { NewCompanyDialog } from "@/components/crm/new-company-dialog";
import { listCompanies, type CompanyFilter } from "@/lib/data/pipeline";
import { requireUser } from "@/lib/auth";
import { companyDomain } from "@/lib/company";
import { getSettings } from "@/lib/settings";
import { agoDay, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The cuts and orderings live in the URL — same rule as the pipeline: the
 * address is the state, and a view you can paste to yourself beats one you
 * have to rebuild by clicking.
 */
const FILTERS: { key: CompanyFilter | undefined; label: string }[] = [
  { key: undefined, label: "Everything" },
  { key: "active", label: "Active pipeline" },
  { key: "applied", label: "Applied" },
  { key: "never-applied", label: "Never applied" },
  { key: "with-contacts", label: "Know someone" },
];

type SortKey = "name" | "applied" | "apps" | "people";

function parseFilter(value: string | undefined): CompanyFilter | undefined {
  return FILTERS.some((f) => f.key === value) ? (value as CompanyFilter) : undefined;
}

function parseSort(value: string | undefined): SortKey {
  return value === "applied" || value === "apps" || value === "people" ? value : "name";
}

function buildHref(query: { q?: string; f?: string; sort?: string; dir?: string }) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.f) params.set("f", query.f);
  if (query.sort) params.set("sort", query.sort);
  if (query.dir) params.set("dir", query.dir);
  const string = params.toString();
  return string ? `/crm/companies?${string}` : "/crm/companies";
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);
  const search = one("q")?.trim() ?? "";
  const filter = parseFilter(one("f"));
  const sort = parseSort(one("sort"));
  // Name reads forwards; every other column is "most first" until flipped.
  const desc = one("dir") ? one("dir") === "desc" : sort !== "name";

  const [companies, { companyLogos }] = await Promise.all([
    listCompanies(user.id, { search: search || undefined, filter }),
    getSettings(),
  ]);

  const sorted = [...companies].sort((a, b) => {
    let order = 0;
    if (sort === "name") order = a.name.localeCompare(b.name);
    if (sort === "apps") order = a._count.applications - b._count.applications;
    if (sort === "people") order = a._count.contacts - b._count.contacts;
    if (sort === "applied") {
      // Companies never applied to sort together at the end, whatever the
      // direction — "sort by last applied" is a question about the others.
      if (!a.lastAppliedAt && !b.lastAppliedAt) return a.name.localeCompare(b.name);
      if (!a.lastAppliedAt) return 1;
      if (!b.lastAppliedAt) return -1;
      order = a.lastAppliedAt.getTime() - b.lastAppliedAt.getTime();
    }
    return (desc ? -order : order) || a.name.localeCompare(b.name);
  });

  const header = (key: SortKey, label: string, className: string) => {
    const active = sort === key;
    const nextDir = active ? (desc ? "asc" : "desc") : key === "name" ? "asc" : "desc";
    return (
      <Link
        href={buildHref({ q: search, f: filter, sort: key, dir: nextDir })}
        className={cn(
          "hover:text-foreground flex items-center gap-1 transition-colors",
          className,
          active && "text-foreground",
        )}
      >
        {label}
        {active && (desc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
      </Link>
    );
  };

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
          {sorted.length} {sorted.length === 1 ? "company" : "companies"}
        </span>
      </div>

      <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <Link
              key={label}
              // Chips change the cut, never the ordering — carry sort and dir
              // through exactly as they stand in the URL.
              href={buildHref({ q: search, f: key, sort: one("sort"), dir: one("dir") })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "touch-target flex h-11 shrink-0 items-center rounded-chip px-2 text-[12.5px] transition-colors duration-150 md:h-7",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title={search || filter ? "Nothing matches that" : "No companies yet"}
          description={
            search || filter
              ? "Loosen the search or the filter to see everything again."
              : "Track a job and its company appears here, or add one now to keep research somewhere before you apply."
          }
          action={search || filter ? undefined : <NewCompanyDialog />}
        />
      ) : (
        <div className="bg-card shadow-card overflow-hidden rounded-xl">
          <div className="eyebrow bg-inset flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">{header("name", "Company", "")}</div>
            <div className="hidden w-36 shrink-0 md:block">Industry</div>
            <div className="hidden w-36 shrink-0 xl:block">Location</div>
            <div className="hidden w-24 shrink-0 sm:block">
              {header("applied", "Last applied", "justify-end")}
            </div>
            <div className="w-24 shrink-0">{header("apps", "Applied", "justify-end")}</div>
            <div className="w-16 shrink-0">{header("people", "People", "justify-end")}</div>
          </div>

          <ul className="divide-y">
            {sorted.map((company) => (
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
                  <div className="text-muted-foreground hidden w-36 shrink-0 truncate text-[12px] md:block">
                    {company.industry || "—"}
                  </div>
                  <div className="text-faint hidden w-36 shrink-0 truncate text-[12px] xl:block">
                    {company.location || "—"}
                  </div>
                  <div className="nums text-muted-foreground hidden w-24 shrink-0 text-right text-[12px] sm:block">
                    {company.lastAppliedAt ? agoDay(company.lastAppliedAt) : "never"}
                  </div>
                  <div className="nums text-muted-foreground w-24 shrink-0 text-right text-[12px]">
                    {company._count.applications || "—"}
                    {company.openApplications > 0 && (
                      <span className="text-faint"> · {company.openApplications} open</span>
                    )}
                  </div>
                  <div className="nums text-faint w-16 shrink-0 text-right text-[12px]">
                    {company._count.contacts || "—"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sorted.some((company) => !company.website) && (
        <p className="text-faint mt-3 flex items-center gap-1.5 text-[12px]">
          <ExternalLinkIcon className="size-3" />
          Companies without a website fall back to their initials. Open one to add it.
        </p>
      )}
    </PageShell>
  );
}
