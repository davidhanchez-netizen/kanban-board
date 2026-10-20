import { asc } from "drizzle-orm";
import { apiError, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { users } from "@/app/db/schema";

export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const result = await getDb()
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(asc(users.name), asc(users.email));

    return Response.json({
      members: result.map(({ id, name, email }) => ({ id, name: name ?? email ?? "Usuario" })),
    });
  } catch (error) {
    return apiError(error);
  }
}
