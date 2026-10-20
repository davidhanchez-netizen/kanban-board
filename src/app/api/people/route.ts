import { and, asc, eq } from "drizzle-orm";
import { apiError, parseId, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { columns, tasks, userPreferences, users, workspaces } from "@/app/db/schema";

export async function GET(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const workspaceId = parseId(new URL(request.url).searchParams.get("workspaceId") ?? "");
    if (!workspaceId) return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    const db = getDb();
    const [workspace] = await db.select({ id: workspaces.id })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });

    const [members, assignedTasks] = await Promise.all([
      db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: users.role,
        jobTitle: userPreferences.jobTitle,
        department: userPreferences.department,
        about: userPreferences.about,
        outOfOffice: userPreferences.outOfOffice,
      }).from(users)
        .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
        .orderBy(asc(users.name), asc(users.email)),
      db.select({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        columnId: tasks.columnId,
        assigneeId: tasks.assigneeId,
      }).from(tasks)
        .innerJoin(columns, eq(tasks.columnId, columns.id))
        .where(and(eq(columns.workspaceId, workspaceId), eq(tasks.completed, false)))
        .orderBy(asc(tasks.dueDate), asc(tasks.createdAt)),
    ]);
    return Response.json({
      people: members.map((member) => ({
        ...member,
        outOfOffice: member.outOfOffice ?? false,
        tasks: assignedTasks.filter((task) => task.assigneeId === member.id),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
