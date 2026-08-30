import Link from "next/link";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { companyDomain } from "@/lib/company";
import { cn } from "@/lib/utils";

/**
 * A company, as something you can click.
 *
 * The company's name used to be plain text next to a monogram, which said
 * nothing about there being a page behind it — so the research, the people and
 * the other roles at that employer went unvisited. A chip reads as a control:
 * bordered, hovering, with the employer's own favicon on it.
 *
 * The favicon needs the company's `website`, which is why callers pass the
 * whole record rather than a name. `logos` is the instance setting; with it off
 * every chip falls back to a monogram and nothing is fetched from a third
 * party.
 */
export function CompanyChip({
  company,
  logos,
  size = "md",
  className,
}: {
  company: { id: string; name: string; website?: string | null };
  logos: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const domain = logos ? companyDomain({ name: company.name, website: company.website }) : null;
  const small = size === "sm";

  return (
    <Link
      href={`/crm/companies/${company.id}`}
      title={`Open ${company.name}`}
      className={cn(
        "bg-card hover:bg-accent inline-flex max-w-full items-center gap-1.5 rounded-chip border transition-colors duration-150",
        small ? "py-0.5 pr-2 pl-0.5 text-[12px]" : "py-1 pr-2.5 pl-1 text-[13px]",
        className,
      )}
    >
      <CompanyAvatar name={company.name} domain={domain} size={small ? 16 : 20} />
      <span className="truncate font-medium">{company.name}</span>
    </Link>
  );
}
