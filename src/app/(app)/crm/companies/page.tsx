import Link from "next/link";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CrmTabs } from "@/components/crm/tabs";
import { SearchBox } from "@/components/crm/search-box";
import { NewCompanyDialog } from "@/components/crm/new-company-dialog";
import { CompanyFilterMenu, type CompanyFacets } from "@/components/crm/filter-menu";
import { CompaniesList, type CompanyRow } from "@/components/crm/companies-list";
import { SortHeader } from "@/components/crm/sort-header";
import { ArchiveNote } from "@/components/archive/archive-note";
import { listCompanies } from "@/lib/data/pipeline";
import { archiveCounts } from "@/lib/data/archive";
import { listTags, tagsOfKind } from "@/lib/data/tags";
import { requireUser } from "@/lib/auth";
import { companyDomain } from "@/lib/company";
import { getSettings } from "@/lib/settings";
import { agoDay, cn } from "@/lib/utils";
import {
  COMPANY_MISSING,
  EMPTY_COMPANY_FILTERS,
  buildCompanyQuery,
  companyDesc,
  hasAnyCompanyFilter,
  matchesCompany,
  parseCompanyFilters,
  parseCompanySort,
  sortCompanies,
  type CompanyCut,
  type CompanyFilters,
  type CompanySort,
} from "@/lib/crm-filters";

export const dynamic = "force-dynamic";

/**
 * The cuts and orderings live in the URL — same rule as the pipeline: the
 * address is the state, and a view you can paste to yourself beats one you
 * have to rebuild by clicking.
 */
const CUTS: { key: CompanyCut | null; label: string }[] = [
  { key: null, label: "Everything" },
  { key: "active", label: "Active pipeline" },
  { key: "applied", label: "Applied" },
  { key: "never-applied", label: "Never applied" },
  { key: "with-contacts", label: "Know someone" },
];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const one = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);

  const filters = parseCompanyFilters(one);
  const sort = parseCompanySort(one("sort"));
  const desc = companyDesc(sort, one("dir"));

  // Everything, once. The counts below are "how many would survive if I
  // relaxed this one dimension", which only has an answer while you are
  // holding the unfiltered set.
  const [everyCompany, tagOptions, bin, { companyLogos }] = await Promise.all([
    listCompanies(user.id),
    listTags(user.id),
    archiveCounts(user.id),
    getSettings(),
  ]);

  const passing = (except: keyof CompanyFilters) =>
    everyCompany.filter((row) =>
      matchesCompany(row, { ...filters, [except]: EMPTY_COMPANY_FILTERS[except] }),
    );

  const tally = (rows: typeof everyCompany) => {
    const out = new Map<string, number>();
    for (const row of rows) for (const tag of row.tags) out.set(tag.id, (out.get(tag.id) ?? 0) + 1);
    return out;
  };

  const facetFor = (
    kind: "INDUSTRY" | "SIZE" | "LOCATION" | "COMPANY",
    except: keyof CompanyFilters,
    on: string[],
  ) => {
    const counts = tally(passing(except));
    return tagsOfKind(tagOptions, kind)
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        count: counts.get(tag.id) ?? 0,
      }))
      .filter((tag) => tag.count > 0 || on.includes(tag.id));
  };

  const facets: CompanyFacets = {
    industry: facetFor("INDUSTRY", "industries", filters.industries),
    size: facetFor("SIZE", "sizes", filters.sizes),
    location: facetFor("LOCATION", "locations", filters.locations),
    tags: facetFor("COMPANY", "tags", filters.tags),
    // Missing ANDs with itself, so each row counts what ADDING it would leave.
    missing: Object.fromEntries(
      COMPANY_MISSING.map((gap) => [
        gap,
        everyCompany.filter((row) =>
          matchesCompany(row, { ...filters, missing: [...new Set([...filters.missing, gap])] }),
        ).length,
      ]),
    ) as CompanyFacets["missing"],
  };

  const visible = sortCompanies(
    everyCompany.filter((company) => matchesCompany(company, filters)),
    sort,
    desc,
  );

  const cutHref = (cut: CompanyCut | null) =>
    buildCompanyQuery({ filters: { ...filters, cut }, sort, dir: one("dir") });

  const sortHref = (key: CompanySort) =>
    buildCompanyQuery({
      filters,
      sort: key,
      // Clicking the column you are already on flips it.
      dir: key === sort ? (desc ? "asc" : "desc") : key === "name" ? "asc" : "desc",
    });

  const exportHref = `/api/export/companies?${buildCompanyQuery({ filters, sort, dir: one("dir") }).split("?")[1] ?? ""}`;
  const narrowed = hasAnyCompanyFilter(filters);

  const rows: CompanyRow[] = visible.map((company) => ({
    id: company.id,
    name: company.name,
    website: company.website,
    domain: companyLogos ? companyDomain({ name: company.name, website: company.website }) : null,
    industry: tagsOfKind(company.tags, "INDUSTRY"),
    location: tagsOfKind(company.tags, "LOCATION"),
    lastApplied: company.lastAppliedAt ? agoDay(company.lastAppliedAt) : "never",
    applications: company._count.applications,
    openApplications: company.openApplications,
    contacts: company._count.contacts,
  }));

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
        <CompanyFilterMenu filters={filters} facets={facets} sort={sort} dir={one("dir")} />
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <a href={exportHref} download>
            <DownloadIcon /> Export
          </a>
        </Button>
        <span className="text-faint nums ml-auto text-[12px]">
          {narrowed && visible.length !== everyCompany.length
            ? `${visible.length} of ${everyCompany.length} companies`
            : `${visible.length} ${visible.length === 1 ? "company" : "companies"}`}
        </span>
      </div>

      <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
        {CUTS.map(({ key, label }) => {
          const active = filters.cut === key;
          const count = everyCompany.filter((row) =>
            matchesCompany(row, { ...filters, cut: key }),
          ).length;
          return (
            <Link
              key={label}
              href={cutHref(key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "touch-target flex h-11 shrink-0 items-center gap-1.5 rounded-chip px-2 text-[12.5px] transition-colors duration-150 md:h-7",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {label}
              {count > 0 && <span className="text-faint nums">{count}</span>}
            </Link>
          );
        })}
      </div>

      <CompaniesList
        rows={rows}
        filtered={narrowed}
        exportHref={exportHref}
        header={
          <>
            <div className="min-w-0 flex-1">
              <SortHeader
                href={sortHref("name")}
                label="Company"
                active={sort === "name"}
                desc={desc}
              />
            </div>
            <div className="hidden w-36 shrink-0 md:block">Industry</div>
            <div className="hidden w-36 shrink-0 xl:block">Location</div>
            <div className="hidden w-24 shrink-0 sm:block">
              <SortHeader
                href={sortHref("applied")}
                label="Last applied"
                active={sort === "applied"}
                desc={desc}
                className="justify-end"
              />
            </div>
            <div className="w-24 shrink-0">
              <SortHeader
                href={sortHref("apps")}
                label="Applied"
                active={sort === "apps"}
                desc={desc}
                className="justify-end"
              />
            </div>
            <div className="w-16 shrink-0">
              <SortHeader
                href={sortHref("people")}
                label="People"
                active={sort === "people"}
                desc={desc}
                className="justify-end"
              />
            </div>
          </>
        }
      />

      <ArchiveNote kind="company" count={bin.company} />

      {visible.some((company) => !company.website) && (
        <p className="text-faint mt-3 flex items-center gap-1.5 text-[12px]">
          <ExternalLinkIcon className="size-3" />
          Companies without a website fall back to their initials. Open one to add it.
        </p>
      )}
    </PageShell>
  );
}
