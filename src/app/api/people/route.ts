import { and, asc, eq, inArray } from "drizzle-orm";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { columns, taskAssignees, tasks, userPreferences, users, workspaceMembers, workspaces } from "@/app/db/schema";

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const workspaceId = parseId(new URL(request.url).searchParams.get("workspaceId") ?? "");
    if (!workspaceId) return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    const db = getDb();
    const [workspace] = await db.select({ id: workspaces.id, isPrivate: workspaces.isPrivate, createdBy: workspaces.createdBy })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if (!(await canAccessWorkspace(workspaceId, user.id))) return Response.json({ error: "Workspace not found." }, { status: 404 });

    const projectMemberIds = workspace.isPrivate
      ? (await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId))).map(({ userId }) => userId)
      : null;
    const visibleMemberIds = projectMemberIds && workspace.createdBy
      ? [...new Set([...projectMemberIds, workspace.createdBy])]
      : projectMemberIds;
    const membersQuery = db.select({
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
        .leftJoin(userPreferences, eq(users.id, userPreferences.userId));
    const [members, assignedTasks, assigneeRows] = await Promise.all([
      visibleMemberIds?.length
        ? membersQuery.where(inArray(users.id, visibleMemberIds)).orderBy(asc(users.name), asc(users.email))
        : visibleMemberIds
          ? Promise.resolve([])
          : membersQuery.orderBy(asc(users.name), asc(users.email)),
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
      db.select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
        .from(taskAssignees)
        .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
        .innerJoin(columns, eq(tasks.columnId, columns.id))
        .where(and(eq(columns.workspaceId, workspaceId), eq(tasks.completed, false))),
    ]);
    const taskIdsByMember = new Map<string, Set<number>>();
    for (const assignment of assigneeRows) {
      const taskIds = taskIdsByMember.get(assignment.userId) ?? new Set<number>();
      taskIds.add(assignment.taskId);
      taskIdsByMember.set(assignment.userId, taskIds);
    }
    return Response.json({
      people: members.map((member) => ({
        ...member,
        outOfOffice: member.outOfOffice ?? false,
        tasks: assignedTasks.filter((task) =>
          task.assigneeId === member.id || taskIdsByMember.get(member.id)?.has(task.id),
        ),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
