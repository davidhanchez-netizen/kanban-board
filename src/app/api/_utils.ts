import { auth } from "@/auth";
import type { UserRole } from "@/app/db/schema";

export function apiError(error: unknown) {
  console.error("Workspace API request failed:", error);
  return Response.json(
    { error: error instanceof Error ? error.message : "An unexpected error occurred." },
    { status: 500 },
  );
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      user: null,
      response: Response.json({ error: "Authentication is required." }, { status: 401 }),
    };
  }

  return { user: session.user, response: null };
}

export function requireRole(role: UserRole, actualRole: UserRole) {
  if (actualRole !== role) {
    return Response.json({ error: "You do not have permission to perform this action." }, { status: 403 });
  }
  return null;
}

export function parseId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isPriority(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}
