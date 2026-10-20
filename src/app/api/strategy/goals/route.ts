import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, parseId, requireUser } from "../../_utils";
import { publishWorkspaceEvent } from "../../_pusher";
import { getDb } from "@/app/db";
import { strategyGoals, workspaces } from "@/app/db/schema";

async function workspaceExists(workspaceId: number) {
  const [workspace] = await getDb()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return Boolean(workspace);
}

function validProgress(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000;
}

export async function GET(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const workspaceId = parseId(new URL(request.url).searchParams.get("workspaceId") ?? "");
    if (!workspaceId) return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    if (!(await workspaceExists(workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });
    const goals = await getDb().select().from(strategyGoals)
      .where(eq(strategyGoals.workspaceId, workspaceId))
      .orderBy(asc(strategyGoals.createdAt), asc(strategyGoals.id));
    return Response.json({ goals });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Goal details are required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const workspaceId = parseId(String(input.workspaceId ?? ""));
    if (!workspaceId || !(await workspaceExists(workspaceId))) return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 160) {
      return Response.json({ error: "Goal titles must be between 1 and 160 characters." }, { status: 400 });
    }
    if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 2000)) {
      return Response.json({ error: "Goal description must be text shorter than 2,000 characters." }, { status: 400 });
    }
    const target = input.target === undefined ? 100 : input.target;
    const current = input.current === undefined ? 0 : input.current;
    if (!validProgress(target) || target < 1 || !validProgress(current)) {
      return Response.json({ error: "Goal progress must be non-negative and the target must be greater than zero." }, { status: 400 });
    }
    const [goal] = await getDb().insert(strategyGoals).values({
      workspaceId,
      createdBy: user.id,
      title: input.title.trim(),
      description: typeof input.description === "string" ? input.description.trim() : "",
      target,
      current,
    }).returning();
    await publishWorkspaceEvent(workspaceId, "strategy:updated", { goalId: goal.id });
    revalidatePath("/");
    return Response.json({ goal }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ error: "Goal update is required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const id = parseId(String(input.id ?? ""));
    if (!id) return Response.json({ error: "Choose a valid goal." }, { status: 400 });
    const [existing] = await getDb().select().from(strategyGoals).where(eq(strategyGoals.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Goal not found." }, { status: 404 });
    const update: Partial<typeof strategyGoals.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) {
      if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 160) {
        return Response.json({ error: "Goal titles must be between 1 and 160 characters." }, { status: 400 });
      }
      update.title = input.title.trim();
    }
    if (input.description !== undefined) {
      if (typeof input.description !== "string" || input.description.length > 2000) {
        return Response.json({ error: "Goal description must be text shorter than 2,000 characters." }, { status: 400 });
      }
      update.description = input.description.trim();
    }
    if (input.current !== undefined) {
      if (!validProgress(input.current)) return Response.json({ error: "Current progress must be a non-negative integer." }, { status: 400 });
      update.current = input.current;
    }
    if (input.target !== undefined) {
      if (!validProgress(input.target) || input.target < 1) return Response.json({ error: "Target must be a positive integer." }, { status: 400 });
      update.target = input.target;
    }
    const [goal] = await getDb().update(strategyGoals).set(update).where(eq(strategyGoals.id, id)).returning();
    await publishWorkspaceEvent(existing.workspaceId, "strategy:updated", { goalId: goal.id });
    revalidatePath("/");
    return Response.json({ goal });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const id = parseId(new URL(request.url).searchParams.get("id") ?? "");
    if (!id) return Response.json({ error: "Choose a valid goal." }, { status: 400 });
    const [deleted] = await getDb().delete(strategyGoals).where(eq(strategyGoals.id, id)).returning();
    if (!deleted) return Response.json({ error: "Goal not found." }, { status: 404 });
    await publishWorkspaceEvent(deleted.workspaceId, "strategy:updated", { goalId: deleted.id });
    revalidatePath("/");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
