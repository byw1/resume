"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
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
import { createCompanyAction } from "@/server/actions";

export function NewCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        const { id } = await createCompanyAction({ name: name.trim(), website: website.trim() });
        setOpen(false);
        setName("");
        setWebsite("");
        router.push(`/crm/companies/${id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add that company.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <PlusIcon /> Add a company
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a company</DialogTitle>
          <DialogDescription>
            Somewhere to keep research before there is an application. Applying to somewhere new
            creates its company for you, so this is for the ones you are still circling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="company-name">Name</Label>
            <Input
              id="company-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              placeholder="Stripe"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-website">Website</Label>
            <Input
              id="company-website"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              placeholder="stripe.com"
            />
            <p className="text-faint text-xs">Their own site — this is where the logo comes from.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={submit} disabled={pending || !name.trim()}>
            Add company
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
