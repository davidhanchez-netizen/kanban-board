import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, parseId, requireUser } from "../../_utils";
import { publishWorkspaceEvent } from "../../_pusher";
import { getDb } from "@/app/db";
import { columns, tasks, workspaces } from "@/app/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

function parseWorkspaceInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) return null;
  const description = input.description === undefined ? "" : input.description;
  const icon = input.icon === undefined ? "briefcase" : input.icon;
  const color = input.color === undefined ? "#4f46e5" : input.color;
  if (typeof description !== "string" || description.length > 500) return null;
  if (typeof icon !== "string" || !icon.trim() || icon.length > 8) return null;
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  return { name: input.name.trim(), description: description.trim(), icon: icon.trim(), color };
}

async function publishWorkspaceListUpdate(additionalChannelId?: number) {
  const remaining = await getDb().select({ id: workspaces.id }).from(workspaces);
  const channelIds = new Set(remaining.map(({ id }) => id));
  if (additionalChannelId) channelIds.add(additionalChannelId);
  await Promise.all([...channelIds].map((id) => publishWorkspaceEvent(id, "workspace:updated", {})));
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return Response.json({ error: "A valid workspace id is required." }, { status: 400 });
    const workspace = parseWorkspaceInput(await request.json());
    if (!workspace) return Response.json({ error: "Provide a valid workspace name, description, icon, and color." }, { status: 400 });
    const [duplicate] = await getDb().select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.name, workspace.name), ne(workspaces.id, id)))
      .limit(1);
    if (duplicate) return Response.json({ error: "A workspace with that name already exists." }, { status: 409 });

    const [updated] = await getDb().update(workspaces)
      .set(workspace)
      .where(eq(workspaces.id, id))
      .returning();
    if (!updated) return Response.json({ error: "Workspace not found." }, { status: 404 });
    await publishWorkspaceListUpdate(id);
    revalidatePath("/");
    return Response.json({ workspace: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return Response.json({ error: "A valid workspace id is required." }, { status: 400 });
    const db = getDb();
    const [workspace] = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });

    const [workspaceTask] = await db.select({ id: tasks.id })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(columns.workspaceId, id))
      .limit(1);
    if (workspaceTask) {
      return Response.json(
        { error: "Move or delete all tasks in this workspace before deleting it. This protects existing task and comment history." },
        { status: 409 },
      );
    }

    const [deleted] = await db.delete(workspaces).where(and(eq(workspaces.id, id), sql`not exists (
      select 1 from ${columns}
      inner join ${tasks} on ${tasks.columnId} = ${columns.id}
      where ${columns.workspaceId} = ${workspaces.id}
    )`)).returning({ id: workspaces.id });
    if (!deleted) {
      return Response.json({ error: "Workspace is no longer empty and cannot be deleted." }, { status: 409 });
    }
    await publishWorkspaceListUpdate(id);
    revalidatePath("/");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
