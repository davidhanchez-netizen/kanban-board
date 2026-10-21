import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, canAccessWorkspace, getAccessibleWorkspaceIds, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import { columns, tasks, workspaces } from "@/app/db/schema";

export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const db = getDb();
    const result = await db.select().from(columns).orderBy(asc(columns.position), asc(columns.id));
    const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(user.id);
    const visible = result.filter((column) => accessibleWorkspaceIds.has(column.workspaceId));
    return Response.json({ columns: visible });
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
      return Response.json({ error: "A column name is required." }, { status: 400 });
    }
    const { name, workspaceId } = body as { name?: unknown; workspaceId?: unknown };
    if (typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "A column name is required." }, { status: 400 });
    }
    if (!Number.isSafeInteger(workspaceId) || (workspaceId as number) < 1) {
      return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    }

    const db = getDb();
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId as number)).limit(1);
    if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if (!(await canAccessWorkspace(workspace.id, user.id))) return Response.json({ error: "Workspace not found." }, { status: 404 });
    const [created] = await db
      .insert(columns)
      .values({
        name: name.trim(),
        workspace: workspace.name,
        workspaceId: workspace.id,
        position: Date.now(),
      })
      .returning();

    await publishWorkspaceEvent(created.workspaceId, "column:created", { column: created });
    revalidatePath("/");
    return Response.json({ column: created }, { status: 201 });
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
      return Response.json({ error: "A column id and name are required." }, { status: 400 });
    }
    const { id, name } = body as { id?: unknown; name?: unknown };
    if (!Number.isSafeInteger(id) || (id as number) < 1 || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "A valid column id and name are required." }, { status: 400 });
    }

    const [existing] = await getDb().select({ workspaceId: columns.workspaceId })
      .from(columns).where(eq(columns.id, id as number)).limit(1);
    if (!existing) return Response.json({ error: "Column not found." }, { status: 404 });
    if (!(await canAccessWorkspace(existing.workspaceId, user.id))) return Response.json({ error: "Column not found." }, { status: 404 });
    const [updated] = await getDb()
      .update(columns)
      .set({ name: name.trim() })
      .where(eq(columns.id, id as number))
      .returning();
    if (!updated) return Response.json({ error: "Column not found." }, { status: 404 });
    await publishWorkspaceEvent(updated.workspaceId, "column:updated", { column: updated });
    revalidatePath("/");
    return Response.json({ column: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) {
      return Response.json({ error: "A valid column id is required." }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select({ id: columns.id, workspaceId: columns.workspaceId })
      .from(columns)
      .where(eq(columns.id, id))
      .limit(1);
    if (!existing) return Response.json({ error: "Column not found." }, { status: 404 });
    if (!(await canAccessWorkspace(existing.workspaceId, user.id))) return Response.json({ error: "Column not found." }, { status: 404 });
    const [existingTask] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.columnId, id)).limit(1);
    if (existingTask) {
      return Response.json(
        { error: "Move or delete this column's tasks before deleting the column." },
        { status: 409 },
      );
    }
    const [deleted] = await db.delete(columns).where(eq(columns.id, id)).returning({ id: columns.id });
    if (!deleted) return Response.json({ error: "Column not found." }, { status: 404 });
    await publishWorkspaceEvent(existing.workspaceId, "column:deleted", { id: deleted.id });
    revalidatePath("/");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
