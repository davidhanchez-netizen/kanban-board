import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getTaskAssigneeIds, getTaskNotificationContext, notifyUsersForComment } from "../_notifications";
import { getDb } from "@/app/db";
import { columns, commentAttachments, comments, tasks, users, workspaceMembers, workspaces } from "@/app/db/schema";

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const taskId = parseId(new URL(request.url).searchParams.get("taskId") ?? "");
    if (!taskId) return Response.json({ error: "A valid task id is required." }, { status: 400 });

    const db = getDb();
    const [task] = await db
      .select({ id: tasks.id, workspaceId: columns.workspaceId })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
    if (!(await canAccessWorkspace(task.workspaceId, user.id))) return Response.json({ error: "Task not found." }, { status: 404 });

    const result = await db
      .select({
        id: comments.id,
        taskId: comments.taskId,
        userId: comments.userId,
        content: comments.content,
        isActivity: comments.isActivity,
        createdAt: comments.createdAt,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.taskId, taskId))
      .orderBy(asc(comments.createdAt), asc(comments.id));
    const attachmentRows = await db
      .select({
        id: commentAttachments.id,
        commentId: commentAttachments.commentId,
        fileName: commentAttachments.fileName,
        mimeType: commentAttachments.mimeType,
      })
      .from(commentAttachments)
      .innerJoin(comments, eq(commentAttachments.commentId, comments.id))
      .where(eq(comments.taskId, taskId))
      .orderBy(asc(commentAttachments.id));
    const attachmentsByComment = new Map<number, typeof attachmentRows>();
    for (const attachment of attachmentRows) {
      const list = attachmentsByComment.get(attachment.commentId) ?? [];
      list.push(attachment);
      attachmentsByComment.set(attachment.commentId, list);
    }

    return Response.json({
      comments: result.map(({ userEmail, ...comment }) => ({
        ...comment,
        userName: comment.userName ?? userEmail ?? "Usuario",
        attachments: attachmentsByComment.get(comment.id) ?? [],
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
    const { taskId: rawTaskId, content, attachmentsCount, mentions } = body as {
      taskId?: unknown;
      content?: unknown;
      attachmentsCount?: unknown;
      mentions?: unknown;
    };
    const taskId = typeof rawTaskId === "number" && Number.isSafeInteger(rawTaskId) && rawTaskId > 0
      ? rawTaskId
      : null;
    if (
      !taskId ||
      typeof content !== "string" ||
      content.trim().length > 5000 ||
      (!content.trim() && (!Number.isSafeInteger(attachmentsCount) || (attachmentsCount as number) < 1 || (attachmentsCount as number) > 5))
    ) {
      return Response.json({ error: "Provide a valid task id and comment text or up to 5 attachments." }, { status: 400 });
    }
    if (mentions !== undefined && (
      !Array.isArray(mentions) || mentions.length > 50 ||
      mentions.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(mentions).size !== mentions.length
    )) {
      return Response.json({ error: "Choose valid users to mention." }, { status: 400 });
    }

    const db = getDb();
    const [task] = await db
      .select({ id: tasks.id, workspaceId: columns.workspaceId })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return Response.json({ error: "Task not found." }, { status: 404 });
    if (!(await canAccessWorkspace(task.workspaceId, user.id))) return Response.json({ error: "Task not found." }, { status: 404 });

    const mentionIds = (mentions as string[] | undefined) ?? [];
    if (mentionIds.length) {
      const [workspace] = await db.select({ isPrivate: workspaces.isPrivate, createdBy: workspaces.createdBy })
        .from(workspaces).where(eq(workspaces.id, task.workspaceId)).limit(1);
      const allowedIds = workspace?.isPrivate
        ? [
            ...(await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
              .where(eq(workspaceMembers.workspaceId, task.workspaceId))).map(({ userId }) => userId),
            ...(workspace.createdBy ? [workspace.createdBy] : []),
          ]
        : (await db.select({ id: users.id }).from(users)).map(({ id }) => id);
      if (mentionIds.some((id) => !allowedIds.includes(id))) {
        return Response.json({ error: "Only project members can be mentioned in a private project." }, { status: 400 });
      }
    }

    const [created] = await db
      .insert(comments)
      .values({ taskId, userId: user.id, content: content.trim() })
      .returning();

    const comment = {
      ...created,
      userName: user.name ?? user.email ?? "Usuario",
      userImage: user.image ?? null,
      attachments: [],
    };
    await publishWorkspaceEvent(task.workspaceId, "comment:created", { comment });
    const notificationTask = await getTaskNotificationContext(taskId);
    if (notificationTask) {
      const assignees = await getTaskAssigneeIds(taskId);
      const recipients = [...new Set([
        ...assignees,
        ...(notificationTask.createdBy ? [notificationTask.createdBy] : []),
        ...mentionIds,
      ])];
      await notifyUsersForComment({
        recipientIds: recipients,
        mentionIds,
        authorId: user.id,
        authorName: user.name ?? user.email ?? "Usuario",
        workspaceId: task.workspaceId,
        task: notificationTask,
        comment: content.trim(),
      });
    }
    revalidatePath("/");
    return Response.json({
      comment,
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Comment id and content are required." }, { status: 400 });
    }
    const { id, content } = body as { id?: unknown; content?: unknown };
    if (!Number.isSafeInteger(id) || (id as number) < 1 || typeof content !== "string" || content.length > 5000) {
      return Response.json({ error: "Provide a valid comment id and content of up to 5000 characters." }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select({ userId: comments.userId, taskId: comments.taskId, workspaceId: columns.workspaceId })
      .from(comments)
      .innerJoin(tasks, eq(comments.taskId, tasks.id))
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(comments.id, id as number))
      .limit(1);
    if (!existing) return Response.json({ error: "Comment not found." }, { status: 404 });
    if (!(await canAccessWorkspace(existing.workspaceId, user.id))) return Response.json({ error: "Comment not found." }, { status: 404 });
    if (existing.userId !== user.id) {
      return Response.json({ error: "You can only edit your own comments." }, { status: 403 });
    }

    const [updated] = await db
      .update(comments)
      .set({ content })
      .where(eq(comments.id, id as number))
      .returning();
    await publishWorkspaceEvent(existing.workspaceId, "comment:updated", {
      comment: { ...updated, taskId: existing.taskId },
    });
    revalidatePath("/");
    return Response.json({ comment: updated });
  } catch (error) {
    return apiError(error);
  }
}
