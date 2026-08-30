"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * A file you are meant to take away.
 *
 * Shown raw rather than rendered, because the thing being handed over *is* the
 * markdown — front matter included. A prettified preview would look better and
 * be the wrong bytes.
 *
 * Two downloads rather than one, because the same skill has two destinations
 * and they want different packaging: a file on disk for Claude Code, a zip for
 * the upload box in Claude's apps.
 */
export function CopyBlock({
  body,
  filename = "SKILL.md",
  downloads = [],
}: {
  body: string;
  filename?: string;
  downloads?: { href: string; name: string; label: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-inset shadow-hairline overflow-hidden rounded-control">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-faint font-mono text-[11.5px]">{filename}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setExpanded((open) => !open)}>
            {expanded ? "Collapse" : "Read it"}
          </Button>
          {downloads.map((download) => (
            <Button key={download.href} asChild variant="ghost" size="xs">
              <a href={download.href} download={download.name}>
                <DownloadIcon /> {download.label}
              </a>
            </Button>
          ))}
          <Button variant={copied ? "secondary" : "outline"} size="xs" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {expanded && (
        <pre className="bg-card border-t px-3 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
          {body}
        </pre>
      )}
    </div>
  );
}
