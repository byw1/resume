"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createTaskAction, toggleTaskAction } from "@/server/actions";

type Task = { id: string; title: string; due: string; overdue: boolean; context: string };

export function TaskList({ tasks }: { tasks: Task[] }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");

  const complete = (id: string) => {
    setDone((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await toggleTaskAction(id, true);
      toast.success("Task done");
    });
  };

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    startTransition(async () => {
      await createTaskAction({ title });
      toast.success("Task added");
    });
  };

  const visible = tasks.filter((task) => !done.has(task.id));

  return (
    <div className="space-y-3">
      <div className="relative">
        <PlusIcon className="text-faint pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          onBlur={add}
          placeholder="Add a task…"
          className="h-8 pl-8 text-[13px]"
          disabled={pending}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-faint py-6 text-center text-[13px]">All clear.</p>
      ) : (
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {visible.map((task) => (
              <motion.li
                key={task.id}
                layout
                exit={{ opacity: 0, x: 18, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="group hover:bg-accent/50 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors"
              >
                <Checkbox
                  className="mt-0.5"
                  onCheckedChange={() => complete(task.id)}
                  aria-label={`Complete ${task.title}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug">{task.title}</div>
                  {(task.context || task.due) && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                      {task.context && (
                        <span className="text-faint">{task.context}</span>
                      )}
                      {task.due && (
                        <span
                          className={cn(
                            task.overdue ? "text-destructive font-medium" : "text-faint",
                          )}
                        >
                          {task.due}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
