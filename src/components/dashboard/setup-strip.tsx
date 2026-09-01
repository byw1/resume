import Link from "next/link";
import { ArrowRightIcon, BrainIcon, CheckIcon, KanbanIcon, PlugZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SetupStatus } from "@/lib/data/onboarding";
import { cn } from "@/lib/utils";

/**
 * The first ten minutes, and nothing else.
 *
 * A new workspace used to render four cards agreeing that nothing has
 * happened — zeros, an empty chase list, a diagnosis with no data. This
 * replaces them while any step is outstanding and disappears on its own once
 * they are all done: no dismiss button, because a step that is finished is
 * finished and a step that is not is the only thing worth reading.
 */
const COPY = {
  connect: {
    icon: PlugZapIcon,
    title: "Connect Claude",
    body: "Copy your private connection URL and add it as a custom connector. Everything here is then reachable from a conversation, which is how this is meant to be used.",
    href: "/settings",
    cta: "Get my URL",
  },
  history: {
    icon: BrainIcon,
    title: "Bring your history in",
    body: "Paste a resume and let it fill the brain, or tell Claude about your last job and let it file the detail. Either beats typing your career into a form.",
    href: "/brain?import=1",
    cta: "Import a resume",
  },
  track: {
    icon: KanbanIcon,
    title: "Track one job",
    body: "Paste a posting and it fills the form. One application is enough for the pipeline, the follow-ups and the diagnosis to start doing something.",
    href: "/applications?new=1",
    cta: "Track a job",
  },
} as const;

export function SetupStrip({ status }: { status: SetupStatus }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {status.steps.map((step, index) => {
        const copy = COPY[step.key];
        return (
          <div
            key={step.key}
            className={cn(
              "bg-card shadow-card rounded-xl p-5",
              step.done && "opacity-60",
            )}
          >
            <div
              className={cn(
                "mb-4 flex size-10 items-center justify-center rounded-xl",
                step.done ? "bg-success-tint text-success" : "bg-primary-tint text-primary",
              )}
            >
              {step.done ? <CheckIcon className="size-[18px]" /> : <copy.icon className="size-[18px]" />}
            </div>
            <div className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {step.done ? "Done" : `Step ${index + 1}`}
            </div>
            <h3 className="text-[15px] font-semibold">{copy.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {step.done ? step.detail : copy.body}
            </p>
            {!step.done && (
              <Button asChild variant="outline" size="sm" className="mt-5 w-fit">
                <Link href={copy.href}>
                  {copy.cta} <ArrowRightIcon />
                </Link>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
