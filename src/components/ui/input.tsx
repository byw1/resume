import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // A field is a well, not a raised object: it gets an inset shadow so
        // the eye reads it as somewhere to put something.
        "border-input bg-inset shadow-field flex h-9 w-full min-w-0 rounded-control border px-3 py-1 text-sm transition-[color,box-shadow,border-color] duration-150 outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "placeholder:text-faint",
        "focus-visible:border-ring focus-visible:ring-ring/25 focus-visible:ring-2",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:ring-destructive/25 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
