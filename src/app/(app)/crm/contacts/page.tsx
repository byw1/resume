import Link from "next/link";
import {
  GithubIcon,
  GlobeIcon,
  InstagramIcon,
  LinkIcon,
  LinkedinIcon,
  MailIcon,
  TwitterIcon,
  UsersIcon,
} from "lucide-react";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CrmTabs } from "@/components/crm/tabs";
import { SearchBox } from "@/components/crm/search-box";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { CompanyChip } from "@/components/crm/company-chip";
import { listContacts, type ContactFilter } from "@/lib/data/pipeline";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import {
  NAMED_PLATFORMS,
  PLATFORM_LABEL,
  detectPlatform,
  linkHref,
  type PlatformKey,
} from "@/lib/social";
import { agoDay, cn, relativeDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PLATFORM_ICON: Record<PlatformKey, typeof LinkIcon> = {
  linkedin: LinkedinIcon,
  twitter: TwitterIcon,
  instagram: InstagramIcon,
  github: GithubIcon,
  website: GlobeIcon,
  other: LinkIcon,
};

/**
 * The one link worth a button in a table row.
 *
 * LinkedIn first because it usually is the answer, then whatever else they
 * have — a row that shows nothing for the founder who only posts on X is the
 * bug this replaces.
 */
function bestLink(contact: {
  linkedin: string;
  twitter: string;
  instagram: string;
  github: string;
  website: string;
  otherLinks: string[];
}) {
  for (const platform of NAMED_PLATFORMS) {
    const href = linkHref(contact[platform]);
    if (href) return { href, platform, Icon: PLATFORM_ICON[platform] };
  }
  for (const value of contact.otherLinks) {
    const href = linkHref(value);
    if (href) {
      const platform = detectPlatform(value) ?? "other";
      return { href, platform, Icon: PLATFORM_ICON[platform] };
    }
  }
  return null;
}

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
              // Not everyone is on LinkedIn. Show whichever address they
              // actually have, with that platform's own icon.
              const best = bestLink(contact);
              return (
                <li
                  key={contact.id}
                  className="hover:bg-accent/50 relative flex items-center transition-colors duration-150"
                >
                  {/* One link, stretched over the row by a ::before overlay,
                      rather than an anchor wrapping the lot. The company is
                      its own destination and an anchor inside an anchor is
                      invalid HTML — but a second anchor to the contact would
                      make every row two tab stops reading the same name. The
                      overlay keeps the whole row clickable; the chip and the
                      buttons are positioned, so they paint above it and stay
                      clickable in their own right. */}
                  <Link
                    href={`/crm/contacts/${contact.id}`}
                    data-nav-item
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-4 before:absolute before:inset-0"
                  >
                    <CompanyAvatar name={contact.name} domain={null} size={26} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{contact.name}</div>
                      <div className="text-faint truncate text-[12px]">
                        {contact.title || "No title on file"}
                      </div>
                    </div>
                  </Link>

                  {/* The first company they represent, plus a count of the
                      rest. A row cannot hold four chips without becoming a
                      paragraph, and the contact's own page has them all. */}
                  <div className="relative hidden w-44 shrink-0 items-center gap-1.5 px-3 md:flex">
                    {contact.companies.length > 0 ? (
                      <>
                        <CompanyChip
                          company={contact.companies[0]}
                          logos={companyLogos}
                          size="sm"
                          className="min-w-0"
                        />
                        {contact.companies.length > 1 && (
                          <span
                            className="text-faint shrink-0 text-[11.5px]"
                            title={contact.companies.map((company) => company.name).join(", ")}
                          >
                            +{contact.companies.length - 1}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-faint text-[12px]">—</span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 py-2.5">
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
                  </div>

                  {/* Above the overlay — a nested anchor is invalid HTML and
                      would make the whole row navigate on a missed click. */}
                  <div className="relative hidden w-[60px] shrink-0 items-center justify-end gap-0.5 pr-3 pl-3 sm:flex">
                    {contact.email && (
                      <Button asChild variant="ghost" size="icon-sm" className="text-faint hover:text-foreground">
                        <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}>
                          <MailIcon />
                        </a>
                      </Button>
                    )}
                    {best && (
                      <Button asChild variant="ghost" size="icon-sm" className="text-faint hover:text-foreground">
                        <a
                          href={best.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`Open ${contact.name} on ${PLATFORM_LABEL[best.platform]}`}
                        >
                          <best.Icon />
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
