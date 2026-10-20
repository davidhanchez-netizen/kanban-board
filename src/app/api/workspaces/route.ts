import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { workspaces } from "@/app/db/schema";

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
    if (!body || typeof body !== "object" || !("name" in body) || typeof body.name !== "string") {
      return Response.json({ error: "A workspace name is required." }, { status: 400 });
    }
    const name = body.name.trim();
    if (!name || name.length > 80) {
      return Response.json({ error: "Workspace names must be between 1 and 80 characters." }, { status: 400 });
    }

    const [created] = await getDb()
      .insert(workspaces)
      .values({ name, createdBy: user.id })
      .onConflictDoNothing({ target: workspaces.name })
      .returning();
    if (!created) return Response.json({ error: "A workspace with that name already exists." }, { status: 409 });

    revalidatePath("/");
    return Response.json({ workspace: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
