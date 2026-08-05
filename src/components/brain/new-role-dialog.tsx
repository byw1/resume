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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createRoleAction } from "@/server/actions";

export function NewRoleDialog() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    brainDump: "",
  });

  useEffect(() => {
    if (params.get("new") === "role") setOpen(true);
  }, [params]);

  const submit = () => {
    if (!form.company.trim() || !form.title.trim()) {
      toast.error("Company and title are required.");
      return;
    }
    startTransition(async () => {
      const id = await createRoleAction(form);
      setOpen(false);
      setForm({
        company: "",
        title: "",
        location: "",
        startDate: "",
        endDate: "",
        isCurrent: false,
        brainDump: "",
      });
      toast.success("Role added");
      router.push(`/brain/${id}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gradient">
          <PlusIcon /> Add role
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a role</DialogTitle>
          <DialogDescription>
            Just the shell is fine — you can dump the detail in afterwards, or let Claude do it.
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
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Senior Software Engineer"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="Remote"
            />
          </div>
          <div className="flex items-end gap-3 pb-2">
            <div className="flex items-center gap-2">
              <Switch
                id="current"
                checked={form.isCurrent}
                onCheckedChange={(checked) => setForm({ ...form, isCurrent: checked })}
              />
              <Label htmlFor="current">Current job</Label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Started</Label>
            <Input
              type="month"
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ended</Label>
            <Input
              type="month"
              value={form.endDate}
              disabled={form.isCurrent}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>First dump (optional)</Label>
            <Textarea
              value={form.brainDump}
              onChange={(event) => setForm({ ...form, brainDump: event.target.value })}
              placeholder="What did you actually do here? Numbers, projects, stories — anything."
              className="min-h-28"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="gradient" onClick={submit} disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            Create role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
