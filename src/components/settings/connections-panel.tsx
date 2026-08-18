"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRightIcon,
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  PlugZapIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { MCP_CLIENTS, clientName } from "@/lib/mcp/clients";
import {
  createConnectionAction,
  deleteConnectionAction,
  renameConnectionAction,
  rotateConnectionAction,
  testConnectionAction,
} from "@/server/actions";

export type ConnectionRow = {
  id: string;
  name: string;
  client: string;
  token: string;
  lastUsedAt: string | null;
  lastUsedFrom: string;
};

function ago(iso: string | null) {
  if (!iso) return null;
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.round(days / 30)}mo ago`;
}

function CopyButton({
  value,
  label = "Copy",
  className,
  variant = "default",
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: "default" | "ghost" | "outline" | "secondary";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={copied ? "secondary" : variant}
      size="sm"
      className={cn("shrink-0", className)}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success("Copied");
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {label}
    </Button>
  );
}

/** A config snippet with its own copy button. */
function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="mt-2 overflow-hidden rounded-lg border">
      <div className="bg-muted/60 flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="text-muted-foreground font-mono text-[11px]">{label ?? "Config"}</span>
        <CopyButton value={code} variant="ghost" label="Copy" className="-my-1 h-7 px-2 text-[11px]" />
      </div>
      <pre className="bg-muted/25 overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function SetupGuide({ clientId, url }: { clientId: string; url: string }) {
  const recipe = MCP_CLIENTS.find((entry) => entry.id === clientId) ?? MCP_CLIENTS[0];
  const steps = recipe.steps(url);

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.text} className="flex gap-3">
            <span className="bg-muted text-muted-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-sm">{step.text}</p>
              {step.code && <CodeBlock code={step.code} label={step.codeLabel} />}
            </div>
          </li>
        ))}
      </ol>
      <a
        href={recipe.docs}
        target="_blank"
        rel="noreferrer noopener"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
      >
        {recipe.docsLabel ?? `${recipe.name} MCP docs`} <ArrowUpRightIcon className="size-3" />
      </a>
    </div>
  );
}

function ConnectionCard({ connection, baseUrl }: { connection: ConnectionRow; baseUrl: string }) {
  const [token, setToken] = useState(connection.token);
  const [name, setName] = useState(connection.name);
  const [renaming, setRenaming] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(connection.client);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const url = `${baseUrl}/api/mcp/${token}`;
  const masked = url.replace(/(rsm_)([a-f0-9]{6})[a-f0-9]+/, "$1$2••••••••••••••••");
  const lastUsed = ago(connection.lastUsedAt);

  const runTest = () =>
    startTransition(async () => {
      setTest(null);
      const result = await testConnectionAction(connection.id);
      setTest(
        result.ok
          ? { ok: true, message: `Answered with ${result.toolCount} tools` }
          : { ok: false, message: result.error },
      );
    });

  const rotate = () =>
    startTransition(async () => {
      const next = await rotateConnectionAction(connection.id);
      setToken(next);
      setTest(null);
      toast.success("New token issued — paste the new URL into that client");
    });

  const remove = () =>
    startTransition(async () => {
      await deleteConnectionAction(connection.id);
      toast.success(`"${connection.name}" disconnected`);
    });

  const commitRename = () =>
    startTransition(async () => {
      setRenaming(false);
      if (name.trim() === connection.name) return;
      await renameConnectionAction(connection.id, name);
      toast.success("Renamed");
    });

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-3 p-3.5">
        <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <PlugZapIcon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          {renaming ? (
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") {
                  setName(connection.name);
                  setRenaming(false);
                }
              }}
              className="h-7 max-w-56 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="hover:text-primary truncate text-sm font-medium transition-colors"
              title="Rename"
            >
              {name}
            </button>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            <span>{clientName(connection.client)}</span>
            <span aria-hidden>·</span>
            {lastUsed ? (
              <span className="text-success">
                used {lastUsed}
                {connection.lastUsedFrom ? ` from ${connection.lastUsedFrom}` : ""}
              </span>
            ) : (
              <span>never used</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={runTest} disabled={pending}>
            {pending ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <ZapIcon className="size-3.5" />
            )}
            Test
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? "Hide setup" : "Set up"}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {test && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-3.5"
          >
            <div
              className={cn(
                "mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                test.ok
                  ? "border-success/30 bg-success/8 text-success"
                  : "border-destructive/30 bg-destructive/8 text-destructive",
              )}
            >
              {test.ok ? (
                <CheckIcon className="size-3.5 shrink-0" />
              ) : (
                <CircleAlertIcon className="size-3.5 shrink-0" />
              )}
              {test.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-5 border-t p-3.5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="bg-muted/70 min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-[12.5px]">
                    {revealed ? url : masked}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRevealed((value) => !value)}
                    aria-label={revealed ? "Hide token" : "Reveal token"}
                  >
                    {revealed ? <EyeOffIcon /> : <EyeIcon />}
                  </Button>
                  <CopyButton value={url} label="Copy URL" />
                </div>
              </div>

              <div>
                <div className="mb-2 text-[13px] font-semibold">Where are you pasting this?</div>
                <div className="flex flex-wrap gap-1.5">
                  {MCP_CLIENTS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setClient(entry.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                        client === entry.id
                          ? "border-primary/50 bg-muted text-muted-foreground"
                          : "hover:bg-accent/60",
                      )}
                    >
                      <div className="font-medium">{entry.name}</div>
                      <div className="text-muted-foreground text-[10.5px]">{entry.tagline}</div>
                    </button>
                  ))}
                </div>
              </div>

              <SetupGuide clientId={client} url={url} />

              <Separator />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs">
                  Rotating issues a new token for this client only. Everything else stays connected.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={rotate} disabled={pending}>
                    <RefreshCwIcon className={cn("size-3.5", pending && "animate-spin")} /> Rotate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={remove}
                    disabled={pending}
                  >
                    <Trash2Icon className="size-3.5" /> Disconnect
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ConnectionsPanel({
  baseUrl,
  connections,
  toolCount,
  adminToolCount,
  isAdmin,
  prompts,
}: {
  baseUrl: string;
  connections: ConnectionRow[];
  toolCount: number;
  adminToolCount: number;
  isAdmin: boolean;
  prompts: { name: string; title: string; description: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const used = useMemo(() => connections.filter((c) => c.lastUsedAt).length, [connections]);

  const add = (client: string) =>
    startTransition(async () => {
      await createConnectionAction({ client });
      toast.success("Connection created — open Set up to get the URL");
    });

  return (
    <Card className="relative overflow-hidden">

      <CardHeader className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-xl">
              <PlugZapIcon className="size-[18px]" />
            </div>
            <div>
              <CardTitle className="text-[15px]">AI connections</CardTitle>
              <p className="text-muted-foreground text-sm">
                {toolCount} tools · {prompts.length} ready-made workflows
                {isAdmin && adminToolCount > 0 && (
                  <span> · including {adminToolCount} admin tools</span>
                )}
              </p>
            </div>
          </div>
          <Button variant="default" size="sm" onClick={() => add("other")} disabled={pending}>
            <PlusIcon className="size-3.5" /> New connection
          </Button>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-6">
        <div className="space-y-2.5">
          {connections.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} baseUrl={baseUrl} />
          ))}
          {connections.length === 0 && (
            <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
              No connections yet. Add one for whichever assistant you use.
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-[13px] font-semibold">Connect another assistant</h3>
          <p className="text-muted-foreground mb-3 text-xs">
            Each one gets its own URL, so you can disconnect a single client without touching the
            rest.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MCP_CLIENTS.filter((entry) => entry.category !== "any").map((entry) => (
              <Button
                key={entry.id}
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => add(entry.id)}
              >
                <PlusIcon className="size-3.5" /> {entry.name}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-1 text-[13px] font-semibold">Workflows every client gets</h3>
          <p className="text-muted-foreground mb-3 text-xs">
            These arrive as slash commands or prompt shortcuts, depending on the client.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {prompts.map((prompt) => (
              <div key={prompt.name} className="rounded-lg border px-3 py-2.5">
                <div className="text-[13px] font-medium">{prompt.title}</div>
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

        <p className="text-muted-foreground text-xs">
          Every URL above reaches your data and nobody else&apos;s — but anyone holding one can read
          and write yours, so treat them like passwords.
          {used > 0 && ` ${used} of ${connections.length} have been used.`}
        </p>
      </CardContent>
    </Card>
  );
}
