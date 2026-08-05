import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { PageShell } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { getRole } from "@/lib/data/brain";
import { RoleEditor } from "@/components/brain/role-editor";

export const dynamic = "force-dynamic";

export default async function RolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const role = await getRole(roleId);
  if (!role) notFound();

  return (
    <PageShell>
      <FadeIn>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2 mb-4">
          <Link href="/brain">
            <ArrowLeftIcon /> Brain
          </Link>
        </Button>

        <RoleEditor
          role={{
            id: role.id,
            company: role.company,
            title: role.title,
            employmentType: role.employmentType,
            location: role.location,
            startDate: role.startDate,
            endDate: role.endDate,
            isCurrent: role.isCurrent,
            summary: role.summary,
            brainDump: role.brainDump,
            tags: role.tags,
          }}
          highlights={role.highlights.map((h) => ({
            id: h.id,
            text: h.text,
            impact: h.impact,
            strength: h.strength,
            tags: h.tags,
          }))}
        />
      </FadeIn>
    </PageShell>
  );
}
