import { redirect } from "next/navigation";
import { getCurrentUser, instanceNeedsSetup } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Aurora } from "@/components/aurora";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await instanceNeedsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const settings = await getSettings();

  return (
    <>
      <Aurora intense />
      <main className="flex min-h-svh items-center justify-center p-6">
        <LoginForm instanceName={settings.instanceName} />
      </main>
    </>
  );
}
