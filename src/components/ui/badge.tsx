import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status chips are a tint behind the hue's own text. The tints are tokens
 * rather than an alpha at the call site, because the correct wash differs by
 * theme: pale colour on white, low-alpha hue on dark. One token, both right.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-chip border px-1.5 py-0.5 text-[11.5px] font-medium w-fit whitespace-nowrap shrink-0 gap-1 transition-colors duration-150 [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-muted text-muted-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-muted-foreground",
        accent: "border-transparent bg-primary-tint text-primary",
        success: "border-transparent bg-success-tint text-success",
        warning: "border-transparent bg-warning-tint text-warning",
        destructive: "border-transparent bg-destructive-tint text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
