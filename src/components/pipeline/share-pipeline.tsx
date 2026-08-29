"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { sharePipelineAction, unsharePipelineAction } from "@/server/actions";

/**
 * Hand someone a link to the pipeline.
 *
 * The copy here does real work: a person about to send this needs to know
 * exactly what the other end will see, and "read-only" alone does not answer
 * that. Naming what is withheld — salary, notes, contacts — is the difference
 * between sharing confidently and not sharing at all.
 */
export function SharePipeline({
  initial,
}: {
  initial: { url: string; includeClosed: boolean } | null;
}) {
  const router = useRouter();
  const [share, setShare] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const create = (includeClosed: boolean) =>
    startTransition(async () => {
      try {
        const result = await sharePipelineAction(includeClosed);
        setShare({ url: result.url, includeClosed: result.includeClosed });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create that link.");
      }
    });

  const revoke = () => {
    if (
      !confirm(
        "Stop sharing? The link stops working for everyone who has it, and sharing again later gives a different address.",
      )
    )
      return;
    startTransition(async () => {
      await unsharePipelineAction();
      setShare(null);
      toast.success("Link revoked");
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Share2Icon className="size-3.5" />
          {share ? "Shared" : "Share"}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-80 p-3">
        {share ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[13px] font-medium">Anyone with this link</div>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={share.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="border-input bg-inset shadow-field h-9 min-w-0 flex-1 rounded-control border px-2 text-[12px] outline-none md:h-8"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(share.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-[13px]">
              <Switch
                checked={share.includeClosed}
                onCheckedChange={(checked) => create(checked)}
                disabled={pending}
              />
              Include closed applications
            </label>

            <p className="text-muted-foreground text-[12px] leading-snug">
              They see companies, roles, stages and follow-up dates. They do not see your
              salaries, notes, contacts or job descriptions — and they cannot change anything.
            </p>

            <Button
              variant="ghost"
              size="sm"
              className="text-destructive w-full"
              onClick={revoke}
              disabled={pending}
            >
              Stop sharing
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-[12.5px] leading-snug">
              Give a friend, a coach or a former manager a read-only link to your pipeline so
              they can help you work out what to chase. No account needed at their end.
            </p>
            <p className="text-muted-foreground text-[12px] leading-snug">
              They see companies, roles, stages and follow-up dates — never your salaries,
              notes, contacts or job descriptions.
            </p>
            <Button size="sm" className="w-full" onClick={() => create(false)} disabled={pending}>
              Create a link
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
