"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ExternalLinkIcon,
  FileTextIcon,
  LoaderCircleIcon,
  MailIcon,
  MoreVerticalIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { ActivityType, Stage } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveIndicator } from "@/components/save-indicator";
import { RatingInput } from "@/components/pipeline/rating-input";
import { useAutosave } from "@/hooks/use-autosave";
import { ACTIVITY_LABEL, STAGES, STAGE_LABEL, STAGE_TONE } from "@/lib/data/pipeline";
import { cn, relativeDay } from "@/lib/utils";
import {
  addActivityAction,
  createContactAction,
  createTaskAction,
  deleteApplicationAction,
  deleteContactAction,
  moveStageAction,
  toggleTaskAction,
  updateApplicationAction,
} from "@/server/actions";

type Application = {
  id: string;
  company: string;
  roleTitle: string;
  stage: Stage;
  jobUrl: string;
  jobDescription: string;
  location: string;
  workMode: string;
  salaryRange: string;
  source: string;
  excitement: number;
  fit: number;
  notes: string;
  appliedAt: string | null;
  nextFollowUpAt: string | null;
  resumeId: string | null;
};

type Activity = { id: string; type: ActivityType; body: string; occurredAt: string };
type Contact = {
  id: string;
  name: string;
  title: string;
  email: string;
  linkedin: string;
  relationship: string;
};
type Task = { id: string; title: string; done: boolean; dueAt: string | null };

const ACTIVITY_OPTIONS: ActivityType[] = [
  "NOTE",
  "EMAIL_SENT",
  "EMAIL_RECEIVED",
  "CALL",
  "INTERVIEW",
  "FOLLOW_UP",
  "REFERRAL",
];

