import { asc, eq } from "drizzle-orm";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import { columns, comments, subtasks, tasks } from "@/app/db/schema";

async function getTaskWorkspace(taskId: number) {
  const [task] = await getDb()
    .select({ id: tasks.id, workspaceId: columns.workspaceId })
    .from(tasks)
    .innerJoin(columns, eq(tasks.columnId, columns.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  return task ?? null;
}

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const taskId = parseId(new URL(request.url).searchParams.get("taskId") ?? "");
    if (!taskId) return Response.json({ error: "A valid task id is required." }, { status: 400 });
    const task = await getTaskWorkspace(taskId);
    if (!task || !(await canAccessWorkspace(task.workspaceId, user.id))) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }
    const result = await getDb().select().from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.position), asc(subtasks.id));
    return Response.json({ subtasks: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Subtask details are required." }, { status: 400 });
    const { taskId: rawTaskId, title } = body as { taskId?: unknown; title?: unknown };
    const taskId = typeof rawTaskId === "number" && Number.isSafeInteger(rawTaskId) && rawTaskId > 0 ? rawTaskId : null;
    if (!taskId || typeof title !== "string" || !title.trim() || title.trim().length > 180) {
      return Response.json({ error: "Provide a valid task and a subtask title of up to 180 characters." }, { status: 400 });
    }
    const task = await getTaskWorkspace(taskId);
    if (!task || !(await canAccessWorkspace(task.workspaceId, user.id))) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }
    const db = getDb();
    const existing = await db.select({ id: subtasks.id }).from(subtasks).where(eq(subtasks.taskId, taskId));
    if (existing.length >= 50) return Response.json({ error: "A task can have at most 50 subtasks." }, { status: 400 });
    const [created] = await db.insert(subtasks).values({
      taskId,
      title: title.trim(),
      position: existing.length,
    }).returning();
    const [activity] = await db.insert(comments).values({
      taskId,
      userId: user.id,
      content: `${user.name ?? user.email ?? "Un usuario"} agregó la subtarea “${created.title}”.`,
      isActivity: true,
    }).returning();
    await publishWorkspaceEvent(task.workspaceId, "comment:created", {
      comment: { ...activity, userName: user.name ?? user.email ?? "Usuario", userImage: user.image ?? null, attachments: [] },
    });
    await publishWorkspaceEvent(task.workspaceId, "task:subtasks-updated", { taskId });
    return Response.json({ subtask: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Subtask id and changes are required." }, { status: 400 });
    const { id: rawId, title, completed } = body as { id?: unknown; title?: unknown; completed?: unknown };
    const id = typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null;
    if (!id || (title === undefined && completed === undefined)) {
      return Response.json({ error: "Provide a valid subtask id and at least one change." }, { status: 400 });
    }
    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 180)) {
      return Response.json({ error: "Subtask title must be between 1 and 180 characters." }, { status: 400 });
    }
    if (completed !== undefined && typeof completed !== "boolean") {
      return Response.json({ error: "Subtask completion must be a boolean." }, { status: 400 });
    }
    const db = getDb();
    const [existing] = await db.select({ id: subtasks.id, taskId: subtasks.taskId })
      .from(subtasks).where(eq(subtasks.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Subtask not found." }, { status: 404 });
    const task = await getTaskWorkspace(existing.taskId);
    if (!task || !(await canAccessWorkspace(task.workspaceId, user.id))) {
      return Response.json({ error: "Subtask not found." }, { status: 404 });
    }
    const values: Partial<typeof subtasks.$inferInsert> = {};
    if (title !== undefined) values.title = (title as string).trim();
    if (completed !== undefined) values.completed = completed as boolean;
    const [updated] = await db.update(subtasks).set(values).where(eq(subtasks.id, id)).returning();
    if (completed !== undefined) {
      const [event] = await db.insert(comments).values({
        taskId: existing.taskId,
        userId: user.id,
        content: `${user.name ?? user.email ?? "Un usuario"} ${completed ? "completó" : "reabrió"} la subtarea “${updated.title}”.`,
        isActivity: true,
      }).returning();
      await publishWorkspaceEvent(task.workspaceId, "comment:created", {
        comment: { ...event, userName: user.name ?? user.email ?? "Usuario", userImage: user.image ?? null, attachments: [] },
      });
    }
    await publishWorkspaceEvent(task.workspaceId, "task:subtasks-updated", { taskId: existing.taskId });
    return Response.json({ subtask: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const id = parseId(new URL(request.url).searchParams.get("id") ?? "");
    if (!id) return Response.json({ error: "A valid subtask id is required." }, { status: 400 });
    const db = getDb();
    const [existing] = await db.select({ id: subtasks.id, taskId: subtasks.taskId })
      .from(subtasks).where(eq(subtasks.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Subtask not found." }, { status: 404 });
    const task = await getTaskWorkspace(existing.taskId);
    if (!task || !(await canAccessWorkspace(task.workspaceId, user.id))) {
      return Response.json({ error: "Subtask not found." }, { status: 404 });
    }
    await db.delete(subtasks).where(eq(subtasks.id, id));
    const [activity] = await db.insert(comments).values({
      taskId: existing.taskId,
      userId: user.id,
      content: `${user.name ?? user.email ?? "Un usuario"} eliminó una subtarea.`,
      isActivity: true,
    }).returning();
    await publishWorkspaceEvent(task.workspaceId, "comment:created", {
      comment: { ...activity, userName: user.name ?? user.email ?? "Usuario", userImage: user.image ?? null, attachments: [] },
    });
    await publishWorkspaceEvent(task.workspaceId, "task:subtasks-updated", { taskId: existing.taskId });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
