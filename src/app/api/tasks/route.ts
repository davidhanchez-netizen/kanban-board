import { asc, eq } from "drizzle-orm";
import { apiError, isPriority } from "../_utils";
import { getDb } from "@/app/db";
import { columns, tasks } from "@/app/db/schema";

function validDueDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET() {
  try {
    const result = await getDb()
      .select()
      .from(tasks)
      .orderBy(asc(tasks.createdAt), asc(tasks.id));
    return Response.json({ tasks: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Task details are required." }, { status: 400 });
    }
    const task = body as Record<string, unknown>;
    if (typeof task.title !== "string" || !task.title.trim()) {
      return Response.json({ error: "A task title is required." }, { status: 400 });
    }
    if (!Number.isSafeInteger(task.columnId) || (task.columnId as number) < 1) {
      return Response.json({ error: "Choose a valid destination column." }, { status: 400 });
    }
    if (task.priority !== undefined && !isPriority(task.priority)) {
      return Response.json({ error: "Choose a valid priority." }, { status: 400 });
    }
    if (task.description !== undefined && typeof task.description !== "string") {
      return Response.json({ error: "Description must be text." }, { status: 400 });
    }
    if (task.assignee !== undefined && typeof task.assignee !== "string") {
      return Response.json({ error: "Assignee must be text." }, { status: 400 });
    }
    if (task.dueDate !== undefined && !validDueDate(task.dueDate)) {
      return Response.json({ error: "Due date must use YYYY-MM-DD format." }, { status: 400 });
    }

    const db = getDb();
    const [destination] = await db
      .select({ id: columns.id })
      .from(columns)
      .where(eq(columns.id, task.columnId as number))
      .limit(1);
    if (!destination) return Response.json({ error: "Destination column not found." }, { status: 404 });

    const [created] = await db
      .insert(tasks)
      .values({
        title: task.title.trim(),
        description: (task.description as string | undefined)?.trim() ?? "",
        priority: isPriority(task.priority) ? task.priority : "medium",
        columnId: task.columnId as number,
        assignee: (task.assignee as string | undefined)?.trim() || "You",
        dueDate: (task.dueDate as string | null | undefined) ?? null,
      })
      .returning();
    return Response.json({ task: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Task id and update fields are required." }, { status: 400 });
    }
    const update = body as Record<string, unknown>;
    if (!Number.isSafeInteger(update.id) || (update.id as number) < 1) {
      return Response.json({ error: "A valid task id is required." }, { status: 400 });
    }
    const values: Partial<typeof tasks.$inferInsert> = {};
    if (update.title !== undefined) {
      if (typeof update.title !== "string" || !update.title.trim()) {
        return Response.json({ error: "A task title is required." }, { status: 400 });
      }
      values.title = update.title.trim();
    }
    if (update.description !== undefined) {
      if (typeof update.description !== "string") {
        return Response.json({ error: "Description must be text." }, { status: 400 });
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
      const [destination] = await getDb()
        .select({ id: columns.id })
        .from(columns)
        .where(eq(columns.id, update.columnId as number))
        .limit(1);
      if (!destination) return Response.json({ error: "Destination column not found." }, { status: 404 });
      values.columnId = update.columnId as number;
    }
    if (update.assignee !== undefined) {
      if (typeof update.assignee !== "string") return Response.json({ error: "Assignee must be text." }, { status: 400 });
      values.assignee = update.assignee.trim() || "You";
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
    if (!Object.keys(values).length) return Response.json({ error: "No task fields to update." }, { status: 400 });

    const [updated] = await getDb()
      .update(tasks)
      .set(values)
      .where(eq(tasks.id, update.id as number))
      .returning();
    if (!updated) return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json({ task: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) {
      return Response.json({ error: "A valid task id is required." }, { status: 400 });
    }
    const [deleted] = await getDb().delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
    if (!deleted) return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
