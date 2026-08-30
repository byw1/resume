"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientMark, ClientTile } from "@/components/client-mark";
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
  // Two transitions, not one: testing a connection and rotating its token are
  // different waits, and sharing a pending flag put a spinner on the Test
  // button while a rotate was in flight.
  const [testing, startTest] = useTransition();
  const [pending, startTransition] = useTransition();

  const label = clientName(connection.client);
  const url = `${baseUrl}/api/mcp/${token}`;
  const masked = url.replace(/(rsm_)([a-f0-9]{6})[a-f0-9]+/, "$1$2••••••••••••••••");
  const lastUsed = ago(connection.lastUsedAt);

  const runTest = () =>
    startTest(async () => {
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
    <div className={cn("rounded-xl border transition-colors", open && "bg-inset")}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <ClientTile client={connection.client} size={34} />

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
              className="h-9 max-w-56 text-base md:h-7 md:text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="hover:text-primary max-w-full truncate text-sm font-medium transition-colors"
              title="Rename"
            >
              {name}
            </button>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
            {/* The default connection is named after its client, and "Claude ·
                Claude" reads like a bug. Say the client only when it adds
                something the name doesn't. */}
            {label !== name && (
              <>
                <span>{label}</span>
                <span aria-hidden>·</span>
              </>
            )}
            {lastUsed ? (
              <span className="text-success inline-flex items-center gap-1.5">
                <span className="bg-success size-1.5 rounded-full" aria-hidden />
                used {lastUsed}
                {connection.lastUsedFrom ? ` from ${connection.lastUsedFrom}` : ""}
              </span>
            ) : (
              <span>never used</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={runTest} disabled={testing}>
            {testing ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <ZapIcon className="size-3.5" />
            )}
            Test
          </Button>
          <Button
            variant={open ? "secondary" : "outline"}
            size="sm"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? "Done" : "Set up"}
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
            />
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {test && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-3"
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
            <div className="bg-card space-y-5 rounded-b-xl border-t p-3.5">
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

              <div>
                <div className="mb-2 text-[13px] font-semibold">Where are you pasting this?</div>
                {/* Wrapping rather than scrolling: nine logo chips fold into
                    two short rows, and nothing sits half-cut at the edge the way
                    a scroll container leaves it. Still shorter than the nine
                    two-line cards this replaced. */}
                <div className="flex flex-wrap gap-1.5">
                  {MCP_CLIENTS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setClient(entry.id)}
                      title={entry.tagline}
                      aria-pressed={client === entry.id}
                      className={cn(
                        // A real height, not a ::after hit area: this row lives
                        // inside two overflow-hidden boxes, which would clip one.
                        "flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border px-2.5 text-xs font-medium whitespace-nowrap transition-colors md:min-h-9",
                        client === entry.id
                          ? "border-primary/50 bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <ClientMark client={entry.id} size={14} />
                      {entry.name}
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
  promptCount,
}: {
  baseUrl: string;
  connections: ConnectionRow[];
  toolCount: number;
  adminToolCount: number;
  isAdmin: boolean;
  promptCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const used = useMemo(() => connections.filter((c) => c.lastUsedAt).length, [connections]);

  const add = (client: string) =>
    startTransition(async () => {
      await createConnectionAction({ client, name: clientName(client) });
      toast.success("Connection added — open Set up to get the URL");
    });

  const products = MCP_CLIENTS.filter((entry) => entry.category !== "any");
  const generic = MCP_CLIENTS.filter((entry) => entry.category === "any");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-xl">
              <PlugZapIcon className="size-[18px]" />
            </div>
            <div>
              <CardTitle className="text-[15px]">AI connections</CardTitle>
              <p className="text-muted-foreground text-sm">
                {connections.length === 1 ? "1 assistant" : `${connections.length} assistants`} ·{" "}
                {toolCount} tools · {promptCount} workflows
                {isAdmin && adminToolCount > 0 && <span> · {adminToolCount} admin</span>}
              </p>
            </div>
          </div>

          {/* One button instead of six: picking the client is the first step of
              adding a connection, not a separate row of buttons below it. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={pending}>
                {pending ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <PlusIcon className="size-3.5" />
                )}
                Connect
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Connect an assistant</DropdownMenuLabel>
              {products.map((entry) => (
                <DropdownMenuItem key={entry.id} onSelect={() => add(entry.id)}>
                  <ClientMark client={entry.id} size={15} />
                  <span className="flex-1">{entry.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {generic.map((entry) => (
                <DropdownMenuItem key={entry.id} onSelect={() => add(entry.id)}>
                  <ClientMark client={entry.id} size={15} />
                  <span className="flex-1">{entry.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          {connections.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} baseUrl={baseUrl} />
          ))}
          {connections.length === 0 && (
            <div className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
              No connections yet. Add one for whichever assistant you use.
            </div>
          )}
        </div>

        <p className="text-muted-foreground text-xs leading-relaxed">
          Each URL reaches your data and nobody else&apos;s — but anyone holding one can read and
          write yours, so treat them like passwords.
          {used > 0 && ` ${used} of ${connections.length} have been used.`}
        </p>
      </CardContent>
    </Card>
  );
}
