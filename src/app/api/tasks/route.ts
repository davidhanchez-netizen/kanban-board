import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, canAccessWorkspace, getAccessibleWorkspaceIds, isPriority, requireRole, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { runTaskAutomations, runTaskDeletionAutomation } from "../agents/_automation";
import { getDb } from "@/app/db";
import { columns, comments, taskAssignees, tasks, users, workspaceMembers, workspaces } from "@/app/db/schema";

async function getAssignees(taskIds: number[]) {
  if (!taskIds.length) return new Map<number, { id: string; name: string; image: string | null }[]>();
  const rows = await getDb()
    .select({
      taskId: taskAssignees.taskId,
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(taskAssignees)
    .innerJoin(users, eq(taskAssignees.userId, users.id))
    .where(inArray(taskAssignees.taskId, taskIds));
  const result = new Map<number, { id: string; name: string; image: string | null }[]>();
  for (const row of rows) {
    const list = result.get(row.taskId) ?? [];
    list.push({ id: row.id, name: row.name ?? row.email ?? "Usuario", image: row.image });
    result.set(row.taskId, list);
  }

  return result;
}

async function areProjectAssignees(workspaceId: number, assigneeIds: string[]) {
  if (!assigneeIds.length) return true;
  const [workspace] = await getDb().select({ isPrivate: workspaces.isPrivate, createdBy: workspaces.createdBy })
    .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace?.isPrivate) return true;
  const memberships = await getDb().select({ userId: workspaceMembers.userId })
    .from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  const eligible = new Set([...memberships.map(({ userId }) => userId), ...(workspace.createdBy ? [workspace.createdBy] : [])]);
  return assigneeIds.every((id) => eligible.has(id));
}

function validDueDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const db = getDb();
    const query = db
      .select({ task: tasks, workspaceId: columns.workspaceId, assigneeName: users.name, assigneeEmail: users.email })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .orderBy(asc(tasks.createdAt), asc(tasks.id));
    const result = await query;
    const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(user.id);
    const visibleTasks = [];
    for (const row of result) {
      if (accessibleWorkspaceIds.has(row.workspaceId)) visibleTasks.push(row);
    }
    const assignees = await getAssignees(visibleTasks.map(({ task }) => task.id));
    return Response.json({
      tasks: visibleTasks.map(({ task, assigneeName, assigneeEmail }) => ({
        ...task,
        assigneeName: assigneeName ?? assigneeEmail ?? task.assignee,
        assignees: assignees.get(task.id) ?? [],
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Task details are required." }, { status: 400 });
    }
    const task = body as Record<string, unknown>;
    if (typeof task.title !== "string" || !task.title.trim() || task.title.trim().length > 180) {
      return Response.json({ error: "A task title of up to 180 characters is required." }, { status: 400 });
    }
    if (!Number.isSafeInteger(task.columnId) || (task.columnId as number) < 1) {
      return Response.json({ error: "Choose a valid destination column." }, { status: 400 });
    }
    if (task.priority !== undefined && !isPriority(task.priority)) {
      return Response.json({ error: "Choose a valid priority." }, { status: 400 });
    }
    if (task.description !== undefined && (typeof task.description !== "string" || task.description.length > 5000)) {
      return Response.json({ error: "Description must be text of up to 5,000 characters." }, { status: 400 });
    }
    if (task.assignee !== undefined && typeof task.assignee !== "string") {
      return Response.json({ error: "Assignee must be text." }, { status: 400 });
    }
    const assigneeIds = task.assigneeIds === undefined
      ? undefined
      : Array.isArray(task.assigneeIds) &&
        task.assigneeIds.length <= 20 &&
        task.assigneeIds.every((id) => typeof id === "string" && id.trim()) &&
        new Set(task.assigneeIds).size === task.assigneeIds.length
        ? task.assigneeIds as string[]
        : null;
    if (
      task.assigneeId !== undefined &&
      task.assigneeId !== null &&
      (typeof task.assigneeId !== "string" || !task.assigneeId.trim())
    ) {
      return Response.json({ error: "Choose a valid assignee." }, { status: 400 });
    }
    if (task.dueDate !== undefined && !validDueDate(task.dueDate)) {
      return Response.json({ error: "Due date must use YYYY-MM-DD format." }, { status: 400 });
    }
    if (assigneeIds === null) return Response.json({ error: "Choose up to 20 valid assignees." }, { status: 400 });

    const db = getDb();
    const assigneeId = assigneeIds !== undefined
      ? assigneeIds[0] ?? null
      : typeof task.assigneeId === "string" ? task.assigneeId.trim() : user.id;
    const finalAssigneeIds = assigneeIds ?? (assigneeId ? [assigneeId] : []);
    const matchedAssignees = finalAssigneeIds.length
      ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, finalAssigneeIds))
      : [];
    if (matchedAssignees.length !== finalAssigneeIds.length) {
      return Response.json({ error: "One or more assignees were not found." }, { status: 404 });
    }
    const [destination] = await db
      .select({ id: columns.id, workspaceId: columns.workspaceId })
      .from(columns)
      .where(eq(columns.id, task.columnId as number))
      .limit(1);
    if (!destination) return Response.json({ error: "Destination column not found." }, { status: 404 });
    if (!(await canAccessWorkspace(destination.workspaceId, user.id))) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if (!(await areProjectAssignees(destination.workspaceId, finalAssigneeIds))) {
      return Response.json({ error: "Only project members can be assigned to private project tasks." }, { status: 400 });
    }

    const [created] = await db
      .insert(tasks)
      .values({
        title: task.title.trim(),
        description: (task.description as string | undefined)?.trim() ?? "",
        priority: isPriority(task.priority) ? task.priority : "medium",
        columnId: task.columnId as number,
        assignee: matchedAssignees[0]
          ? matchedAssignees[0].name ?? matchedAssignees[0].email ?? "Member"
          : (task.assignee as string | undefined)?.trim() || "You",
        assigneeId,
        dueDate: (task.dueDate as string | null | undefined) ?? null,
      })
      .returning();
    if (finalAssigneeIds.length) {
      await db.insert(taskAssignees).values(finalAssigneeIds.map((userId) => ({ taskId: created.id, userId })));
    }
    const taskAfterAutomation = await runTaskAutomations(destination.workspaceId, created, "created");
    const taskWithAssignees = {
      ...taskAfterAutomation,
      assignees: await getAssignees([created.id]).then((items) => items.get(created.id) ?? []),
    };
    await publishWorkspaceEvent(destination.workspaceId, "task:created", { task: taskWithAssignees });
    const [activity] = await db.insert(comments).values({
      taskId: created.id,
      userId: user.id,
      content: `${user.name ?? user.email ?? "Un usuario"} creó la tarea.`,
      isActivity: true,
    }).returning();
    await publishWorkspaceEvent(destination.workspaceId, "comment:created", {
      comment: {
        ...activity,
        userName: user.name ?? user.email ?? "Usuario",
        userImage: user.image ?? null,
        attachments: [],
      },
    });
    revalidatePath("/");
    return Response.json({ task: taskWithAssignees }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Task id and update fields are required." }, { status: 400 });
    }
    const update = body as Record<string, unknown>;
    if (!Number.isSafeInteger(update.id) || (update.id as number) < 1) {
      return Response.json({ error: "A valid task id is required." }, { status: 400 });
    }
    const db = getDb();
    const [previous] = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        columnId: tasks.columnId,
        workspaceId: columns.workspaceId,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        completed: tasks.completed,
      })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(tasks.id, update.id as number))
      .limit(1);
    if (!previous) return Response.json({ error: "Task not found." }, { status: 404 });
    if (!(await canAccessWorkspace(previous.workspaceId, user.id))) return Response.json({ error: "Task not found." }, { status: 404 });

    const values: Partial<typeof tasks.$inferInsert> = {};
    const assigneeIds = update.assigneeIds === undefined
      ? undefined
      : Array.isArray(update.assigneeIds) &&
        update.assigneeIds.length <= 20 &&
        update.assigneeIds.every((id) => typeof id === "string" && id.trim()) &&
        new Set(update.assigneeIds).size === update.assigneeIds.length
        ? update.assigneeIds as string[]
        : null;
    if (assigneeIds === null) return Response.json({ error: "Choose up to 20 valid assignees." }, { status: 400 });
    if (update.title !== undefined) {
      if (typeof update.title !== "string" || !update.title.trim() || update.title.trim().length > 180) {
        return Response.json({ error: "A task title of up to 180 characters is required." }, { status: 400 });
      }
      values.title = update.title.trim();
    }
    if (update.description !== undefined) {
      if (typeof update.description !== "string" || update.description.length > 5000) {
        return Response.json({ error: "Description must be text of up to 5,000 characters." }, { status: 400 });
      }
      values.description = update.description.trim();
    }
    if (update.priority !== undefined) {
      if (!isPriority(update.priority)) return Response.json({ error: "Choose a valid priority." }, { status: 400 });
      values.priority = update.priority;
    }
    if (update.columnId !== undefined) {
      if (!Number.isSafeInteger(update.columnId) || (update.columnId as number) < 1) {
        return Response.json({ error: "Choose a valid destination column." }, { status: 400 });
      }
      const [destination] = await db
        .select({ id: columns.id })
        .from(columns)
        .where(eq(columns.id, update.columnId as number))
        .limit(1);
      if (!destination) return Response.json({ error: "Destination column not found." }, { status: 404 });
      const [destinationWorkspace] = await db.select({ workspaceId: columns.workspaceId })
        .from(columns).where(eq(columns.id, update.columnId as number)).limit(1);
      if (!destinationWorkspace || !(await canAccessWorkspace(destinationWorkspace.workspaceId, user.id))) {
        return Response.json({ error: "Destination workspace not found." }, { status: 404 });
      }
      values.columnId = update.columnId as number;
    }
    if (update.assignee !== undefined) {
      if (typeof update.assignee !== "string") return Response.json({ error: "Assignee must be text." }, { status: 400 });
      values.assignee = update.assignee.trim() || "You";
    }
    if (assigneeIds !== undefined) {
      const matchedAssignees = assigneeIds.length
        ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, assigneeIds))
        : [];
      if (matchedAssignees.length !== assigneeIds.length) {
        return Response.json({ error: "One or more assignees were not found." }, { status: 404 });
      }
      values.assigneeId = assigneeIds[0] ?? null;
      values.assignee = matchedAssignees[0]
        ? matchedAssignees[0].name ?? matchedAssignees[0].email ?? "Member"
        : "You";
    }
    if (update.assigneeId !== undefined && assigneeIds === undefined) {
      if (update.assigneeId !== null && (typeof update.assigneeId !== "string" || !update.assigneeId.trim())) {
        return Response.json({ error: "Choose a valid assignee." }, { status: 400 });
      }
      const assigneeId = typeof update.assigneeId === "string" ? update.assigneeId.trim() : null;
      const [assignee] = assigneeId
        ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, assigneeId)).limit(1)
        : [];
      if (assigneeId && !assignee) {
        return Response.json({ error: "Assignee not found." }, { status: 404 });
      }
      values.assigneeId = assigneeId;
      values.assignee = assignee ? assignee.name ?? assignee.email ?? "Member" : "You";
    }
    if (update.completed !== undefined) {
      if (typeof update.completed !== "boolean") {
        return Response.json({ error: "Completed must be a boolean." }, { status: 400 });
      }
      values.completed = update.completed;
    }
    if (update.dueDate !== undefined) {
      if (!validDueDate(update.dueDate)) {
        return Response.json({ error: "Due date must use YYYY-MM-DD format." }, { status: 400 });
      }
      values.dueDate = update.dueDate;
    }
    const assigneeIdsToSync = assigneeIds ?? (update.assigneeId !== undefined
      ? values.assigneeId ? [values.assigneeId] : []
      : undefined);
    const destinationWorkspaceId = values.columnId
      ? (await db.select({ workspaceId: columns.workspaceId }).from(columns).where(eq(columns.id, values.columnId)).limit(1))[0]?.workspaceId
      : previous.workspaceId;
    if (assigneeIdsToSync && destinationWorkspaceId && !(await areProjectAssignees(destinationWorkspaceId, assigneeIdsToSync))) {
      return Response.json({ error: "Only project members can be assigned to private project tasks." }, { status: 400 });
    }
    if (!Object.keys(values).length) return Response.json({ error: "No task fields to update." }, { status: 400 });

    const [updated] = await db
      .update(tasks)
      .set(values)
      .where(eq(tasks.id, update.id as number))
      .returning();
    if (!updated) return Response.json({ error: "Task not found." }, { status: 404 });
    if (assigneeIdsToSync !== undefined) {
      await db.delete(taskAssignees).where(eq(taskAssignees.taskId, updated.id));
      if (assigneeIdsToSync.length) {
        await db.insert(taskAssignees).values(assigneeIdsToSync.map((userId) => ({ taskId: updated.id, userId })));
      }
    }
    const [destination] = await db
      .select({ workspaceId: columns.workspaceId, name: columns.name })
      .from(columns)
      .where(eq(columns.id, updated.columnId))
      .limit(1);
    const activity: string[] = [];
    if (previous.columnId !== updated.columnId) {
      activity.push(`cambió el estado a ${destination?.name ?? "otra columna"}`);
    }
    if (previous.title !== updated.title) activity.push(`renombró la tarea a “${updated.title}”`);
    if (previous.priority !== updated.priority) {
      const labels = { high: "Alta", medium: "Media", low: "Baja" };
      activity.push(`cambió la prioridad a ${labels[updated.priority]}`);
    }
    if (previous.dueDate !== updated.dueDate) {
      activity.push(updated.dueDate ? `cambió la fecha límite a ${updated.dueDate}` : "quitó la fecha límite");
    }
    if (previous.completed !== updated.completed) {
      activity.push(updated.completed ? "marcó la tarea como completada" : "reabrió la tarea");
    }
    if (assigneeIdsToSync !== undefined) {
      const selected = assigneeIdsToSync.length
        ? await db.select({ name: users.name, email: users.email }).from(users).where(inArray(users.id, assigneeIdsToSync))
        : [];
      activity.push(selected.length
        ? `asignó la tarea a ${selected.map((item) => item.name ?? item.email ?? "un miembro").join(", ")}`
        : "quitó las asignaciones de la tarea");
    }
    if (activity.length) {
      const createdActivity = await db.insert(comments).values(activity.map((content) => ({
        taskId: updated.id,
        userId: user.id,
        content: `${user.name ?? user.email ?? "Un usuario"} ${content}.`,
        isActivity: true,
      }))).returning();
      await Promise.all(createdActivity.map((comment) => publishWorkspaceEvent(destination.workspaceId, "comment:created", {
        comment: {
          ...comment,
          userName: user.name ?? user.email ?? "Usuario",
          userImage: user.image ?? null,
          attachments: [],
        },
      })));
    }
    const taskAfterAutomation = await runTaskAutomations(
      destination.workspaceId,
      updated,
      "updated",
      previous.dueDate,
    );
    const taskWithAssignees = {
      ...taskAfterAutomation,
      assignees: await getAssignees([updated.id]).then((items) => items.get(updated.id) ?? []),
    };
    const eventName = previous.columnId === updated.columnId ? "task:updated" : "task:moved";
    const eventData = { task: taskWithAssignees, previousColumnId: previous.columnId };
    await publishWorkspaceEvent(destination.workspaceId, eventName, eventData);
    if (previous.workspaceId !== destination.workspaceId) {
      await publishWorkspaceEvent(previous.workspaceId, eventName, {
        id: updated.id,
        previousColumnId: previous.columnId,
        removed: true,
      });
    }
    revalidatePath("/");
    return Response.json({
      task: taskWithAssignees,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const forbidden = requireRole("ADMIN", user.role);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) {
      return Response.json({ error: "A valid task id is required." }, { status: 400 });
    }
    const db = getDb();
    const [existing] = await db
      .select({ id: tasks.id, columnId: tasks.columnId, workspaceId: columns.workspaceId })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(tasks.id, id))
      .limit(1);
    if (!existing) return Response.json({ error: "Task not found." }, { status: 404 });
    if (!(await canAccessWorkspace(existing.workspaceId, user.id))) return Response.json({ error: "Task not found." }, { status: 404 });
    const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
    if (!deleted) return Response.json({ error: "Task not found." }, { status: 404 });
    await runTaskDeletionAutomation(existing.workspaceId);
    await publishWorkspaceEvent(existing.workspaceId, "task:deleted", { id: deleted.id, columnId: existing.columnId });
    revalidatePath("/");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
