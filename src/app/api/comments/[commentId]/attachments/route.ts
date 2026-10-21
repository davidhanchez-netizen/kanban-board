import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../../../_utils";
import { getDb } from "@/app/db";
import { columns, commentAttachments, comments, tasks } from "@/app/db/schema";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
]);
const maxFileSize = 2 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const { commentId: rawCommentId } = await params;
    const commentId = parseId(rawCommentId);
    if (!commentId) return Response.json({ error: "A valid comment id is required." }, { status: 400 });

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "An attachment is required." }, { status: 400 });
    }
    const { fileName, mimeType, data } = body as {
      fileName?: unknown;
      mimeType?: unknown;
      data?: unknown;
    };
    if (
      typeof fileName !== "string" || !fileName.trim() || fileName.length > 255 ||
      typeof mimeType !== "string" || !allowedMimeTypes.has(mimeType) ||
      typeof data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
      Buffer.from(data, "base64").toString("base64") !== data
    ) {
      return Response.json({ error: "The attachment format is invalid or unsupported." }, { status: 400 });
    }

    const size = Buffer.byteLength(data, "base64");
    if (size === 0 || size > maxFileSize) {
      return Response.json({ error: "Attachments must be no larger than 2 MB." }, { status: 400 });
    }

    const db = getDb();
    const [comment] = await db.select({ id: comments.id, workspaceId: columns.workspaceId })
      .from(comments)
      .innerJoin(tasks, eq(comments.taskId, tasks.id))
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!comment) return Response.json({ error: "Comment not found." }, { status: 404 });
    if (!(await canAccessWorkspace(comment.workspaceId, user.id))) return Response.json({ error: "Comment not found." }, { status: 404 });
    const [attachmentCount] = await db
      .select({ value: count() })
      .from(commentAttachments)
      .where(eq(commentAttachments.commentId, commentId));
    if (attachmentCount.value >= 5) {
      return Response.json({ error: "A comment can have no more than 5 attachments." }, { status: 409 });
    }

    const [attachment] = await db
      .insert(commentAttachments)
      .values({ commentId, fileName: fileName.trim(), mimeType, data })
      .returning({
        id: commentAttachments.id,
        commentId: commentAttachments.commentId,
        fileName: commentAttachments.fileName,
        mimeType: commentAttachments.mimeType,
        createdAt: commentAttachments.createdAt,
      });

    revalidatePath("/");
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
