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
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && (
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-[13px] leading-relaxed">
          {description}
        </p>
      )}
    </div>
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
