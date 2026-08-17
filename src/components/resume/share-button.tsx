"use client";

import { useState, useTransition } from "react";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Link2Icon,
  Link2OffIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { publishResumeAction, unpublishResumeAction } from "@/server/actions";

/**
 * Publishing lives outside the editor's autosave on purpose. Everything else on
 * this screen saves as you type; a public link should change only when somebody
 * decides it should, and unpublishing is destructive enough to deserve a click.
 */
export function ShareButton({ id, initialUrl }: { id: string; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const publish = () =>
    startTransition(async () => {
      const result = await publishResumeAction(id);
      setUrl(result.url);
      await copy(result.url);
      toast.success("Published — link copied");
    });

  const unpublish = () =>
    startTransition(async () => {
      await unpublishResumeAction(id);
      setUrl(null);
      toast.success("Link withdrawn");
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={url ? "secondary" : "outline"} size="sm">
          <Link2Icon className="size-4" />
          {url ? "Link live" : "Share"}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96">
        {url ? (
          <div className="space-y-3">
            <div>
              <div className="text-[13px] font-medium">Anyone with this link can read it</div>
              <p className="text-muted-foreground text-xs">
                It isn&apos;t indexed by search engines, and your private notes aren&apos;t on the
                page.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <code className="bg-muted/70 min-w-0 flex-1 truncate rounded-lg border px-2.5 py-2 font-mono text-[12px]">
                {url}
              </code>
              <Button
                variant={copied ? "secondary" : "gradient"}
                size="sm"
                onClick={() => copy(url)}
              >
                {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <a href={url} target="_blank" rel="noreferrer noopener">
                <ExternalLinkIcon className="size-3.5" /> Open the public page
              </a>
            </Button>

            <Separator />

            <div className="flex items-start justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                Withdrawing kills this address for good. Sharing again gives you a different one.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive shrink-0"
                disabled={pending}
                onClick={unpublish}
              >
                <Link2OffIcon className="size-3.5" /> Withdraw
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[13px] font-medium">Share this resume as a link</div>
              <p className="text-muted-foreground text-xs">
                For application forms that ask for a URL, or a recruiter who&apos;d rather not open
                an attachment. The address is long and random, so it can&apos;t be guessed, and the
                page tells search engines not to index it.
              </p>
            </div>
            <Button variant="gradient" size="sm" className="w-full" disabled={pending} onClick={publish}>
              {pending ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <Link2Icon className="size-3.5" />
              )}
              Create a link
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
