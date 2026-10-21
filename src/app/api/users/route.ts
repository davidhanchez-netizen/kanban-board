import { asc, eq, inArray } from "drizzle-orm";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { users, workspaceMembers, workspaces } from "@/app/db/schema";

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const db = getDb();
    const workspaceParam = new URL(request.url).searchParams.get("workspaceId");
    let query = db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: users.role,
      })
      .from(users)
      .$dynamic();

    if (workspaceParam) {
      const workspaceId = parseId(workspaceParam);
      if (!workspaceId) return Response.json({ error: "A valid workspace id is required." }, { status: 400 });
      if (!(await canAccessWorkspace(workspaceId, user.id))) {
        return Response.json({ error: "Workspace not found." }, { status: 404 });
      }
      const [workspace] = await db.select({ isPrivate: workspaces.isPrivate, createdBy: workspaces.createdBy })
        .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (workspace?.isPrivate) {
        const memberRows = await db.select({ userId: workspaceMembers.userId })
          .from(workspaceMembers).where(inArray(workspaceMembers.workspaceId, [workspaceId]));
        const memberIds = [...new Set([workspace.createdBy, user.id, ...memberRows.map(({ userId }) => userId)]
          .filter((id): id is string => Boolean(id)))];
        query = query.where(inArray(users.id, memberIds));
      }
    } else {
      query = query.where(inArray(users.id, [user.id]));
    }
    const result = await query.orderBy(asc(users.name), asc(users.email));

    return Response.json({ users: result });
  } catch (error) {
    return apiError(error);
  }
}
