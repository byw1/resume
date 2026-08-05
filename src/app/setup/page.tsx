import { redirect } from "next/navigation";
import { instanceNeedsSetup, setupKeyIsRequired } from "@/lib/auth";
import { Aurora } from "@/components/aurora";
import { SetupForm } from "@/components/setup-form";

export const dynamic = "force-dynamic";

/**
 * First run. Whoever completes this becomes the super admin, so when
 * APP_PASSWORD is set we require it as a setup key — otherwise the first
 * stranger to find the URL could claim the instance.
 */
export default async function SetupPage() {
  if (!(await instanceNeedsSetup())) redirect("/login");

  return (
    <>
      <Aurora intense />
      <main className="flex min-h-svh items-center justify-center p-6">
        <SetupForm requiresKey={setupKeyIsRequired()} />
      </main>
    </>
  );
}
