import { getSkill } from "@/lib/skills";
import { requireUser } from "@/lib/auth";
import { zip } from "@/lib/zip";

/**
 * Hand over a skill file.
 *
 * Auth-gated like the rest of the app even though the contents are not secret —
 * an unauthenticated route on a personal instance is one more thing to reason
 * about, and there is no reason for this one to exist.
 *
 * Two shapes, one route. `/docs/skills/hired` is the raw SKILL.md, which is what
 * Claude Code wants on disk. `/docs/skills/hired.zip` is the same file inside a
 * folder named after the skill, which is what Claude's apps want at the upload
 * box — the folder is the part people get wrong when they zip it themselves.
 *
 * The page these were linked from is gone; the links live on Settings →
 * Connections now. The path stays as it is because it is what people have
 * bookmarked, and because /docs redirects to the manual rather than 404ing,
 * which would otherwise have swallowed these.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;

  const asZip = slug.endsWith(".zip");
  const skill = await getSkill(asZip ? slug.slice(0, -4) : slug);
  if (!skill) return new Response("Not found", { status: 404 });

  if (asZip) {
    const bytes = zip([{ path: `${skill.slug}/SKILL.md`, contents: skill.body }]);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${skill.slug}.zip"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(skill.body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="SKILL.md"`,
      "Cache-Control": "no-store",
    },
  });
}
