import { auth } from "@/auth";
import type { UserRole } from "@/app/db/schema";
import { eq, and, inArray, or } from "drizzle-orm";
import { getDb } from "@/app/db";
import { workspaceMembers, workspaces } from "@/app/db/schema";

export function apiError(error: unknown) {
  console.error("Workspace API request failed:", error);
  return Response.json(
    { error: error instanceof Error ? error.message : "An unexpected error occurred." },
    { status: 500 },
  );
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      user: null,
      response: Response.json({ error: "Authentication is required." }, { status: 401 }),
    };
  }

  return { user: session.user, response: null };
}

export function requireRole(role: UserRole, actualRole: UserRole) {
  if (actualRole !== role) {
    return Response.json({ error: "You do not have permission to perform this action." }, { status: 403 });
  }
  return null;
}

export function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isPriority(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

export async function canAccessWorkspace(workspaceId: number, userId: string) {
  const [workspace] = await getDb()
    .select({ id: workspaces.id, isPrivate: workspaces.isPrivate, createdBy: workspaces.createdBy })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return false;
  if (!workspace.isPrivate || workspace.createdBy === userId) return true;
  const [membership] = await getDb()
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return Boolean(membership);
}

export async function getAccessibleWorkspaceIds(userId: string) {
  const memberships = await getDb()
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
  const visible = [eq(workspaces.isPrivate, false), eq(workspaces.createdBy, userId)];
  if (memberships.length) visible.push(inArray(workspaces.id, memberships.map(({ workspaceId }) => workspaceId)));
  const rows = await getDb().select({ id: workspaces.id }).from(workspaces).where(or(...visible));
  return new Set(rows.map(({ id }) => id));
}
