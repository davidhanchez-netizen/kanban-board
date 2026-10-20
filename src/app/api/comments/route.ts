import { asc, eq } from "drizzle-orm";
import { apiError, parseId, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { comments, tasks, users } from "@/app/db/schema";

export async function GET(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const taskId = parseId(new URL(request.url).searchParams.get("taskId") ?? "");
    if (!taskId) return Response.json({ error: "A valid task id is required." }, { status: 400 });

    const db = getDb();
    const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });

    const result = await db
      .select({
        id: comments.id,
        taskId: comments.taskId,
        userId: comments.userId,
        content: comments.content,
        createdAt: comments.createdAt,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.taskId, taskId))
      .orderBy(asc(comments.createdAt), asc(comments.id));

    return Response.json({
      comments: result.map(({ userEmail, ...comment }) => ({
        ...comment,
        userName: comment.userName ?? userEmail ?? "Usuario",
      })),
    });
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
      return Response.json({ error: "Task id and comment content are required." }, { status: 400 });
    }
    const { taskId: rawTaskId, content } = body as { taskId?: unknown; content?: unknown };
    const taskId = typeof rawTaskId === "number" && Number.isSafeInteger(rawTaskId) && rawTaskId > 0
      ? rawTaskId
      : null;
    if (!taskId || typeof content !== "string" || !content.trim() || content.trim().length > 5000) {
      return Response.json({ error: "Provide a valid task id and a comment of up to 5000 characters." }, { status: 400 });
    }

    const db = getDb();
    const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });

    const [created] = await db
      .insert(comments)
      .values({ taskId, userId: user.id, content: content.trim() })
      .returning();

    return Response.json({
      comment: {
        ...created,
        userName: user.name ?? user.email ?? "Usuario",
        userImage: user.image ?? null,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
