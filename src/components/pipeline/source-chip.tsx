import { sourceTone } from "@/lib/data/pipeline";
import { cn } from "@/lib/utils";

export type SourceValue = { id: string; name: string; color: string };

/**
 * A source category, wearing its colour as a dot.
 *
 * Not `.stage-chip`: ten stages already own colour-as-progress in this product,
 * and a user-chosen violet source sitting beside a violet SCREEN chip would
 * read as a stage. Keeping the FORM different — a mark on a neutral chip rather
 * than ink on a wash — means no colour a person picks can be misread.
 */
export function SourceChip({
  source,
  className,
}: {
  source: SourceValue;
  className?: string;
}) {
  return (
    <span
      className={cn("tag-chip rounded-chip px-1.5 py-0.5 text-[11.5px] font-medium", className)}
      style={{ ["--tone" as string]: sourceTone(source.color) }}
    >
      {source.name}
    </span>
  );
}
