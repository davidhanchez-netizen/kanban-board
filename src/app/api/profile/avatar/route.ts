import { eq } from "drizzle-orm";
import { apiError, requireUser } from "../../_utils";
import { getDb } from "@/app/db";
import { users } from "@/app/db/schema";

export async function GET(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return Response.json({ error: "A user id is required." }, { status: 400 });

    const [profile] = await getDb()
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!profile) return Response.json({ error: "User not found." }, { status: 404 });
    return Response.json({ image: profile.image }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
