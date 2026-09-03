import { FacetMenu, type FacetGroup } from "@/components/filters/facet-menu";
import { tagTone } from "@/lib/data/tags";
import { buildPipelineQuery, toggleIn, type PipelineFilters } from "@/lib/pipeline-filters";

export type FilterFacets = {
  tags: { id: string; name: string; color: string; count: number }[];
  companies: { id: string; name: string; count: number }[];
  resumes: { id: string; name: string; count: number }[];
};

const WAITING = [7, 14, 30];
const EXCITEMENT = [4, 5];

/**
 * The pipeline's six dimensions, as rows for the shared popover.
 *
 * The popover itself lives in `src/components/filters/facet-menu.tsx`, because
 * the CRM lists need exactly the same control. What stays here is the part that
 * is only true of the pipeline: which dimensions there are, what each row says,
 * and the URL each one produces.
 *
 * This file is no longer a client component. It builds hrefs rather than
 * pushing them, so `tagTone` resolves on the server and the only interactive
 * part is the shell. Its export, its props and its path are unchanged, so
 * `toolbar.tsx` did not move.
 */
export function FilterMenu({
  filters,
  facets,
  view,
  sort,
  dir,
  limited = false,
}: {
  filters: PipelineFilters;
  facets: FilterFacets;
  view: string;
  sort?: string;
  dir?: string;
  /** The current view can only honour stages and overdue. Say so. */
  limited?: boolean;
}) {
  const href = (next: PipelineFilters) =>
    buildPipelineQuery({ view, filters: next, sort, dir });

  const active =
    filters.tags.length +
    filters.companies.length +
    filters.resumes.length +
    (filters.waiting !== null ? 1 : 0) +
    (filters.quiet !== null ? 1 : 0) +
    (filters.excitement !== null ? 1 : 0);

  const groups: FacetGroup[] = [
    {
      heading: "Tags",
      rows: facets.tags.map((tag) => ({
        id: `src-${tag.id}`,
        label: tag.name,
        count: tag.count,
        on: filters.tags.includes(tag.id),
        dot: tagTone(tag.color),
        href: href({ ...filters, tags: toggleIn(filters.tags, tag.id) }),
      })),
    },
    {
      heading: "Company",
      rows: facets.companies.map((company) => ({
        id: `co-${company.id}`,
        label: company.name,
        count: company.count,
        on: filters.companies.includes(company.id),
        href: href({ ...filters, companies: toggleIn(filters.companies, company.id) }),
      })),
    },
    {
      heading: "Resume sent",
      rows: facets.resumes.map((resume) => ({
        id: `cv-${resume.id}`,
        label: resume.name,
        count: resume.count,
        on: filters.resumes.includes(resume.id),
        href: href({ ...filters, resumes: toggleIn(filters.resumes, resume.id) }),
      })),
    },
    {
      heading: "Sitting still for",
      separated: true,
      rows: WAITING.map((days) => ({
        id: `w-${days}`,
        label: `${days} days or more`,
        on: filters.waiting === days,
        href: href({ ...filters, waiting: filters.waiting === days ? null : days }),
      })),
    },
    {
      // Sitting still is about the stage; quiet is about you. An application
      // can be three days into Screening and three weeks since anyone said
      // anything.
      heading: "Nothing logged for",
      rows: WAITING.map((days) => ({
        id: `qd-${days}`,
        label: `${days} days or more`,
        on: filters.quiet === days,
        href: href({ ...filters, quiet: filters.quiet === days ? null : days }),
      })),
    },
    {
      heading: "Want it at least",
      rows: EXCITEMENT.map((score) => ({
        id: `x-${score}`,
        label: score === 5 ? "5 — the dream" : "4 or more",
        on: filters.excitement === score,
        href: href({ ...filters, excitement: filters.excitement === score ? null : score }),
      })),
    },
  ];

  return (
    <FacetMenu
      groups={groups}
      activeCount={active}
      clearHref={href({
        ...filters,
        tags: [],
        companies: [],
        resumes: [],
        waiting: null,
        quiet: null,
        excitement: null,
      })}
      placeholder="Tag, company, resume…"
      ariaLabel="Filter the pipeline"
      note={
        limited
          ? "The calendar shows dates, so only the stage chips and Needs a nudge narrow it. These apply on the board and the table."
          : undefined
      }
    />
  );
}
