import { asc } from "drizzle-orm";
import { apiError, requireRole, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { users } from "@/app/db/schema";

export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const forbidden = requireRole("ADMIN", user.role);
    if (forbidden) return forbidden;
    const result = await getDb()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: users.role,
      })
      .from(users)
      .orderBy(asc(users.name), asc(users.email));

    return Response.json({ users: result });
  } catch (error) {
    return apiError(error);
  }
}
