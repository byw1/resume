"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseIcon, ExternalLinkIcon, MailIcon, PhoneIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { CompanyChip } from "@/components/crm/company-chip";
import { ContactLinks } from "@/components/crm/contact-links";
import { SaveIndicator } from "@/components/save-indicator";
import type { SaveState } from "@/hooks/use-autosave";
import { addActivityAction, deleteCrmContactAction, saveContactAction } from "@/server/actions";
import { ACTIVITY_LABEL, STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import { linkHref } from "@/lib/links";
import { relativeDay } from "@/lib/utils";
import type { ActivityType, Stage } from "@prisma/client";

/** The kinds of touch a person logs by hand. The rest are written by the system. */
const TOUCH_TYPES: ActivityType[] = [
  "NOTE",
  "OUTREACH",
  "CALL",
  "EMAIL_SENT",
  "EMAIL_RECEIVED",
  "FOLLOW_UP",
];

export type ContactFields = {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  twitter: string;
  instagram: string;
  github: string;
  website: string;
  otherLinks: string[];
  relationship: string;
  notes: string;
  company: string;
  /** ISO date (yyyy-mm-dd) or empty — when to next get in touch. */
  nextFollowUpAt: string;
};

/** The job this person is attached to, as much of it as a card should show. */
export type LinkedApplication = {
  id: string;
  roleTitle: string;
  stage: Stage;
  location: string;
  salaryRange: string;
  jobUrl: string;
  nextFollowUpAt: string | null;
};

export type ContactTouch = {
  id: string;
  type: ActivityType;
  body: string;
  occurredAt: string;
};

export function ContactDetail({
  contact,
  company,
  application,
  touches,
  logos,
}: {
  contact: ContactFields;
  /** The employer's record, when they have one. Null means unattached. */
  company: { id: string; name: string; website: string } | null;
  application: LinkedApplication | null;
  touches: ContactTouch[];
  logos: boolean;
}) {
  const [values, setValues] = useState(contact);
  const [state, setState] = useState<SaveState>("idle");
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<ActivityType>("NOTE");
  const [logging, startLogging] = useTransition();
  const [, startTransition] = useTransition();
  const router = useRouter();

  const logTouch = () => {
    const body = note.trim();
    if (!body) return;
    startLogging(async () => {
      try {
        await addActivityAction({ contactId: contact.id, type: noteType, body });
        setNote("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not log that.");
      }
    });
  };

  const commit = (patch: Partial<ContactFields>) => {
    const changed = Object.entries(patch).some(
      ([key, value]) => contact[key as keyof ContactFields] !== value,
    );
    if (!changed) return;
    setState("saving");
    startTransition(async () => {
      try {
        await saveContactAction(contact.id, patch);
        setState("saved");
        router.refresh();
      } catch (error) {
        setState("idle");
        toast.error(error instanceof Error ? error.message : "Could not save that.");
        setValues(contact);
      }
    });
  };

  const set = (patch: Partial<ContactFields>) => setValues((prev) => ({ ...prev, ...patch }));

  // One click for "in two weeks" instead of arithmetic in a date picker.
  const pingIn = (days: number | null) => {
    const next =
      days === null
        ? ""
        : new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    set({ nextFollowUpAt: next });
    commit({ nextFollowUpAt: next });
  };

  const remove = () => {
    if (!confirm(`Delete ${contact.name}? Their timeline goes with them. This cannot be undone.`))
      return;
    startTransition(async () => {
      try {
        await deleteCrmContactAction(contact.id);
        router.push("/crm/contacts");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete that contact.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CompanyAvatar name={values.name} domain={null} size={44} />
        <div className="min-w-0 flex-1">
          <Input
            value={values.name}
            onChange={(event) => set({ name: event.target.value })}
            onBlur={() => commit({ name: values.name })}
            className="h-auto border-0 bg-transparent px-0 text-[22px] font-semibold tracking-tight shadow-none focus-visible:ring-0"
          />
          {/* The employer sits under the name as something you can open, not
              as " at Stripe" in grey text — their research, their people and
              the other roles there are one click from here. */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-faint text-[12.5px]">{values.title || "No title set"}</span>
            {company && <CompanyChip company={company} logos={logos} size="sm" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          {values.email && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${values.email}`}>
                <MailIcon /> Email
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete contact"
            className="text-muted-foreground hover:text-destructive"
            onClick={remove}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={values.notes}
                onChange={(event) => set({ notes: event.target.value })}
                onBlur={() => commit({ notes: values.notes })}
                placeholder="How you met, what they said, what they care about, what you owe them. The things that make a follow-up sound like a person rather than a template."
                className="min-h-48 resize-y"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">
                Timeline
                {touches.length > 0 && (
                  <span className="text-faint nums ml-1.5 font-normal">{touches.length}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") logTouch();
                  }}
                  placeholder="Called about the referral — she'll intro me to the EM."
                />
                <Select
                  value={noteType}
                  onValueChange={(value) => setNoteType(value as ActivityType)}
                >
                  <SelectTrigger className="w-32 shrink-0" aria-label="Kind of touch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOUCH_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ACTIVITY_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={logTouch} disabled={logging || !note.trim()}>
                  Log it
                </Button>
              </div>
              {touches.length === 0 ? (
                <p className="text-muted-foreground py-2 text-center text-[13px]">
                  Nothing logged yet. Every call, coffee and reply you note here is what
                  &quot;when did I last talk to them&quot; will be answered from.
                </p>
              ) : (
                <ol className="relative space-y-3.5 pl-5">
                  <span className="bg-border absolute top-1.5 bottom-1.5 left-[3px] w-px" />
                  {touches.map((touch) => (
                    <li key={touch.id} className="relative">
                      <span className="bg-border ring-card absolute top-1.5 -left-5 size-[7px] rounded-full ring-4" />
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-medium">{ACTIVITY_LABEL[touch.type]}</span>
                        <span className="text-faint meta ml-auto text-[11.5px]">{touch.occurredAt}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[13px] whitespace-pre-wrap">
                        {touch.body}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Title" value={values.title} placeholder="Engineering Manager" onChange={(title) => set({ title })} onCommit={() => commit({ title: values.title })} />
              {/* Only asked for when there is nothing to link to. Once they
                  have an employer the chip under their name IS the answer, and
                  a second copy of it in a text box is a way to rename the
                  company by accident. */}
              {!company && (
                <Field label="Company" value={values.company} placeholder="Stripe" onChange={(company) => set({ company })} onCommit={() => commit({ company: values.company })} hint="Creates the company if it does not exist yet." />
              )}
              <Field label="Relationship" value={values.relationship} placeholder="Recruiter" onChange={(relationship) => set({ relationship })} onCommit={() => commit({ relationship: values.relationship })} />
              <Field label="Email" value={values.email} placeholder="name@company.com" onChange={(email) => set({ email })} onCommit={() => commit({ email: values.email })} />
              <Field label="Phone" value={values.phone} placeholder="+1 555 0100" onChange={(phone) => set({ phone })} onCommit={() => commit({ phone: values.phone })} />
              <div className="space-y-1.5">
                <Label htmlFor="contact-ping">Ping them next</Label>
                <Input
                  id="contact-ping"
                  type="date"
                  value={values.nextFollowUpAt}
                  onChange={(event) => set({ nextFollowUpAt: event.target.value })}
                  onBlur={() => commit({ nextFollowUpAt: values.nextFollowUpAt })}
                />
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["1w", 7],
                      ["2w", 14],
                      ["1m", 30],
                    ] as const
                  ).map(([label, days]) => (
                    <Button key={label} variant="outline" size="xs" onClick={() => pingIn(days)}>
                      {label}
                    </Button>
                  ))}
                  {values.nextFollowUpAt && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground"
                      onClick={() => pingIn(null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-faint text-xs leading-snug">
                  Shows up with your follow-ups on the dashboard and the calendar.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Links</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactLinks
                values={values}
                onChange={(patch) => {
                  set(patch);
                  commit(patch);
                }}
              />
            </CardContent>
          </Card>

          {(company || application) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px]">Linked to</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {company && <CompanyChip company={company} logos={logos} />}
                {application && <LinkedJob application={application} />}
              </CardContent>
            </Card>
          )}

          {values.phone && (
            <p className="text-faint flex items-center gap-1.5 px-1 text-[12px]">
              <PhoneIcon className="size-3" /> {values.phone}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The role this person is attached to.
 *
 * It was the role's title as bare text, which told you nothing about whether
 * the thread was alive — and the posting it came from was unreachable from
 * here entirely. Now it reads as the job: where it has got to, where it is,
 * what it pays, when you next chase it, and a way through to the listing.
 */
function LinkedJob({ application }: { application: LinkedApplication }) {
  const posting = linkHref(application.jobUrl);
  const meta = [application.location, application.salaryRange].filter(Boolean).join(" · ");

  return (
    <div className="bg-inset rounded-control p-2">
      <div className="flex items-start gap-2">
        <BriefcaseIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
        <Link
          href={`/applications/${application.id}`}
          className="min-w-0 flex-1 text-[13px] font-medium hover:underline"
        >
          {application.roleTitle}
        </Link>
        <span
          className="stage-chip shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-medium"
          style={{ ["--tone" as string]: STAGE_TONE[application.stage] }}
        >
          {STAGE_LABEL[application.stage]}
        </span>
      </div>
      {(meta || application.nextFollowUpAt || posting) && (
        <div className="text-faint mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5.5 text-[11.5px]">
          {meta && <span className="truncate">{meta}</span>}
          {application.nextFollowUpAt && (
            <span>Chase {relativeDay(new Date(application.nextFollowUpAt))}</span>
          )}
          {posting && (
            <a
              href={posting}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-foreground ml-auto inline-flex items-center gap-1 transition-colors"
            >
              <ExternalLinkIcon className="size-3" /> Listing
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  placeholder,
  onChange,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  // Tie the label to the input: it makes the label clickable, and it is the
  // only thing that tells a screen reader which box "Website" belongs to.
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
      />
      {hint && <p className="text-faint text-xs leading-snug">{hint}</p>}
    </div>
  );
}
