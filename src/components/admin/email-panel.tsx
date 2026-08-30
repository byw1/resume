"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  MailIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { saveConfigAction, sendTestEmailAction } from "@/server/actions";

export function EmailPanel({
  configured,
  settings,
  ownEmail,
}: {
  configured: boolean;
  settings: {
    resendApiKeyMasked: string;
    hasApiKey: boolean;
    resendFromEmail: string;
    resendFromName: string;
  };
  ownEmail: string;
}) {
  const [values, setValues] = useState({
    resendApiKey: "",
    resendFromEmail: settings.resendFromEmail,
    resendFromName: settings.resendFromName,
  });
  const [testTo, setTestTo] = useState(ownEmail);
  const [pending, startTransition] = useTransition();
  const [testing, startTesting] = useTransition();

  const save = () =>
    startTransition(async () => {
      await saveConfigAction(values);
      setValues((prev) => ({ ...prev, resendApiKey: "" }));
      toast.success("Email settings saved");
    });

  const test = () =>
    startTesting(async () => {
      const result = await sendTestEmailAction(testTo);
      if (result.ok) toast.success(`Test email sent to ${result.to}`);
      else toast.error(result.error, { duration: 8000 });
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div
              className={
                configured
                  ? "bg-success-tint text-success flex size-9 items-center justify-center rounded-xl"
                  : "bg-warning-tint text-warning flex size-9 items-center justify-center rounded-xl"
              }
            >
              {configured ? (
                <CheckCircle2Icon className="size-[18px]" />
              ) : (
                <TriangleAlertIcon className="size-[18px]" />
              )}
            </div>
            <div>
              <CardTitle className="text-[15px]">Resend</CardTitle>
              <p className="text-muted-foreground text-sm">
                {configured
                  ? `Invitations send from ${settings.resendFromEmail}`
                  : "Not configured — invitations have to be shared by hand"}
              </p>
            </div>
            <Badge variant={configured ? "success" : "warning"} className="ml-auto">
              {configured ? "Ready" : "Set up needed"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {!configured && (
            <ol className="space-y-2">
              {[
                <>
                  Create a free account at{" "}
                  <a
                    href="https://resend.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-0.5 underline underline-offset-2"
                  >
                    resend.com <ExternalLinkIcon className="size-3" />
                  </a>
                  .
                </>,
                <>Add and verify the domain you want to send from.</>,
                <>Create an API key and paste it below, with a from address on that domain.</>,
                <>Save, then send yourself a test to prove it works.</>,
              ].map((step, index) => (
                <li key={index} className="flex gap-3 text-sm">
                  <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Resend API key</Label>
              <Input
                type="password"
                value={values.resendApiKey}
                onChange={(event) => setValues({ ...values, resendApiKey: event.target.value })}
                placeholder={settings.hasApiKey ? settings.resendApiKeyMasked : "re_..."}
              />
              <p className="text-muted-foreground text-xs">
                {settings.hasApiKey
                  ? "A key is saved. Leave this blank to keep it, or paste a new one to replace it."
                  : "Starts with re_. Stored on your server and never shown again."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>From address</Label>
              <Input
                value={values.resendFromEmail}
                onChange={(event) => setValues({ ...values, resendFromEmail: event.target.value })}
                placeholder="hello@yourdomain.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>From name</Label>
              <Input
                value={values.resendFromName}
                onChange={(event) => setValues({ ...values, resendFromName: event.target.value })}
                placeholder="Hired"
              />
            </div>
          </div>

          <Button variant="default" onClick={save} disabled={pending}>
            {pending && <LoaderCircleIcon className="animate-spin" />}
            Save
          </Button>

          <Separator />

          <div className="space-y-2">
            <Label>Send a test email</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="you@example.com"
                className="min-w-[14rem] flex-1"
              />
              <Button variant="outline" onClick={test} disabled={testing}>
                {testing ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
                Send test
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              If it fails, the exact reason from Resend is shown — usually an unverified domain.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 pt-5">
          <MailIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground text-sm">
            Email is optional. Without it everything still works — creating an invitation gives you a
            link you can send however you like, and it stays valid for 14 days.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
