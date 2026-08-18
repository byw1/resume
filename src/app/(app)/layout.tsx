import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Shell } from "@/components/shell";
import { followUpsDue } from "@/lib/data/pipeline";
import { dateRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [roles, resumes, applications, followUps] = await Promise.all([
    db.role.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30 }),
    db.resume.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30 }),
    db.application.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 40,
      include: { company: true },
    }),
    followUpsDue(user.id, 0),
  ]);

  const index = {
    roles: roles.map((role) => ({
      id: role.id,
      label: `${role.title} · ${role.company}`,
      sub: dateRange(role.startDate, role.endDate, role.isCurrent),
    })),
    resumes: resumes.map((resume) => ({
      id: resume.id,
      label: resume.name,
      sub: resume.targetCompany || resume.targetRole || "",
    })),
    applications: applications.map((application) => ({
      id: application.id,
      label: `${application.company.name} · ${application.roleTitle}`,
      sub: application.stage.toLowerCase(),
    })),
  };

  return (
    <>
      <Shell
        index={index}
        followUpCount={followUps.length}
        user={{ name: user.name, email: user.email, role: user.role }}
      >
        {children}
      </Shell>
    </>
  );
}
