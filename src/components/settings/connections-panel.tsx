"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRightIcon,
  CalendarIcon,
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  MailIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ClientMark, ClientTile } from "@/components/client-mark";
import { GoogleDetails, type GoogleConnectionView } from "@/components/settings/google-panel";
import { cn } from "@/lib/utils";
import { MCP_CLIENTS, clientName } from "@/lib/mcp/clients";
import {
  createConnectionAction,
  deleteConnectionAction,
  renameConnectionAction,
  rotateConnectionAction,
  testConnectionAction,
} from "@/server/actions";

/**
 * Everything wired to this workspace, as a grid of tiles.
 *
 * Two directions of wiring share the screen. Assistants read and write the
 * workspace over MCP; accounts — Google today — are what the workspace reads
 * on your behalf. They are drawn the same way, a brand mark on a tile with a
 * one-line status, because the question a person brings here is the same for
 * both: what is connected, is it working, and how do I add or remove one.
 *
 * A tile is a summary; everything you can do to a connection lives in a
 * slide-over that opens from it. The earlier version put the setup guide and
 * the URL inline under each row, which made three connections a page of
 * config snippets. Now the list is the list.
 */

export type ConnectionRow = {
  id: string;
  name: string;
  client: string;
  token: string;
  lastUsedAt: string | null;
  lastUsedFrom: string;
};

export type GoogleTileProps = {
  connection: GoogleConnectionView | null;
  /** Whether an admin has configured a Google OAuth client at all. */
  ready: boolean;
  /** The outcome of a connect that just came back from Google, if one did. */
  notice: { ok: boolean; message: string } | null;
  /** Open the Google slide-over on arrival — the callback lands here. */
  focus: boolean;
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

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

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

/** A status dot with a word: connected and used, connected and idle, or off. */
function Status({ tone, children }: { tone: "live" | "idle" | "off" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        tone === "live" && "text-success",
        tone === "warn" && "text-destructive",
        (tone === "idle" || tone === "off") && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "live" && "bg-success",
          tone === "warn" && "bg-destructive",
          tone === "idle" && "bg-muted-foreground/60",
          tone === "off" && "border-muted-foreground/50 border",
        )}
        aria-hidden
      />
      {children}
    </span>
  );
}

/**
 * The tile. One brand mark, a name, one line of status, and the whole thing
 * is the button — there is nothing to do on a tile except open it.
 */
function Tile({
  mark,
  title,
  meta,
  status,
  onClick,
  className,
}: {
  mark: string;
  title: string;
  /** The line under the name: the client, or the account address. */
  meta?: string;
  status: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-card hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-ring/50 group flex min-h-[7.25rem] flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
        className,
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <ClientTile client={mark} size={40} />
        <ArrowUpRightIcon className="text-faint group-hover:text-foreground size-3.5 shrink-0 transition-colors" />
      </div>
      <div className="min-w-0 w-full">
        <div className="truncate text-[13.5px] font-medium">{title}</div>
        {meta && <div className="text-faint truncate text-xs">{meta}</div>}
        <div className="mt-1.5">{status}</div>
      </div>
    </button>
  );
}

