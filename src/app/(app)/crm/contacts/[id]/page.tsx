import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { ContactDetail } from "@/components/crm/contact-detail";
import { getContact } from "@/lib/data/pipeline";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const contact = await getContact(user.id, id);
  if (!contact) notFound();

  return (
    <PageShell>
      <FadeIn>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 mb-3">
          <Link href="/crm/contacts">
            <ArrowLeftIcon /> Contacts
          </Link>
        </Button>

        <ContactDetail
          contact={{
            id: contact.id,
            name: contact.name,
            title: contact.title,
            email: contact.email,
            phone: contact.phone,
            linkedin: contact.linkedin,
            relationship: contact.relationship,
            notes: contact.notes,
            company: contact.company?.name ?? "",
            nextFollowUpAt: contact.nextFollowUpAt
              ? contact.nextFollowUpAt.toISOString().slice(0, 10)
              : "",
          }}
          touches={contact.activities.map((activity) => ({
            id: activity.id,
            type: activity.type,
            body: activity.body,
            occurredAt: activity.occurredAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          }))}
          companyId={contact.companyId}
          application={
            contact.application
              ? { id: contact.application.id, roleTitle: contact.application.roleTitle }
              : null
          }
        />
      </FadeIn>
    </PageShell>
  );
}
