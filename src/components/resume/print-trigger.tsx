"use client";

import { useEffect } from "react";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintTrigger({ fileName }: { fileName: string }) {
  // The browser names the PDF after the document title.
  useEffect(() => {
    const previous = document.title;
    document.title = fileName || "Resume";
    return () => {
      document.title = previous;
    };
  }, [fileName]);

  return (
    <div className="no-print mx-auto mb-6 flex w-fit items-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 shadow-sm">
      <p className="text-sm text-neutral-600">
        Print → <strong className="font-medium text-neutral-900">Save as PDF</strong>. Set margins to
        None.
      </p>
      <Button size="sm" onClick={() => window.print()}>
        <PrinterIcon /> Print
      </Button>
    </div>
  );
}
