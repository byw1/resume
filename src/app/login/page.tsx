import { redirect } from "next/navigation";
import { getCurrentUser, instanceNeedsSetup } from "@/lib/auth";
import { getSettings, googleIsConfigured } from "@/lib/settings";
import { isGoogleRefusal, refusalMessage } from "@/lib/google";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await instanceNeedsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <LoginForm
          instanceName={settings.instanceName}
          googleReady={googleIsConfigured(settings)}
          openSignup={googleIsConfigured(settings) && settings.googleAllowSignup}
          allowedDomains={settings.googleAllowedDomains}
          notice={noticeFor(params.error, settings.googleAllowedDomains)}
        />
      </main>
  );
}

/**
 * A refusal reaches this page as a code in the URL, and is only ever rendered
 * by looking the code up. Anything unrecognised is dropped rather than shown —
 * `?error=` is reachable by anyone with a link, and a sign-in page that will
 * print a stranger's sentence in a warning box is a phishing page with extra
 * steps.
 *
 * The one interpolated value, the allowed-domain list, is read from this
 * instance's own settings here rather than carried in the URL, so there is no
 * path from a query string into the rendered sentence at all.
 */
function noticeFor(error: string | undefined, allowedDomains: string) {
  if (!error) return undefined;
  if (error === "google_off") return "Google sign-in is not set up here.";
  if (!isGoogleRefusal(error)) return undefined;
  return refusalMessage(error, allowedDomains);
}
