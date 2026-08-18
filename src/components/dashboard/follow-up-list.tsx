"use client";

import Link from "next/link";
import { useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClockIcon, ClockIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STAGE_LABEL } from "@/lib/data/pipeline";
import type { Stage } from "@prisma/client";
import { snoozeFollowUpAction } from "@/server/actions";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  company: string;
  roleTitle: string;
  stage: Stage;
  due: string;
  overdue: boolean;
};

export function FollowUpList({ items }: { items: Item[] }) {
  const [pending, startTransition] = useTransition();

  const snooze = (id: string, days: number) => {
    startTransition(async () => {
      await snoozeFollowUpAction(id, days);
      toast.success(days === 1 ? "Snoozed to tomorrow" : `Snoozed ${days} days`);
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="bg-success-tint text-success mb-3 flex size-10 items-center justify-center rounded-xl">
          <AlarmClockIcon className="size-4" />
        </div>
        <p className="text-[13px] font-medium">Nothing to chase</p>
        <p className="text-muted-foreground mt-1 text-[13px]">
          Every follow-up is scheduled for later.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={item.id}
            layout
            exit={{ opacity: 0, height: 0 }}
            className="group flex flex-wrap items-center gap-3 py-2 first:pt-0"
          >
            <div
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                item.overdue ? "bg-destructive" : "bg-warning",
              )}
            />
            <Link href={`/applications/${item.id}`} className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium group-hover:underline">
                {item.company}
              </div>
              <div className="text-faint truncate text-[12px]">{item.roleTitle}</div>
            </Link>
            <Badge variant="outline" className="text-[10px]">
              {STAGE_LABEL[item.stage]}
            </Badge>
            <span
              className={cn(
                "nums w-20 text-right text-[12px]",
                item.overdue ? "text-destructive font-medium" : "text-muted-foreground",
              )}
            >
              {item.due}
            </span>
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                onClick={() => snooze(item.id, 3)}
                title="Snooze 3 days"
              >
                <ClockIcon /> 3d
              </Button>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
