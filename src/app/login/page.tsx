import { redirect } from "next/navigation";
import {
  SIGNED_IN_COOKIE,
  getCurrentUser,
  instanceNeedsSetup,
  signedInHintDomain,
} from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await instanceNeedsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const settings = await getSettings();
  // Whatever the landing page reads to decide you are signed in. There is no
  // session here, so the form's job on arrival is to take it back off.
  const hintDomain = await signedInHintDomain();

  return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <LoginForm
          instanceName={settings.instanceName}
          signedInHint={hintDomain ? { cookie: SIGNED_IN_COOKIE, domain: hintDomain } : null}
        />
      </main>
  );
}
