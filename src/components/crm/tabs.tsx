import Link from "next/link";
import { Building2Icon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The CRM's two halves. Horizontal because that is where a switch between
 * peers belongs — down the side is for navigating into something, across the
 * top is for choosing which of two equivalent things you are looking at.
 */
const TABS = [
  { href: "/crm/companies", label: "Companies", icon: Building2Icon },
  { href: "/crm/contacts", label: "Contacts", icon: UsersIcon },
];

export function CrmTabs({ current }: { current: "companies" | "contacts" }) {
  return (
    <div className="bg-inset shadow-field inline-flex items-center gap-0.5 rounded-control p-0.5">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href.endsWith(current);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "touch-target flex h-11 items-center gap-1.5 rounded-chip px-2.5 text-[12.5px] font-medium transition-colors duration-150 md:h-7",
              active
                ? "bg-card text-foreground shadow-btn"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
