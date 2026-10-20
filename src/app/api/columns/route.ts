import { asc, eq } from "drizzle-orm";
import { apiError, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { columns, tasks } from "@/app/db/schema";

const workspaces = ["Producto", "Marketing", "Operaciones"];

export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const db = getDb();
    const result = await db.select().from(columns).orderBy(asc(columns.position), asc(columns.id));
    return Response.json({ columns: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "A column name is required." }, { status: 400 });
    }
    const { name, workspace } = body as { name?: unknown; workspace?: unknown };
    if (typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "A column name is required." }, { status: 400 });
    }
    if (workspace !== undefined && (typeof workspace !== "string" || !workspaces.includes(workspace))) {
      return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    }

    const db = getDb();
    const [created] = await db
      .insert(columns)
      .values({
        name: name.trim(),
        workspace: (workspace as string | undefined) ?? workspaces[0],
        position: Date.now(),
      })
      .returning();

    return Response.json({ column: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "A column id and name are required." }, { status: 400 });
    }
    const { id, name } = body as { id?: unknown; name?: unknown };
    if (!Number.isSafeInteger(id) || (id as number) < 1 || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "A valid column id and name are required." }, { status: 400 });
    }

    const [updated] = await getDb()
      .update(columns)
      .set({ name: name.trim() })
      .where(eq(columns.id, id as number))
      .returning();
    if (!updated) return Response.json({ error: "Column not found." }, { status: 404 });
    return Response.json({ column: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) {
      return Response.json({ error: "A valid column id is required." }, { status: 400 });
    }

    const db = getDb();
    const [existingTask] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.columnId, id)).limit(1);
    if (existingTask) {
      return Response.json(
        { error: "Move or delete this column's tasks before deleting the column." },
        { status: 409 },
      );
    }
    const [deleted] = await db.delete(columns).where(eq(columns.id, id)).returning({ id: columns.id });
    if (!deleted) return Response.json({ error: "Column not found." }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
