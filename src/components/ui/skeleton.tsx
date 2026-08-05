import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("bg-muted/70 animate-pulse rounded-lg", className)}
      {...props}
    />
  );
}

export { Skeleton };