function AddTile({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-ring/50 flex min-h-[7.25rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60"
    >
      {pending ? (
        <LoaderCircleIcon className="size-5 animate-spin" />
      ) : (
        <span className="bg-muted flex size-10 items-center justify-center rounded-xl">
          <PlusIcon className="size-[18px]" />
        </span>
      )}
      <span className="text-[13px] font-medium">Connect an assistant</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The assistant slide-over
// ---------------------------------------------------------------------------

function ConnectionSheet({
  connection,
  baseUrl,
  open,
  onOpenChange,
}: {
  connection: ConnectionRow;
  baseUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [token, setToken] = useState(connection.token);
  const [name, setName] = useState(connection.name);
  const [renaming, setRenaming] = useState(false);
  const [revealed, setRevealed] = useState(false);
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
      onOpenChange(false);
    });

  const commitRename = () =>
    startTransition(async () => {
      setRenaming(false);
      if (name.trim() === connection.name) return;
      await renameConnectionAction(connection.id, name);
      toast.success("Renamed");
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-xl sm:p-6">
        <div className="flex items-start gap-3">
          <ClientTile client={connection.client} size={44} />
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
                className="h-9 max-w-64 text-base md:h-8"
              />
            ) : (
              <SheetTitle asChild>
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  className="hover:text-primary max-w-full truncate text-left text-[17px] font-semibold tracking-tight transition-colors"
                  title="Rename"
                >
                  {name}
                </button>
              </SheetTitle>
            )}
            <SheetDescription asChild>
              <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                {label !== name && (
                  <>
                    <span>{label}</span>
                    <span aria-hidden>·</span>
                  </>
                )}
                {lastUsed ? (
                  <Status tone="live">
                    used {lastUsed}
                    {connection.lastUsedFrom ? ` from ${connection.lastUsedFrom}` : ""}
                  </Status>
                ) : (
                  <Status tone="idle">never used</Status>
                )}
              </div>
            </SheetDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runTest} disabled={testing}>
            {testing ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <ZapIcon className="size-3.5" />
            )}
            Test
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {test && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
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

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <div className="text-[13px] font-semibold">Connection URL</div>
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
              <CopyButton value={url} label="Copy" />
            </div>
            <p className="text-muted-foreground text-xs">
              This URL is a password for your workspace. Anyone holding it can read and write
              your career history, resumes and pipeline.
            </p>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold">Where are you pasting this?</div>
            <div className="flex flex-wrap gap-1.5">
              {MCP_CLIENTS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setClient(entry.id)}
                  title={entry.tagline}
                  aria-pressed={client === entry.id}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border px-2.5 text-xs font-medium whitespace-nowrap transition-colors md:min-h-8",
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
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Picking a client
// ---------------------------------------------------------------------------

function PickerSheet({
  open,
  onOpenChange,
  onPick,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (client: string) => void;
  pending: boolean;
}) {
  const products = MCP_CLIENTS.filter((entry) => entry.category !== "any");
  const generic = MCP_CLIENTS.filter((entry) => entry.category === "any");

  const option = (entry: (typeof MCP_CLIENTS)[number]) => (
    <button
      key={entry.id}
      type="button"
      disabled={pending}
      onClick={() => onPick(entry.id)}
      className="hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-ring/50 flex items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60"
    >
      <ClientTile client={entry.id} size={36} />
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{entry.name}</div>
        <div className="text-faint truncate text-xs">{entry.tagline}</div>
      </div>
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-xl sm:p-6">
        <SheetTitle className="text-[17px] font-semibold tracking-tight">Connect an assistant</SheetTitle>
        <SheetDescription className="mt-1 text-xs">
          Each client gets its own URL, so one can be disconnected later without breaking the
          rest. Pick where you are pasting it and the setup steps follow.
        </SheetDescription>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">{products.map(option)}</div>
        <div className="text-faint mt-5 mb-2 text-[11.5px] font-medium tracking-wide uppercase">
          Anything else
        </div>
        <div className="grid gap-2 sm:grid-cols-2">{generic.map(option)}</div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function ConnectionsPanel({
  baseUrl,
  connections,
  toolCount,
  adminToolCount,
  isAdmin,
  promptCount,
  google,
}: {
  baseUrl: string;
  connections: ConnectionRow[];
  toolCount: number;
  adminToolCount: number;
  isAdmin: boolean;
  promptCount: number;
  google: GoogleTileProps;
}) {
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [googleOpen, setGoogleOpen] = useState(false);
  const used = useMemo(() => connections.filter((c) => c.lastUsedAt).length, [connections]);

  // The callback from Google lands on this tab with `focus` set: open the tile
  // it came back to, so the outcome is in front of the person, not a click away.
  useEffect(() => {
    if (google.focus) setGoogleOpen(true);
  }, [google.focus]);

  const add = (client: string) =>
    startTransition(async () => {
      const created = await createConnectionAction({ client, name: clientName(client) });
      setPicking(false);
      toast.success("Connection added — the URL is in the panel");
      if (created?.id) setOpenId(created.id);
    });

  const openConnection = connections.find((connection) => connection.id === openId) ?? null;

  const googleStatus = !google.ready ? (
    <Status tone="off">Needs an admin</Status>
  ) : !google.connection ? (
    <Status tone="off">Not connected</Status>
  ) : google.connection.lastError ? (
    <Status tone="warn">Needs reconnecting</Status>
  ) : (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Status tone={google.connection.mail ? "live" : "off"}>
        <MailIcon className="size-3" /> Gmail
      </Status>
      <Status tone={google.connection.calendar ? "live" : "off"}>
        <CalendarIcon className="size-3" /> Calendar
      </Status>
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Connections</h2>
          <p className="text-muted-foreground text-sm">
            {connections.length === 1 ? "1 assistant" : `${connections.length} assistants`}
            {used > 0 && connections.length > 1 && `, ${used} in use`} ·{" "}
            {google.connection ? "Google connected" : "Google not connected"} · {toolCount} tools
            {isAdmin && adminToolCount > 0 && <span> ({adminToolCount} admin)</span>} · {promptCount}{" "}
            workflows
          </p>
        </div>
        <Button size="sm" onClick={() => setPicking(true)} disabled={pending}>
          {pending ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <PlusIcon className="size-3.5" />
          )}
          Connect
        </Button>
      </div>

      {google.notice && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]",
            google.notice.ok
              ? "border-success/30 bg-success/8 text-success"
              : "border-destructive/30 bg-destructive/8 text-destructive",
          )}
        >
          {google.notice.ok ? (
            <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          )}
          {google.notice.message}
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-[13px] font-semibold">Assistants</h3>
          <p className="text-muted-foreground text-xs">
            Read and write your workspace over MCP. Each has its own URL; open one for the
            setup steps, to test it, or to cut it off.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connections.map((connection) => {
            const label = clientName(connection.client);
            const lastUsed = ago(connection.lastUsedAt);
            return (
              <Tile
                key={connection.id}
                mark={connection.client}
                title={connection.name}
                meta={label !== connection.name ? label : undefined}
                status={
                  lastUsed ? (
                    <Status tone="live">used {lastUsed}</Status>
                  ) : (
                    <Status tone="idle">never used</Status>
                  )
                }
                onClick={() => setOpenId(connection.id)}
              />
            );
          })}
          <AddTile onClick={() => setPicking(true)} pending={pending} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-[13px] font-semibold">Accounts</h3>
          <p className="text-muted-foreground text-xs">
            What the workspace reads on your behalf. Live and read-only; nothing is copied here.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            mark="google"
            title="Google"
            meta={google.connection?.email ?? "Gmail and Calendar"}
            status={googleStatus}
            onClick={() => setGoogleOpen(true)}
          />
        </div>
      </section>

      <p className="text-muted-foreground text-xs leading-relaxed">
        Every connection here is yours alone: nobody else&apos;s data is reachable through one.
        The assistant URLs are passwords for your workspace, so treat them like passwords.
      </p>

      {openConnection && (
        <ConnectionSheet
          key={openConnection.id}
          connection={openConnection}
          baseUrl={baseUrl}
          open
          onOpenChange={(next) => {
            if (!next) setOpenId(null);
          }}
        />
      )}

      <PickerSheet open={picking} onOpenChange={setPicking} onPick={add} pending={pending} />

      <Sheet open={googleOpen} onOpenChange={setGoogleOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-xl sm:p-6">
          <div className="flex items-start gap-3">
            <ClientTile client="google" size={44} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-[17px] font-semibold tracking-tight">Google</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs">
                Your own Gmail and Google Calendar, read live behind every contact, company and
                application.
              </SheetDescription>
            </div>
          </div>
          <div className="mt-6">
            <GoogleDetails
              connection={google.connection}
              ready={google.ready}
              onDisconnected={() => setGoogleOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
