import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-inset shadow-field flex min-h-20 w-full rounded-control border px-3 py-2 text-sm transition-[color,box-shadow,border-color] duration-150 outline-none",
        "placeholder:text-faint field-sizing-content",
        "focus-visible:border-ring focus-visible:ring-ring/25 focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
