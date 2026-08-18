"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, MailIcon, PhoneIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompanyAvatar } from "@/components/pipeline/company-avatar";
import { SaveIndicator } from "@/components/save-indicator";
import type { SaveState } from "@/hooks/use-autosave";
import { deleteCrmContactAction, saveContactAction } from "@/server/actions";

export type ContactFields = {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  relationship: string;
  notes: string;
  company: string;
};

export function ContactDetail({
  contact,
  companyId,
  application,
}: {
  contact: ContactFields;
  companyId: string | null;
  application: { id: string; roleTitle: string } | null;
}) {
  const [values, setValues] = useState(contact);
  const [state, setState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const router = useRouter();

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

  const remove = () =>
    startTransition(async () => {
      try {
        await deleteCrmContactAction(contact.id);
        router.push("/crm/contacts");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete that contact.");
      }
    });

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
          <div className="text-faint text-[12.5px]">
            {values.title || "No title set"}
            {values.company ? ` at ${values.company}` : ""}
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
          {values.linkedin && (
            <Button asChild variant="outline" size="icon-sm" aria-label="Open LinkedIn">
              <a
                href={values.linkedin.startsWith("http") ? values.linkedin : `https://${values.linkedin}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLinkIcon />
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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Title" value={values.title} placeholder="Engineering Manager" onChange={(title) => set({ title })} onCommit={() => commit({ title: values.title })} />
              <Field label="Company" value={values.company} placeholder="Stripe" onChange={(company) => set({ company })} onCommit={() => commit({ company: values.company })} hint="Creates the company if it does not exist yet." />
              <Field label="Relationship" value={values.relationship} placeholder="Recruiter" onChange={(relationship) => set({ relationship })} onCommit={() => commit({ relationship: values.relationship })} />
              <Field label="Email" value={values.email} placeholder="name@company.com" onChange={(email) => set({ email })} onCommit={() => commit({ email: values.email })} />
              <Field label="Phone" value={values.phone} placeholder="+1 555 0100" onChange={(phone) => set({ phone })} onCommit={() => commit({ phone: values.phone })} />
              <Field label="LinkedIn" value={values.linkedin} placeholder="linkedin.com/in/…" onChange={(linkedin) => set({ linkedin })} onCommit={() => commit({ linkedin: values.linkedin })} />
            </CardContent>
          </Card>

          {(companyId || application) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px]">Linked to</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {companyId && (
                  <Link
                    href={`/crm/companies/${companyId}`}
                    className="hover:bg-accent/50 -mx-2 flex items-center gap-2 rounded-control px-2 py-1.5 text-[13px] transition-colors duration-150"
                  >
                    {values.company}
                  </Link>
                )}
                {application && (
                  <Link
                    href={`/applications/${application.id}`}
                    className="hover:bg-accent/50 -mx-2 flex items-center gap-2 rounded-control px-2 py-1.5 text-[13px] transition-colors duration-150"
                  >
                    {application.roleTitle}
                  </Link>
                )}
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
