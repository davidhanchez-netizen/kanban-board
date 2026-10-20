import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import { workspaces } from "@/app/db/schema";

async function publishWorkspaceListUpdate() {
  const remaining = await getDb().select({ id: workspaces.id }).from(workspaces);
  await Promise.all(remaining.map(({ id }) =>
    publishWorkspaceEvent(id, "workspace:updated", {}),
  ));
}

export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const result = await getDb().select().from(workspaces).orderBy(asc(workspaces.name));
    return Response.json({ workspaces: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const body: unknown = await request.json();
    const workspace = parseWorkspaceInput(body);
    if (!workspace) return Response.json({ error: "Provide a valid workspace name, description, icon, and color." }, { status: 400 });

    const [created] = await getDb()
      .insert(workspaces)
      .values({ ...workspace, createdBy: user.id })
      .onConflictDoNothing({ target: workspaces.name })
      .returning();
    if (!created) return Response.json({ error: "A workspace with that name already exists." }, { status: 409 });

    await publishWorkspaceListUpdate();
    revalidatePath("/");
    return Response.json({ workspace: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

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
  return {
    name: input.name.trim(),
    description: description.trim(),
    icon: icon.trim(),
    color,
  };
}
