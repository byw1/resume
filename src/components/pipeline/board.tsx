"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  BuildingIcon,
  CalendarClockIcon,
  FileTextIcon,
  FlameIcon,
  MapPinIcon,
  MessageSquareIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Stage } from "@prisma/client";
import { BOARD_STAGES, STAGE_LABEL, STAGE_TONE, TERMINAL_STAGES } from "@/lib/data/pipeline";
import { Badge } from "@/components/ui/badge";
import { cn, relativeDay } from "@/lib/utils";
import { moveStageAction } from "@/server/actions";

export type Card = {
  id: string;
  company: string;
  roleTitle: string;
  stage: Stage;
  location: string;
  salaryRange: string;
  excitement: number;
  nextFollowUpAt: string | null;
  resumeName: string | null;
  activityCount: number;
};

export function PipelineBoard({ open, closed }: { open: Card[]; closed: Card[] }) {
  const [cards, setCards] = useState(open);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<Stage, Card[]>();
    for (const stage of BOARD_STAGES) map.set(stage, []);
    for (const card of cards) map.get(card.stage)?.push(card);
    return map;
  }, [cards]);

  const onDragStart = (event: DragStartEvent) => {
    setDragging(cards.find((card) => card.id === event.active.id) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const target = event.over?.id as Stage | undefined;
    const id = String(event.active.id);
    if (!target) return;
    const card = cards.find((item) => item.id === id);
    if (!card || card.stage === target) return;

    // Optimistic: the card lands where you dropped it before the server replies.
    setCards((prev) => prev.map((item) => (item.id === id ? { ...item, stage: target } : item)));
    startTransition(async () => {
      try {
        await moveStageAction(id, target);
        toast.success(`${card.company} → ${STAGE_LABEL[target]}`);
      } catch {
        setCards((prev) =>
          prev.map((item) => (item.id === id ? { ...item, stage: card.stage } : item)),
        );
        toast.error("Could not move that card.");
      }
    });
  };

  return (
    <div className="space-y-8">
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
          {BOARD_STAGES.map((stage) => (
            <Column key={stage} stage={stage} cards={byStage.get(stage) ?? []} />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
          {dragging && (
            <div className="w-[17rem] rotate-2 opacity-95">
              <ApplicationCard card={dragging} overlay />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {closed.length > 0 && (
        <section>
          <h2 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.14em] uppercase">
            Closed · {closed.length}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {closed.map((card) => (
              <Link key={card.id} href={`/applications/${card.id}`}>
                <div className="bg-card shadow-hairline hover:bg-accent/40 flex items-center gap-3 rounded-card px-3 py-2 transition-colors duration-150">
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: STAGE_TONE[card.stage] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{card.company}</div>
                    <div className="text-faint truncate text-[12px]">{card.roleTitle}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {STAGE_LABEL[card.stage]}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Column({ stage, cards }: { stage: Stage; cards: Card[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div className="flex w-[17.5rem] shrink-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="size-2 rounded-full" style={{ background: STAGE_TONE[stage] }} />
        <span className="text-[13px] font-semibold">{STAGE_LABEL[stage]}</span>
        <span className="text-faint nums text-[12px]">{cards.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "bg-canvas flex min-h-[11rem] flex-1 flex-col gap-2 rounded-xl p-2 transition-[background-color,box-shadow] duration-200 ease-[var(--ease-settle)]",
          isOver ? "bg-primary-tint shadow-[0_0_0_1px_var(--primary)]" : "shadow-hairline",
        )}
      >
        <AnimatePresence initial={false}>
          {cards.map((card) => (
            <DraggableCard key={card.id} card={card} />
          ))}
        </AnimatePresence>

        {cards.length === 0 && (
          <div className="text-faint flex flex-1 items-center justify-center text-[12px]">
            {isOver ? "Drop here" : "Empty"}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="touch-none"
    >
      <ApplicationCard card={card} />
    </motion.div>
  );
}

function ApplicationCard({ card, overlay = false }: { card: Card; overlay?: boolean }) {
  const overdue = card.nextFollowUpAt ? new Date(card.nextFollowUpAt) < new Date() : false;

  return (
    <div
      className={cn(
        "group bg-card cursor-grab rounded-card p-3 transition-shadow duration-200 ease-[var(--ease-settle)] active:cursor-grabbing",
        overlay ? "shadow-overlay" : "shadow-card hover:shadow-raised",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/applications/${card.id}`}
            onClick={(event) => event.stopPropagation()}
            className="block truncate text-[13px] font-semibold hover:underline"
          >
            {card.company}
          </Link>
          <div className="text-faint truncate text-[12px]">{card.roleTitle}</div>
        </div>
        {card.excitement >= 4 && (
          <FlameIcon className="mt-0.5 size-3 shrink-0 text-[var(--warning)]" />
        )}
      </div>

      {(card.location || card.salaryRange) && (
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          {card.location && (
            <span className="flex items-center gap-1">
              <MapPinIcon className="size-2.5" />
              {card.location}
            </span>
          )}
          {card.salaryRange && (
            <span className="flex items-center gap-1">
              <BuildingIcon className="size-2.5" />
              {card.salaryRange}
            </span>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {card.nextFollowUpAt && (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px]",
              overdue ? "text-destructive font-medium" : "text-muted-foreground",
            )}
          >
            <CalendarClockIcon className="size-2.5" />
            {relativeDay(new Date(card.nextFollowUpAt))}
          </span>
        )}
        <div className="text-muted-foreground ml-auto flex items-center gap-2 text-[11px]">
          {card.resumeName && <FileTextIcon className="size-2.5" />}
          {card.activityCount > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquareIcon className="size-2.5" />
              {card.activityCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export { TERMINAL_STAGES };
