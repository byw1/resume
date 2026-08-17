"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PinIcon, PlusIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { SaveIndicator } from "@/components/save-indicator";
import { useAutosave } from "@/hooks/use-autosave";
import { cn } from "@/lib/utils";
import {
  createNoteAction,
  deleteNoteAction,
  updateNoteAction,
} from "@/server/actions";
import { StickyNoteIcon } from "lucide-react";

type Note = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  kind: "NOTE" | "GUARDRAIL";
};

export function NotesPanel({ notes }: { notes: Note[] }) {
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const add = () => {
    startTransition(async () => {
      await createNoteAction({ title: "Untitled note" });
      toast.success("Note added");
    });
  };

  const visible = notes.filter((note) => !removed.has(note.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Anything that isn&apos;t tied to one job: STAR stories, interview answers, references,
          salary history, the thing you always forget to mention.
        </p>
        <Button variant="outline" size="sm" onClick={add} disabled={pending}>
          <PlusIcon /> New note
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={StickyNoteIcon}
          title="No notes yet"
          description="Notes are free-form. Claude searches them alongside your roles when it writes."
          action={
            <Button variant="gradient" onClick={add} disabled={pending}>
              <PlusIcon /> New note
            </Button>
          }
        />
      ) : (
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
          <AnimatePresence initial={false}>
            {visible.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onRemoved={() => setRemoved((prev) => new Set(prev).add(note.id))}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onRemoved }: { note: Note; onRemoved: () => void }) {
  const [values, setValues] = useState({
    title: note.title,
    body: note.body,
    pinned: note.pinned,
    kind: note.kind,
  });
  const { state, push } = useAutosave<typeof values>((next) => updateNoteAction(note.id, next));
  const isRule = values.kind === "GUARDRAIL";

  const set = (patch: Partial<typeof values>) => {
    const next = { ...values, ...patch };
    setValues(next);
    push(next);
  };

  return (
    <motion.div layout exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }}>
      <Card className={cn("group", isRule && "border-primary/40")}>
        <CardContent className="space-y-2 pt-5">
          {isRule && (
            <div className="text-primary flex items-center gap-1.5 text-[11px] font-medium">
              <ShieldIcon className="size-3" />
              Sent to every AI on connect
            </div>
          )}
          <div className="flex items-start gap-1">
            <Input
              value={values.title}
              onChange={(event) => set({ title: event.target.value })}
              className="h-auto border-0 bg-transparent px-0 py-0 text-[15px] font-semibold shadow-none focus-visible:ring-0"
              placeholder="Note title"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                isRule && "text-primary opacity-100",
              )}
              onClick={() => set({ kind: isRule ? "NOTE" : "GUARDRAIL" })}
              title={
                isRule
                  ? "A standing rule. Every AI client is given this before it does anything."
                  : "Make this a standing rule, given to every AI client on connect"
              }
              aria-label={isRule ? "Stop sending this as a standing rule" : "Make this a standing rule"}
            >
              <ShieldIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                values.pinned && "text-primary opacity-100",
              )}
              onClick={() => set({ pinned: !values.pinned })}
              aria-label="Pin note"
            >
              <PinIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => {
                onRemoved();
                void deleteNoteAction(note.id);
              }}
              aria-label="Delete note"
            >
              <Trash2Icon />
            </Button>
          </div>

          <Textarea
            value={values.body}
            onChange={(event) => set({ body: event.target.value })}
            placeholder="Write anything…"
            className="min-h-24 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />

          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {note.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
            <SaveIndicator state={state} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
