import { CircleUserRoundIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/motion";
import {
  getProfile,
  listCertifications,
  listEducation,
  listNotes,
  listProjects,
  listRoles,
  listSkillGroups,
} from "@/lib/data/me";
import { requireUser } from "@/lib/auth";
import { RolesPanel } from "@/components/me/roles-panel";
import { ProfileForm } from "@/components/me/profile-form";
import { NotesPanel } from "@/components/me/notes-panel";
import { ExtrasPanel } from "@/components/me/extras-panel";
import { ImportDialog } from "@/components/me/import-dialog";
import { NewRoleDialog } from "@/components/me/new-role-dialog";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await requireUser();
  const [profile, roles, notes, education, projects, skills, certifications] = await Promise.all([
    getProfile(user.id),
    listRoles(user.id),
    listNotes(user.id),
    listEducation(user.id),
    listProjects(user.id),
    listSkillGroups(user.id),
    listCertifications(user.id),
  ]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Me"
        title="Everything about you"
        description="Everything you know about your own career. Dump it here raw and unfiltered — length is a feature. Claude reads all of it when it writes."
        actions={
          <>
            <ImportDialog />
            <NewRoleDialog />
          </>
        }
      />

      <Tabs defaultValue="roles">
        <TabsList className="mb-6">
          <TabsTrigger value="roles">
            <CircleUserRoundIcon /> Roles
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">{roles.length}</span>
          </TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notes">
            Notes
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">{notes.length}</span>
          </TabsTrigger>
          <TabsTrigger value="extras">Education &amp; more</TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <RolesPanel
            roles={roles.map((role) => ({
              id: role.id,
              company: role.company,
              title: role.title,
              location: role.location,
              startDate: role.startDate,
              endDate: role.endDate,
              isCurrent: role.isCurrent,
              summary: role.summary,
              tags: role.tags,
              backgroundLength: role.background.length,
              highlightCount: role._count.highlights,
            }))}
          />
        </TabsContent>

        <TabsContent value="profile">
          <FadeIn>
            <ProfileForm profile={profile} />
          </FadeIn>
        </TabsContent>

        <TabsContent value="notes">
          <FadeIn>
            <NotesPanel
              notes={notes.map((note) => ({
                id: note.id,
                title: note.title,
                body: note.body,
                tags: note.tags,
                pinned: note.pinned,
                kind: note.kind,
              }))}
            />
          </FadeIn>
        </TabsContent>

        <TabsContent value="extras">
          <FadeIn>
            <ExtrasPanel
              education={education}
              projects={projects.map((p) => ({
                id: p.id,
                name: p.name,
                role: p.role,
                url: p.url,
                description: p.description,
                tags: p.tags,
              }))}
              skills={skills}
              certifications={certifications}
            />
          </FadeIn>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
