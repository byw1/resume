import { cn } from "@/lib/utils";

export function PageShell({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[86rem] px-4 py-8 md:px-8", className)} {...props} />;
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {/* The eyebrow labels the section; it is not a place for accent colour. */}
        {eyebrow && (
          <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-[0.08em] uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[24px] leading-[1.15] font-semibold md:text-[28px]">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2 max-w-xl text-[13.5px] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
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
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground mb-4 flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
