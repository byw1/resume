"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon, PlusIcon, RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { relativeDay } from "@/lib/utils";
import { deleteVariableAction, saveVariablesAction } from "@/server/actions";

type Variable = {
  key: string;
  label: string;
  help: string;
  kind: "text" | "url" | "secret" | "toggle";
  group: string;
  value: string;
  placeholder: string;
  fallbackText: string;
  hasValue: boolean;
  isDefault: boolean;
  known: boolean;
  updatedAt: string | null;
};

/**
 * Every setting this instance stores, in one editable table.
 *
 * The forms on Configuration are the friendlier way to set email and billing
 * up — they carry the instructions and the test buttons. This is the flat
 * view: it shows what is actually stored, including anything with no form of
 * its own, so a new setting is usable the moment it exists rather than the
 * day someone gets round to building a screen for it.
 */
export function VariablesPanel({ variables }: { variables: Variable[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, startSaving] = useTransition();
  const [resetting, startResetting] = useTransition();
  const [adding, startAdding] = useTransition();

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Variable[]>();
    for (const variable of variables) {
      if (!map.has(variable.group)) {
        map.set(variable.group, []);
        order.push(variable.group);
      }
      map.get(variable.group)!.push(variable);
    }
    return order.map((name) => ({ name, rows: map.get(name)! }));
  }, [variables]);

  // A secret's shown value is a mask, so anything typed into one is a change
  // and an empty box means "leave it alone" — the same rule the guided forms
  // use, and the reason a secret can only be cleared by resetting it.
  const pending = variables.filter((variable) => {
    const edited = edits[variable.key];
    if (edited === undefined) return false;
    return variable.kind === "secret" ? edited.trim() !== "" : edited !== variable.value;
  });

  const save = () =>
    startSaving(async () => {
      const patch = Object.fromEntries(pending.map((v) => [v.key, edits[v.key]]));
      const result = await saveVariablesAction(patch);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEdits({});
      router.refresh();
      toast.success(
        result.changed.length === 0
          ? "Nothing changed"
          : `Saved: ${result.changed.join(", ")}`,
      );
    });

  const reset = (variable: Variable) =>
    startResetting(async () => {
      const result = await deleteVariableAction(variable.key);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEdits(({ [variable.key]: _cleared, ...rest }) => rest);
      router.refresh();
      toast.success(
        variable.known
          ? `${variable.label} is back to its default (${variable.fallbackText})`
          : `${variable.key} removed`,
      );
    });

  const add = () =>
    startAdding(async () => {
      const result = await saveVariablesAction({ [newKey.trim()]: newValue });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setNewKey("");
      setNewValue("");
      router.refresh();
      toast.success(`${newKey.trim()} added`);
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-start gap-3 pt-5">
          <SlidersHorizontalIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground text-sm">
            Everything this instance stores as configuration. Nothing here needs a redeploy —
            a change takes effect on the next request, and every save is recorded in the log
            with your name against it. Secrets are shown masked and can only be replaced or
            reset, never read back.
          </p>
        </CardContent>
      </Card>

      {groups.map((group) => (
        <Card key={group.name}>
          <CardHeader>
            <CardTitle className="text-[15px]">{group.name}</CardTitle>
          </CardHeader>
          <CardContent className="divide-border/70 divide-y pt-0">
            {group.rows.map((variable) => (
              <Row
                key={variable.key}
                variable={variable}
                draft={edits[variable.key]}
                busy={resetting}
                onChange={(value) => setEdits((prev) => ({ ...prev, [variable.key]: value }))}
                onReset={() => {
                  if (
                    !confirm(
                      variable.known
                        ? `Reset ${variable.label} to its default (${variable.fallbackText})?`
                        : `Remove ${variable.key}? Whatever reads it falls back to nothing.`,
                    )
                  ) {
                    return;
                  }
                  reset(variable);
                }}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Add a variable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            For a setting that has no form yet. Lowercase letters, numbers and underscores.
            Values are stored as plain text and shown in full here and in the log, so don&apos;t
            put a key or a password in one.
          </p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="new-variable-key">Key</Label>
              <Input
                id="new-variable-key"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="retention_days"
                className="font-mono text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-variable-value">Value</Label>
              <Input
                id="new-variable-value"
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                placeholder="90"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={add} disabled={adding || !newKey.trim()}>
                {adding ? <LoaderCircleIcon className="animate-spin" /> : <PlusIcon />}
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sticky, because the list is longer than a screen and a save button
          you have to scroll to find is one people forget to press. */}
      {pending.length > 0 && (
        <div className="bg-card/95 sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-raised backdrop-blur">
          <span className="text-sm">
            {pending.length} unsaved {pending.length === 1 ? "change" : "changes"}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {pending.map((variable) => variable.key).join(", ")}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => setEdits({})} disabled={saving}>
              Discard
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <LoaderCircleIcon className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  variable,
  draft,
  busy,
  onChange,
  onReset,
}: {
  variable: Variable;
  draft: string | undefined;
  busy: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const current = draft ?? (variable.kind === "secret" ? "" : variable.value);

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`variable-${variable.key}`} className="text-[13px]">
            {variable.label}
          </Label>
          {variable.isDefault && (
            <Badge variant="outline" className="text-[10px]">
              default
            </Badge>
          )}
          {!variable.known && (
            <Badge variant="outline" className="text-[10px]">
              custom
            </Badge>
          )}
        </div>
        {variable.known && (
          <code className="text-faint mt-1 block font-mono text-[11px]">{variable.key}</code>
        )}
        {variable.help && (
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{variable.help}</p>
        )}
        {variable.updatedAt && (
          <p className="text-faint mt-1.5 text-[11px]">
            changed {relativeDay(new Date(variable.updatedAt))}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {variable.kind === "toggle" ? (
            <div className="flex h-9 items-center gap-2">
              <Switch
                id={`variable-${variable.key}`}
                checked={current !== "0"}
                onCheckedChange={(checked) => onChange(checked ? "1" : "0")}
              />
              <span className="text-muted-foreground text-sm">
                {current !== "0" ? "on" : "off"}
              </span>
            </div>
          ) : (
            <Input
              id={`variable-${variable.key}`}
              type={variable.kind === "secret" ? "password" : "text"}
              value={current}
              onChange={(event) => onChange(event.target.value)}
              placeholder={
                variable.kind === "secret" && variable.hasValue
                  ? variable.value
                  : variable.placeholder
              }
              className="font-mono text-[13px]"
            />
          )}
          {variable.kind === "secret" && (
            <p className="text-faint mt-1.5 text-[11px]">
              {variable.hasValue
                ? "Set. Leave blank to keep it, paste to replace it."
                : "Not set."}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive mt-1"
          onClick={onReset}
          disabled={busy || variable.isDefault}
          aria-label={variable.known ? `Reset ${variable.label}` : `Remove ${variable.key}`}
          title={variable.known ? `Reset to ${variable.fallbackText}` : "Remove"}
        >
          <RotateCcwIcon />
        </Button>
      </div>
    </div>
  );
}
