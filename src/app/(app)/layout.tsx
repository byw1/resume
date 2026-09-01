import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";
import { followUpsDue } from "@/lib/data/pipeline";

export const dynamic = "force-dynamic";

/**
 * The chrome, and as little else as possible.
 *
 * This used to assemble the command palette's index too — three content
 * queries on every single navigation, for a dialog most navigations never
 * open, and three hand-written `where: { userId }` clauses outside
 * src/lib/data/. The palette fetches its own index when it opens now.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [followUps, profile] = await Promise.all([
    followUpsDue(user.id, 0),
    db.profile.findUnique({ where: { userId: user.id }, select: { photo: true } }),
  ]);

  return (
    <>
      <Shell
        followUpCount={followUps.length}
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
          photo: profile?.photo ?? "",
        }}
      >
        {children}
      </Shell>
    </>
  );
}
