import Link from "next/link";
import { LinkedinIcon, MailIcon, UsersIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CrmTabs } from "@/components/crm/tabs";
import { SearchBox } from "@/components/crm/search-box";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { listContacts, type ContactFilter } from "@/lib/data/pipeline";
import { requireUser } from "@/lib/auth";
import { companyDomain } from "@/lib/company";
import { getSettings } from "@/lib/settings";
import { agoDay, cn, relativeDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Same rule as everywhere else: the URL is the state of this screen. */
const FILTERS: { key: ContactFilter | undefined; label: string }[] = [
  { key: undefined, label: "Everyone" },
  { key: "ping-due", label: "Ping due" },
  { key: "with-application", label: "On an application" },
  { key: "no-company", label: "No company" },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const search = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const rawFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filter = FILTERS.some((f) => f.key === rawFilter)
    ? (rawFilter as ContactFilter)
    : undefined;
  const [contacts, { companyLogos }] = await Promise.all([
    listContacts(user.id, { search: search || undefined, filter }),
    getSettings(),
  ]);
  const today = new Date();

  return (
    <PageShell>
      <PageHeader
        eyebrow="CRM"
        title="Contacts"
        description="Recruiters, hiring managers, referrals and the friend who might put in a word. Add people from an application, or straight from a company."
        actions={<CrmTabs current="contacts" />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox placeholder="Search people…" className="w-full sm:w-72" />
        <span className="text-faint nums ml-auto text-[12px]">
          {contacts.length} {contacts.length === 1 ? "person" : "people"}
        </span>
      </div>

      <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const query = new URLSearchParams();
          if (search) query.set("q", search);
          if (key) query.set("f", key);
          const string = query.toString();
          return (
            <Link
              key={label}
              href={string ? `/crm/contacts?${string}` : "/crm/contacts"}
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

      {contacts.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={search || filter ? "Nobody matches that" : "No contacts yet"}
          description={
            search || filter
              ? "Loosen the search or the filter to see everyone again."
              : "Open an application and add the recruiter or hiring manager you are talking to, and they will show up here."
          }
        />
      ) : (
        <div className="bg-card shadow-card overflow-hidden rounded-xl">
          <div className="eyebrow bg-inset flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">Name</div>
            <div className="hidden w-44 shrink-0 md:block">Company</div>
            <div className="hidden w-32 shrink-0 lg:block">Relationship</div>
            <div className="hidden w-24 shrink-0 text-right sm:block">Next ping</div>
            <div className="w-24 shrink-0 text-right">Last touch</div>
            <div className="hidden w-[60px] shrink-0 sm:block" aria-hidden="true" />
          </div>

          <ul className="divide-y">
            {contacts.map((contact) => {
              const pingDue =
                contact.nextFollowUpAt !== null && contact.nextFollowUpAt <= today;
              return (
                <li key={contact.id} className="flex items-center">
                  <Link
                    href={`/crm/contacts/${contact.id}`}
                    className="hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors duration-150"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <CompanyAvatar name={contact.name} domain={null} size={26} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{contact.name}</div>
                        <div className="text-faint truncate text-[12px]">
                          {contact.title || "No title on file"}
                        </div>
                      </div>
                    </div>

                    <div className="hidden w-44 shrink-0 items-center gap-2 md:flex">
                      {contact.company ? (
                        <>
                          <CompanyAvatar
                            name={contact.company.name}
                            domain={
                              companyLogos
                                ? companyDomain({
                                    name: contact.company.name,
                                    website: contact.company.website,
                                  })
                                : null
                            }
                            size={18}
                          />
                          <span className="text-muted-foreground truncate text-[12px]">
                            {contact.company.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-faint text-[12px]">—</span>
                      )}
                    </div>

                    <div className="text-faint hidden w-32 shrink-0 truncate text-[12px] lg:block">
                      {contact.relationship || "—"}
                    </div>
                    <div
                      className={cn(
                        "nums hidden w-24 shrink-0 text-right text-[12px] sm:block",
                        pingDue ? "text-destructive font-medium" : "text-faint",
                      )}
                    >
                      {contact.nextFollowUpAt ? relativeDay(contact.nextFollowUpAt) : "—"}
                    </div>
                    <div className="nums text-faint w-24 shrink-0 text-right text-[12px]">
                      {contact.activities[0] ? agoDay(contact.activities[0].occurredAt) : "never"}
                    </div>
                  </Link>

                  {/* Outside the row link — a nested anchor is invalid HTML and
                      would make the whole row navigate on a missed click. */}
                  <div className="hidden w-[60px] shrink-0 items-center justify-end gap-0.5 pr-3 sm:flex">
                    {contact.email && (
                      <Button asChild variant="ghost" size="icon-sm" className="text-faint hover:text-foreground">
                        <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}>
                          <MailIcon />
                        </a>
                      </Button>
                    )}
                    {contact.linkedin && (
                      <Button asChild variant="ghost" size="icon-sm" className="text-faint hover:text-foreground">
                        <a
                          href={
                            contact.linkedin.startsWith("http")
                              ? contact.linkedin
                              : `https://${contact.linkedin}`
                          }
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Open ${contact.name} on LinkedIn`}
                        >
                          <LinkedinIcon />
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PageShell>
  );
}
