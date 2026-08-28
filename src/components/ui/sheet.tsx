"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A panel that slides in from the edge.
 *
 * Radix's Dialog underneath, so focus trapping, Escape, scroll locking and the
 * accessibility tree all come for free — a hand-rolled drawer gets those wrong
 * in ways nobody notices until someone uses a keyboard.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

function SheetContent({
  className,
  children,
  showClose = true,
  side = "right",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean;
  /** Which edge it comes from. Left is the mobile navigation drawer. */
  side?: "left" | "right";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        )}
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-background shadow-overlay fixed inset-y-0 z-50 flex w-full flex-col overflow-y-auto",
          "duration-250 data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "right"
            ? "right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-[46rem]"
            : "left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left max-w-[19rem]",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="ring-offset-background focus:ring-ring absolute top-4 right-4 z-10 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 focus:ring-2 focus:outline-none">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
