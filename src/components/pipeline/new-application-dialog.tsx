"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LoaderCircleIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { BOARD_STAGES, STAGE_LABEL } from "@/lib/data/pipeline";
import type { Stage } from "@prisma/client";
import { createApplicationAction } from "@/server/actions";
import { RatingInput } from "@/components/pipeline/rating-input";

export function NewApplicationDialog({ resumes }: { resumes: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    company: "",
    roleTitle: "",
    stage: "WISHLIST" as Stage,
    jobUrl: "",
    location: "",
    salaryRange: "",
    source: "",
    excitement: 3,
    jobDescription: "",
    resumeId: "",
  });

  useEffect(() => {
    if (params.get("new")) setOpen(true);
  }, [params]);

  const submit = () => {
    if (!form.company.trim() || !form.roleTitle.trim()) {
      toast.error("Company and role are required.");
      return;
    }
    startTransition(async () => {
      const id = await createApplicationAction({
        ...form,
        resumeId: form.resumeId || null,
      });
      setOpen(false);
      toast.success("Tracking it");
      router.push(`/applications/${id}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <PlusIcon /> Track a job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Track a job</DialogTitle>
          <DialogDescription>
            Paste the posting in and Claude can tailor a resume against it later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Company</Label>
            <Input
              autoFocus
              value={form.company}
              onChange={(event) => setForm({ ...form, company: event.target.value })}
              placeholder="Stripe"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Input
              value={form.roleTitle}
              onChange={(event) => setForm({ ...form, roleTitle: event.target.value })}
              placeholder="Staff Engineer, Payments"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select
              value={form.stage}
              onValueChange={(value) => setForm({ ...form, stage: value as Stage })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOARD_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {STAGE_LABEL[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Resume used</Label>
            <Select
              value={form.resumeId || "none"}
              onValueChange={(value) => setForm({ ...form, resumeId: value === "none" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="None yet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None yet</SelectItem>
                {resumes.map((resume) => (
                  <SelectItem key={resume.id} value={resume.id}>
                    {resume.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="Remote (US)"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Compensation</Label>
            <Input
              value={form.salaryRange}
              onChange={(event) => setForm({ ...form, salaryRange: event.target.value })}
              placeholder="$180k – $230k"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Job link</Label>
            <Input
              value={form.jobUrl}
              onChange={(event) => setForm({ ...form, jobUrl: event.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Input
              value={form.source}
              onChange={(event) => setForm({ ...form, source: event.target.value })}
              placeholder="LinkedIn, referral from Dana…"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>How much do you want this?</Label>
            <RatingInput
              value={form.excitement}
              onChange={(excitement) => setForm({ ...form, excitement })}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Job description</Label>
            <Textarea
              value={form.jobDescription}
              onChange={(event) => setForm({ ...form, jobDescription: event.target.value })}
              placeholder="Paste the whole posting here."
              className="min-h-28"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={submit} disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            Track it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
