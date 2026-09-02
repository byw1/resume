"use client";

import { useState } from "react";
import { ExternalLinkIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformIcon } from "@/components/crm/platform-icon";
import {
  BRAND_LABEL,
  NAMED_PLATFORMS,
  PLATFORMS,
  PLATFORM_LABEL,
  brandFor,
  detectPlatform,
  linkHref,
  linkLabel,
  normaliseLink,
  type PlatformKey,
} from "@/lib/social";

export type ContactLinkValues = {
  linkedin: string;
  twitter: string;
  instagram: string;
  github: string;
  website: string;
  otherLinks: string[];
};

/**
 * Every way to reach a person, as one list rather than six labelled boxes.
 *
 * The old form had a single "LinkedIn" field, which is the right guess for a
 * recruiter and wrong for everyone else. Six stacked inputs would have been
 * the obvious fix and a worse one — most are empty for most people, and an
 * empty box still costs a row of the sidebar.
 *
 * So: what is set is listed, and one row adds more. Paste a URL and the
 * platform is worked out from its host; type a bare "@handle" and the picker
 * is how you say which platform it belongs to, because nothing in "@will"
 * says X rather than Instagram.
 */
export function ContactLinks({
  values,
  onChange,
}: {
  values: ContactLinkValues;
  /** Called with the patch to persist. Only changed fields are included. */
  onChange: (patch: Partial<ContactLinkValues>) => void;
}) {
  const [draft, setDraft] = useState("");
  const [platform, setPlatform] = useState<PlatformKey | "auto">("auto");

  const rows: { key: string; platform: PlatformKey; value: string; remove: () => void }[] = [
    ...NAMED_PLATFORMS.filter((key) => values[key].trim()).map((key) => ({
      key,
      platform: key as PlatformKey,
      value: values[key],
      remove: () => onChange({ [key]: "" } as Partial<ContactLinkValues>),
    })),
    ...values.otherLinks.map((value, index) => ({
      key: `other-${index}-${value}`,
      platform: "other" as PlatformKey,
      value,
      remove: () =>
        onChange({ otherLinks: values.otherLinks.filter((_, i) => i !== index) }),
    })),
  ];

  const add = () => {
    const raw = draft.trim();
    if (!raw) return;

    const resolved = platform === "auto" ? detectPlatform(raw) : platform;
    if (!resolved) {
      toast.error("That isn't a link I can place. Pick a platform, or paste the full URL.");
      return;
    }

    const value = normaliseLink(raw, resolved);
    // "@will" means something under X, where the handle expands to a profile.
    // Under Website or Other it expands to nothing, and storing it would put a
    // row on the card that can never be opened.
    if (!linkHref(value)) {
      toast.error(`Paste the full URL for a ${PLATFORM_LABEL[resolved].toLowerCase()} link.`);
      return;
    }
    // A named slot that is already taken is not overwritten — the second
    // LinkedIn URL is kept as another link rather than silently replacing the
    // first, because losing an address you pasted is worse than an untidy list.
    if (resolved !== "other" && !values[resolved].trim()) {
      onChange({ [resolved]: value } as Partial<ContactLinkValues>);
    } else if (
      values.otherLinks.some((existing) => existing.toLowerCase() === value.toLowerCase()) ||
      NAMED_PLATFORMS.some((key) => values[key].toLowerCase() === value.toLowerCase())
    ) {
      toast.error("You already have that one.");
      return;
    } else {
      onChange({ otherLinks: [...values.otherLinks, value] });
    }

    setDraft("");
    setPlatform("auto");
  };

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((row) => {
            const href = linkHref(row.value);
            // What it IS, not what column it sits in: "Open their Other" was
            // the label on every link that wasn't one of the five.
            const what = BRAND_LABEL[brandFor(row.value, row.platform)];
            return (
              <li key={row.key} className="group flex items-center gap-2">
                <PlatformIcon
                  value={row.value}
                  brand={row.platform}
                  className="text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-[13px]" title={row.value}>
                  {linkLabel(row.value)}
                </span>
                {href && (
                  <Button
                    asChild
                    variant="ghost"
                    size="icon-sm"
                    className="text-faint hover:text-foreground"
                  >
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open their ${what}`}
                    >
                      <ExternalLinkIcon />
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove their ${what}`}
                  className="text-faint hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={row.remove}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-1.5">
        <Select
          value={platform}
          onValueChange={(value) => setPlatform(value as PlatformKey | "auto")}
        >
          <SelectTrigger size="sm" className="w-[6.5rem] shrink-0" aria-label="Which platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            {PLATFORMS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={
            platform === "auto"
              ? "Paste a link"
              : PLATFORMS.find((option) => option.key === platform)?.placeholder
          }
          className="h-9 text-[13px] md:h-8"
          aria-label="Link to add"
        />
        <Button variant="outline" size="icon-sm" onClick={add} disabled={!draft.trim()} aria-label="Add link">
          <PlusIcon />
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="text-faint text-xs leading-snug">
          Wherever they actually answer — LinkedIn, X, Instagram, their own site.
        </p>
      )}
    </div>
  );
}
