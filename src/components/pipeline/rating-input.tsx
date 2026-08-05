"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function RatingInput({
  value,
  onChange,
  max = 5,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: max }, (_, index) => index + 1).map((level) => (
        <motion.button
          key={level}
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(level)}
          aria-label={`${level} of ${max}`}
          className={cn(
            "h-2 flex-1 rounded-full transition-colors",
            level <= value ? "bg-primary" : "bg-muted hover:bg-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}
