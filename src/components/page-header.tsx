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
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-primary mb-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-gradient text-[27px] leading-tight font-semibold tracking-tight md:text-[32px]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm">{description}</p>
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
        "flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <div className="bg-muted/60 text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-xl">
        <Icon className="size-5" />
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
