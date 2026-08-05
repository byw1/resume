"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  PlugZapIcon,
  RefreshCwIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { rotateMcpTokenAction } from "@/server/actions";

export function McpPanel({
  url,
  toolCount,
  adminToolCount,
  isAdmin,
  promptNames,
}: {
  url: string;
  toolCount: number;
  adminToolCount: number;
  isAdmin: boolean;
  promptNames: { name: string; title: string; description: string }[];
}) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const masked = currentUrl.replace(/(rsm_)([a-f0-9]{6})[a-f0-9]+/, "$1$2••••••••••••••••••••");

  const copy = async () => {
    await navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    toast.success("Connection URL copied");
    setTimeout(() => setCopied(false), 2200);
  };

  const rotate = () => {
    if (!confirm("Rotate the token? Claude will lose access until you paste the new URL in.")) return;
    startTransition(async () => {
      const token = await rotateMcpTokenAction();
      setCurrentUrl(currentUrl.replace(/\/api\/mcp\/.*$/, `/api/mcp/${token}`));
      toast.success("New token generated");
    });
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="from-primary/10 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />

      <CardHeader className="relative">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/12 text-primary flex size-9 items-center justify-center rounded-xl">
            <PlugZapIcon className="size-[18px]" />
          </div>
          <div>
            <CardTitle className="text-[15px]">Claude connection</CardTitle>
            <p className="text-muted-foreground text-sm">
              {toolCount} tools · {promptNames.length} ready-made workflows
              {isAdmin && adminToolCount > 0 && (
                <span className="text-primary"> · including {adminToolCount} admin tools</span>
              )}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="bg-muted/70 min-w-0 flex-1 truncate rounded-lg border px-3 py-2.5 font-mono text-[13px]">
              {revealed ? currentUrl : masked}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRevealed((value) => !value)}
              aria-label={revealed ? "Hide token" : "Reveal token"}
            >
              {revealed ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
            <Button variant={copied ? "secondary" : "gradient"} onClick={copy} className="shrink-0">
              <motion.span
                key={copied ? "check" : "copy"}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2"
              >
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </motion.span>
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            This URL is yours alone — it reaches your data and nobody else&apos;s. Anyone who has it
            can read and write it, so treat it like a password.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-[13px] font-semibold">Add it to Claude</h3>
          <ol className="space-y-2.5">
            {[
              "Open Claude and go to Settings → Connectors.",
              'Click "Add custom connector".',
              'Name it "Resume OS" and paste the URL above.',
              "Save. Claude can now read and write everything in this app.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="bg-primary/12 text-primary flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span className="text-muted-foreground pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <Separator />

        <div>
          <h3 className="mb-1 flex items-center gap-2 text-[13px] font-semibold">
            <WandSparklesIcon className="text-primary size-3.5" />
            Workflows Claude gets for free
          </h3>
          <p className="text-muted-foreground mb-3 text-xs">
            These show up as slash commands once the connector is added.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {promptNames.map((prompt) => (
              <div key={prompt.name} className="rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="text-primary size-3" />
                  <span className="text-[13px] font-medium">{prompt.title}</span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {prompt.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-2 text-[13px] font-semibold">Try saying</h3>
          <div className="flex flex-wrap gap-2">
            {[
              "Here's everything I did at my last job — file it.",
              "Tailor my resume to this posting.",
              "What should I follow up on this week?",
              "Mine my Stripe role into resume bullets.",
              "I just had a screen with Acme — log it and move them forward.",
              ...(isAdmin
                ? ["Invite sam@example.com to the platform.", "Is email set up? Send a test."]
                : []),
            ].map((example) => (
              <Badge key={example} variant="secondary" className="px-2.5 py-1 text-[11px] font-normal">
                {example}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium">Rotate token</div>
            <p className="text-muted-foreground text-xs">
              Invalidates your current URL. Use it if you ever paste the link somewhere public.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={rotate} disabled={pending}>
            <RefreshCwIcon className={cn(pending && "animate-spin")} /> Rotate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
