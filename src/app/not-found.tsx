import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Aurora } from "@/components/aurora";

export default function NotFound() {
  return (
    <>
      <Aurora />
      <main className="flex min-h-svh flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="text-gradient text-6xl font-semibold tracking-tight">404</div>
        <p className="text-muted-foreground max-w-sm">
          That page doesn&apos;t exist. It may have been deleted.
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to the dashboard</Link>
        </Button>
      </main>
    </>
  );
}
