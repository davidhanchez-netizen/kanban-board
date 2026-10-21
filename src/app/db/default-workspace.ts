import { asc, eq } from "drizzle-orm";
import { getDb } from "@/app/db";
import { workspaceMembers, workspaces } from "@/app/db/schema";

export async function ensureDefaultWorkspaceMembership(userId: string) {
  const db = getDb();
  let [workspace] = await db.select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.isPrivate, false))
    .orderBy(asc(workspaces.id))
    .limit(1);

  if (!workspace) {
    const [created] = await db.insert(workspaces).values({
      name: "General / Primer Proyecto",
      description: "Workspace principal para organizar el trabajo.",
      isPrivate: false,
      createdBy: userId,
    }).onConflictDoNothing({ target: workspaces.name }).returning({ id: workspaces.id });
    workspace = created ?? (await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.isPrivate, false))
      .orderBy(asc(workspaces.id))
      .limit(1))[0];
  }

  if (!workspace) {
    const [created] = await db.insert(workspaces).values({
      name: `General / Primer Proyecto (${userId.slice(-12)})`,
      description: "Workspace principal para organizar el trabajo.",
      isPrivate: false,
      createdBy: userId,
    }).onConflictDoNothing({ target: workspaces.name }).returning({ id: workspaces.id });
    workspace = created;
  }

  if (!workspace) throw new Error("Unable to create or find the default workspace.");
  await db.insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId })
    .onConflictDoNothing();
  return workspace.id;
}
