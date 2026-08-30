"use client";

import { useState, useTransition } from "react";
import { LoaderCircleIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { saveConfigAction } from "@/server/actions";

/**
 * What this instance is and how it behaves — the settings that belong to
 * nobody's integration. They used to sit inside the email panel, which made
 * the public URL look like a Resend field when it is what every invitation
 * link, published resume and webhook URL is built from.
 */
export function InstancePanel({
  settings,
}: {
  settings: { instanceName: string; publicUrl: string; companyLogos: boolean };
}) {
  const [values, setValues] = useState(settings);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      await saveConfigAction(values);
      toast.success("Saved");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <SettingsIcon className="text-muted-foreground size-4" />
          Instance
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="instance-name">Instance name</Label>
            <Input
              id="instance-name"
              value={values.instanceName}
              onChange={(event) => setValues({ ...values, instanceName: event.target.value })}
              placeholder="Hired"
            />
            <p className="text-muted-foreground text-xs">
              Shown on the sign-in page and in emails.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="public-url">Public URL</Label>
            <Input
              id="public-url"
              value={values.publicUrl}
              onChange={(event) => setValues({ ...values, publicUrl: event.target.value })}
              placeholder="https://your-app.up.railway.app"
            />
            <p className="text-muted-foreground text-xs">
              Used to build invitation links and the Stripe webhook URL.
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="company-logos">Company logos</Label>
            <p className="text-muted-foreground mt-1 text-xs">
              Shows each company&apos;s favicon in the pipeline. Fetching it means the browser
              asks twenty-icons.com for the logo, so that service can see which companies people
              here are tracking. Turn it off and everyone gets initials instead.
            </p>
          </div>
          <Switch
            id="company-logos"
            checked={values.companyLogos}
            onCheckedChange={(checked) => setValues({ ...values, companyLogos: checked })}
          />
        </div>

        <Button onClick={save} disabled={pending}>
          {pending && <LoaderCircleIcon className="animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
