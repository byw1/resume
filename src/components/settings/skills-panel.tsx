import { SparklesIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyBlock } from "@/components/settings/copy-block";
import type { Skill } from "@/lib/skills";

/**
 * The skills, on the screen where you wire up an assistant.
 *
 * They used to live on /docs, which is gone: everything else that page carried
 * is written out at docs.hired.tools and generated from the same tools array,
 * so two renderings of it was one rendering that could go stale. These files
 * could not move with the rest, because they are served by *this* instance —
 * byte-for-byte the copy in the repository it is running — and a static site
 * cannot hand you a zip built from a folder on someone else's server.
 *
 * Connections is the right home for what is left. Installing a skill is part of
 * setting an assistant up, not part of reading about one.
 */
export function SkillsPanel({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <SparklesIcon className="text-muted-foreground size-4" /> Skills
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-[13.5px] leading-relaxed">
        <p className="text-muted-foreground">
          A skill is a file that teaches Claude how to behave before you ask it anything. The ones
          below ship with your instance. The first is the one to install if you install only one —
          it carries the rules that keep a resume honest.
        </p>

        <div className="bg-inset shadow-hairline rounded-control px-3.5 py-3">
          <div className="mb-1.5 text-[13px] font-medium">Where they go</div>
          <ul className="text-muted-foreground space-y-1 text-[13px]">
            <li>
              <span className="text-foreground font-medium">Claude Code</span> —{" "}
              <code className="bg-card rounded px-1 py-0.5 font-mono text-[12px]">
                ~/.claude/skills/&lt;name&gt;/SKILL.md
              </code>{" "}
              for every project, or{" "}
              <code className="bg-card rounded px-1 py-0.5 font-mono text-[12px]">
                .claude/skills/
              </code>{" "}
              inside one.
            </li>
            <li>
              <span className="text-foreground font-medium">Claude apps</span> — Settings →
              Capabilities → Skills → upload the zip. The upload wants a folder, not a loose file,
              which is what the zip below already is.
            </li>
            <li>
              <span className="text-foreground font-medium">Anything else</span> — paste the
              contents in at the start of a conversation. Less tidy, same effect.
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          {skills.map((skill) => (
            <div key={skill.slug} className="space-y-2">
              <div>
                <div className="font-mono text-[13px] font-medium">{skill.name}</div>
                <p className="text-muted-foreground mt-0.5 text-[13px]">{skill.description}</p>
              </div>
              <CopyBlock
                body={skill.body}
                downloads={[
                  { href: `/docs/skills/${skill.slug}`, name: "SKILL.md", label: "SKILL.md" },
                  { href: `/docs/skills/${skill.slug}.zip`, name: `${skill.slug}.zip`, label: "Zip" },
                ]}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
