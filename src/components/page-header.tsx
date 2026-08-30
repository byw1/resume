import { cn } from "@/lib/utils";

export function PageShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-[86rem] px-4 py-6 md:px-8", className)} {...props} />
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {/* The eyebrow labels the section; it is not a place for accent colour. */}
      {eyebrow && (
        <div className="text-faint mb-1.5 text-[11px] font-medium tracking-[0.08em] uppercase">
          {eyebrow}
        </div>
      )}
      {/* Actions sit on the title's baseline, not the whole block's. Aligning
          them to the bottom of a two-line description is what left the buttons
          floating in the middle of empty space. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-[21px] leading-[1.2] font-semibold md:text-[24px]">{title}</h1>
        {/* shrink-0 only once there is room to shrink into. On a 360px screen a
            tab group plus a button is wider than the line, and refusing to
            shrink pushed the page sideways instead of wrapping. */}
        {actions && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:shrink-0">{actions}</div>
        )}
      </div>
      {description && (
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-[13px] leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * A heading inside a tab, for a screen that holds several related lists rather
 * than one. Admin uses it because "people" is really three lists — the roster,
 * who has been invited, who has asked — and they were three tabs telling you to
 * go looking for the one you wanted.
 */
export function Section({
  title,
  count,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  count?: number;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] leading-none font-semibold">
          {title}
          {count !== undefined && (
            <span className="text-muted-foreground ml-2 text-[13px] font-normal tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {actions}
      </div>
      {description && (
        <p className="text-muted-foreground mb-3 max-w-2xl text-[13px] leading-relaxed">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

/** A list that is empty, inside a Section. The dashed box of EmptyState is a
 *  whole screen's worth of nothing; a section only needs a line. */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-[13px]">
      {children}
    </p>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="bg-inset text-faint mb-3 flex size-10 items-center justify-center rounded-full">
        <Icon className="size-[18px]" />
      </div>
      <h3 className="text-[14px] font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-[13px]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
