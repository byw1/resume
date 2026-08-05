import { redirect } from "next/navigation";
import { isAuthenticated, passwordIsConfigured } from "@/lib/auth";
import { Aurora } from "@/components/aurora";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");

  return (
    <>
      <Aurora intense />
      <main className="flex min-h-svh items-center justify-center p-6">
        <LoginForm configured={passwordIsConfigured()} />
      </main>
    </>
  );
}
