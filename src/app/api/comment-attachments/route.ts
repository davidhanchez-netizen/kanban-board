import { eq } from "drizzle-orm";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../_utils";
import { getDb } from "@/app/db";
import { columns, commentAttachments, comments, tasks } from "@/app/db/schema";

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const id = parseId(new URL(request.url).searchParams.get("id") ?? "");
    if (!id) return Response.json({ error: "A valid attachment id is required." }, { status: 400 });
    const [attachment] = await getDb()
      .select({
        fileName: commentAttachments.fileName,
        mimeType: commentAttachments.mimeType,
        data: commentAttachments.data,
        workspaceId: columns.workspaceId,
      })
      .from(commentAttachments)
      .innerJoin(comments, eq(commentAttachments.commentId, comments.id))
      .innerJoin(tasks, eq(comments.taskId, tasks.id))
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(commentAttachments.id, id))
      .limit(1);
    if (!attachment) return Response.json({ error: "Attachment not found." }, { status: 404 });
    if (!(await canAccessWorkspace(attachment.workspaceId, user.id))) return Response.json({ error: "Attachment not found." }, { status: 404 });

    const bytes = Buffer.from(attachment.data, "base64");
    const safeName = attachment.fileName
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\;]/g, "_");
    return new Response(bytes, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
