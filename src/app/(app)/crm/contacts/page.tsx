import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { CrmTabs } from "@/components/crm/tabs";
import { SearchBox } from "@/components/crm/search-box";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { listContacts } from "@/lib/data/pipeline";
import { requireUser } from "@/lib/auth";
import { companyDomain } from "@/lib/company";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const search = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const [contacts, { companyLogos }] = await Promise.all([
    listContacts(user.id, { search: search || undefined }),
    getSettings(),
  ]);

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

      {contacts.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={search ? "Nobody matches that" : "No contacts yet"}
          description={
            search
              ? "Try a shorter search, or clear it to see everyone."
              : "Open an application and add the recruiter or hiring manager you are talking to, and they will show up here."
          }
        />
      ) : (
        <div className="bg-card shadow-card overflow-hidden rounded-xl">
          <div className="eyebrow bg-inset flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">Name</div>
            <div className="hidden w-44 shrink-0 md:block">Company</div>
            <div className="hidden w-32 shrink-0 lg:block">Relationship</div>
            <div className="hidden w-56 shrink-0 xl:block">Email</div>
            <div className="w-24 shrink-0 text-right">Last touch</div>
          </div>

          <ul className="divide-y">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <Link
                  href={`/crm/contacts/${contact.id}`}
                  className="hover:bg-accent/50 flex items-center gap-3 px-4 py-2.5 transition-colors duration-150"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <CompanyAvatar
                      name={contact.name}
                      domain={null}
                      size={26}
                    />
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
                  <div className="text-faint hidden w-56 shrink-0 truncate text-[12px] xl:block">
                    {contact.email || "—"}
                  </div>
                  <div className="nums text-faint w-24 shrink-0 text-right text-[12px]">
                    {contact.activities[0]
                      ? contact.activities[0].occurredAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "never"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageShell>
  );
}
