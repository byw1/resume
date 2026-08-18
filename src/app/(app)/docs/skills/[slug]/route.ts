import { getSkill } from "@/lib/skills";
import { requireUser } from "@/lib/auth";

/**
 * Hand over a skill file.
 *
 * Auth-gated like the rest of the app even though the contents are not secret —
 * an unauthenticated route on a personal instance is one more thing to reason
 * about, and there is no reason for this one to exist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const skill = await getSkill(slug);
  if (!skill) return new Response("Not found", { status: 404 });

  return new Response(skill.body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="SKILL.md"`,
      "Cache-Control": "no-store",
    },
  });
}
