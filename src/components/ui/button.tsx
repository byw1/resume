import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * One filled button, and it is the accent one. Everything else is a surface or
 * a bare label, so a screen can only ever have one obvious next action — which
 * is the point of having a primary button at all.
 *
 * Press feedback is a fast opacity shift rather than a scale bounce: at this
 * size a transform reads as a wobble, and it fights the pointer.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-[background-color,border-color,color,opacity] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 active:opacity-80 select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border bg-card hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3.5 has-[>svg]:px-3",
        sm: "h-7 gap-1.5 px-2.5 text-[12.5px] has-[>svg]:px-2",
        xs: "h-6 gap-1 px-2 text-[12px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 rounded-lg px-5 text-[14px] has-[>svg]:px-4",
        icon: "size-8",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