export function ApplicationDetail({
  application,
  activities,
  contacts,
  tasks,
  resumes,
}: {
  application: Application;
  activities: Activity[];
  contacts: Contact[];
  tasks: Task[];
  resumes: { id: string; name: string }[];
}) {
  const [values, setValues] = useState({
    company: application.company,
    roleTitle: application.roleTitle,
    jobUrl: application.jobUrl,
    jobDescription: application.jobDescription,
    location: application.location,
    workMode: application.workMode,
    salaryRange: application.salaryRange,
    source: application.source,
    excitement: application.excitement,
    fit: application.fit,
    notes: application.notes,
    nextFollowUpAt: application.nextFollowUpAt ? application.nextFollowUpAt.slice(0, 10) : "",
    resumeId: application.resumeId ?? "",
  });
  const [stage, setStage] = useState(application.stage);
  const [, startTransition] = useTransition();

  const { state, push } = useAutosave<typeof values>((next) =>
    updateApplicationAction(application.id, {
      ...next,
      nextFollowUpAt: next.nextFollowUpAt || null,
      resumeId: next.resumeId || null,
    }),
  );

  const set = (patch: Partial<typeof values>) => {
    const next = { ...values, ...patch };
    setValues(next);
    push(next);
  };

  const changeStage = (next: Stage) => {
    setStage(next);
    startTransition(async () => {
      await moveStageAction(application.id, next);
      toast.success(`Moved to ${STAGE_LABEL[next]}`);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Input
            value={values.company}
            onChange={(event) => set({ company: event.target.value })}
            className="h-auto border-0 bg-transparent px-0 text-[27px] font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-[32px]"
          />
          <Input
            value={values.roleTitle}
            onChange={(event) => set({ roleTitle: event.target.value })}
            className="h-auto border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          <Select value={stage} onValueChange={(value) => changeStage(value as Stage)}>
            <SelectTrigger className="w-40">
              <span className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ background: STAGE_TONE[stage] }}
                />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((option) => (
                <SelectItem key={option} value={option}>
                  {STAGE_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {values.jobUrl && (
            <Button asChild variant="outline" size="icon">
              <a href={values.jobUrl} target="_blank" rel="noreferrer" aria-label="Open posting">
                <ExternalLinkIcon />
              </a>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  if (confirm(`Delete the ${values.company} application?`)) {
                    void deleteApplicationAction(application.id).then(() => {
                      window.location.href = "/applications";
                    });
                  }
                }}
              >
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Timeline applicationId={application.id} activities={activities} />

          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Job description</CardTitle>
              <p className="text-muted-foreground text-sm">
                Paste the full posting — this is what Claude tailors against.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={values.jobDescription}
                onChange={(event) => set({ jobDescription: event.target.value })}
                placeholder="Paste the posting here."
                className="min-h-56 font-mono text-[13px] leading-relaxed"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={values.notes}
                onChange={(event) => set({ notes: event.target.value })}
                placeholder="Anything you want to remember about this one."
                className="min-h-24"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Next follow-up</Label>
                <Input
                  type="date"
                  value={values.nextFollowUpAt}
                  onChange={(event) => set({ nextFollowUpAt: event.target.value })}
                />
                {values.nextFollowUpAt && (
                  <p className="text-muted-foreground text-xs">
                    {relativeDay(new Date(values.nextFollowUpAt))}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Resume used</Label>
                <div className="flex gap-2">
                  <Select
                    value={values.resumeId || "none"}
                    onValueChange={(value) => set({ resumeId: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {resumes.map((resume) => (
                        <SelectItem key={resume.id} value={resume.id}>
                          {resume.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {values.resumeId && (
                    <Button asChild variant="outline" size="icon">
                      <Link href={`/resumes/${values.resumeId}`} aria-label="Open resume">
                        <FileTextIcon />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input
                    value={values.location}
                    onChange={(event) => set({ location: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mode</Label>
                  <Input
                    value={values.workMode}
                    onChange={(event) => set({ workMode: event.target.value })}
                    placeholder="Remote"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Compensation</Label>
                <Input
                  value={values.salaryRange}
                  onChange={(event) => set({ salaryRange: event.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Source</Label>
                <Input
                  value={values.source}
                  onChange={(event) => set({ source: event.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Job link</Label>
                <Input
                  value={values.jobUrl}
                  onChange={(event) => set({ jobUrl: event.target.value })}
                  placeholder="https://…"
                />
              </div>

              <div className="space-y-2">
                <Label>Excitement</Label>
                <RatingInput value={values.excitement} onChange={(v) => set({ excitement: v })} />
              </div>
              <div className="space-y-2">
                <Label>Fit</Label>
                <RatingInput value={values.fit} onChange={(v) => set({ fit: v })} />
              </div>
            </CardContent>
          </Card>

          <TasksCard applicationId={application.id} tasks={tasks} />
          <ContactsCard applicationId={application.id} company={values.company} contacts={contacts} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Timeline({
  applicationId,
  activities,
}: {
  applicationId: string;
  activities: Activity[];
}) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [type, setType] = useState<ActivityType>("NOTE");

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    setBody("");
    startTransition(async () => {
      await addActivityAction({ applicationId, type, body: text });
      toast.success("Logged");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
            }}
            placeholder="Recruiter call went well — they want a system design round next week…"
            className="min-h-20"
          />
          <div className="flex items-center gap-2">
            <Select value={type} onValueChange={(value) => setType(value as ActivityType)}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ACTIVITY_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={submit} disabled={pending || !body.trim()} className="ml-auto">
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
              Log it
            </Button>
          </div>
        </div>

        {activities.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Nothing logged yet.</p>
        ) : (
          <ol className="relative space-y-4 pl-5">
            <span className="bg-border absolute top-1.5 bottom-1.5 left-[3px] w-px" />
            <AnimatePresence initial={false}>
              {activities.map((activity) => (
                <motion.li
                  key={activity.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative"
                >
                  <span className="bg-primary ring-background absolute top-1.5 -left-5 size-[7px] rounded-full ring-4" />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {ACTIVITY_LABEL[activity.type]}
                    </Badge>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {new Date(activity.occurredAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{activity.body}</p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TasksCard({ applicationId, tasks }: { applicationId: string; tasks: Task[] }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState<Set<string>>(new Set());

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    startTransition(async () => {
      await createTaskAction({ title, applicationId });
      toast.success("Task added");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && add()}
            placeholder="Send thank-you note"
          />
          <Button variant="outline" size="icon" onClick={add} disabled={pending || !draft.trim()}>
            <PlusIcon />
          </Button>
        </div>

        {tasks.length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-sm">No tasks.</p>
        ) : (
          <ul className="space-y-1">
            {tasks.map((task) => {
              const isDone = task.done || done.has(task.id);
              return (
                <li key={task.id} className="flex items-start gap-2.5 py-0.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={isDone}
                    onCheckedChange={(checked) => {
                      const next = Boolean(checked);
                      setDone((prev) => {
                        const copy = new Set(prev);
                        if (next) copy.add(task.id);
                        else copy.delete(task.id);
                        return copy;
                      });
                      void toggleTaskAction(task.id, next);
                    }}
                  />
                  <span
                    className={cn(
                      "text-[13px] leading-snug",
                      isDone && "text-muted-foreground line-through",
                    )}
                  >
                    {task.title}
                  </span>
                  {task.dueAt && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
                      {relativeDay(new Date(task.dueAt))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ContactsCard({
  applicationId,
  company,
  contacts,
}: {
  applicationId: string;
  company: string;
  contacts: Contact[];
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: "", title: "", email: "", relationship: "" });

  const add = () => {
    if (!form.name.trim()) return;
    startTransition(async () => {
      await createContactAction({ ...form, applicationId, company });
      setForm({ name: "", title: "", email: "", relationship: "" });
      setOpen(false);
      toast.success("Contact saved");
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-[15px]">People</CardTitle>
        <Button variant="ghost" size="xs" onClick={() => setOpen((value) => !value)}>
          <UserPlusIcon /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2 overflow-hidden"
            >
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Name"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Title"
                />
                <Input
                  value={form.relationship}
                  onChange={(event) => setForm({ ...form, relationship: event.target.value })}
                  placeholder="Recruiter"
                />
              </div>
              <Input
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                onKeyDown={(event) => event.key === "Enter" && add()}
                placeholder="Email"
              />
              <Button size="sm" onClick={add} disabled={pending || !form.name.trim()}>
                Save contact
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {contacts.filter((contact) => !removed.has(contact.id)).length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-sm">No one yet.</p>
        ) : (
          <ul className="space-y-2">
            {contacts
              .filter((contact) => !removed.has(contact.id))
              .map((contact) => (
                <li key={contact.id} className="group flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{contact.name}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {[contact.title, contact.relationship].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {contact.email && (
                    <Button asChild variant="ghost" size="icon-sm">
                      <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}>
                        <MailIcon />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => {
                      setRemoved((prev) => new Set(prev).add(contact.id));
                      void deleteContactAction(contact.id, applicationId);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
