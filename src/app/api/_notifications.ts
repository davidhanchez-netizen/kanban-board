import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/app/db";
import { columns, notifications, taskAssignees, tasks, userPreferences, users, workspaces } from "@/app/db/schema";
import { publishUserEvent } from "./_pusher";

export type NotificationType = "assigned" | "comment" | "status_change";

type NotificationTask = {
  id: number;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
};

export async function notifyTaskUsers(input: {
  recipientIds: string[];
  actorId: string;
  actorName: string;
  type: NotificationType;
  title?: string;
  workspaceId: number;
  task: NotificationTask;
  message: string;
}) {
  const recipientIds = [...new Set(input.recipientIds.filter((id) => id !== input.actorId))];
  if (!recipientIds.length) return;
  const db = getDb();
  const recipients = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    settings: userPreferences.settings,
  })
    .from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(inArray(users.id, recipientIds));
  if (!recipients.length) return;

  const title = input.title ?? (input.type === "assigned"
    ? "Te asignaron una tarea"
    : input.type === "status_change"
      ? "Cambió el estado de una tarea"
      : "Nueva actividad en una tarea");
  const rows = await db.insert(notifications).values(recipients.map((recipient) => ({
    userId: recipient.id,
    actorId: input.actorId,
    title,
    message: input.message,
    type: input.type,
    entityType: "task",
    entityId: input.task.id,
    workspaceId: input.workspaceId,
  }))).returning();

  await Promise.all(rows.map((notification) =>
    publishUserEvent(notification.userId, "notification:created", { notification }),
  ));

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!appUrl || !apiKey || !from) return;

  const workspace = await db.select({ name: workspaces.name })
    .from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  const taskUrl = `${appUrl}/?workspaceId=${input.workspaceId}&taskId=${input.task.id}`;
  const safe = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character] ?? character);
  await Promise.all(recipients.map(async (recipient) => {
    const settings = recipient.settings;
    if (!recipient.email || !settings || typeof settings !== "object" ||
      !("emailNotifications" in settings) || settings.emailNotifications !== true) return;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [recipient.email],
          subject: `${title}: ${input.task.title}`,
          html: `<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:auto;padding:24px"><div style="background:#111827;color:#f8fafc;padding:20px;border-radius:12px"><p style="margin:0;color:#c4b5fd;font-size:12px">UNDER CONTROL · ${safe(workspace[0]?.name ?? "Proyecto")}</p><h1 style="font-size:22px;margin:12px 0 0">${safe(input.task.title)}</h1></div><p style="margin:20px 0 8px">${safe(input.actorName)} ${safe(input.message)}</p><p style="white-space:pre-wrap;color:#475569">${safe(input.task.description || "Sin descripción.")}</p><p style="color:#64748b;font-size:13px">Prioridad: <strong>${safe(input.task.priority)}</strong> · Fecha límite: <strong>${input.task.dueDate ? safe(input.task.dueDate) : "Sin fecha"}</strong></p><a href="${safe(taskUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Abrir tarea</a></div>`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.error("Resend rejected task notification email:", response.status, await response.text());
      }
    } catch (error) {
      console.error("Unable to deliver task notification email:", error);
    }
  }));
}

export async function getTaskNotificationContext(taskId: number) {
  const [task] = await getDb().select({
    id: tasks.id,
    title: tasks.title,
    description: tasks.description,
    priority: tasks.priority,
    dueDate: tasks.dueDate,
    assigneeId: tasks.assigneeId,
    createdBy: tasks.createdBy,
    workspaceId: workspaces.id,
  }).from(tasks)
    .innerJoin(columns, eq(tasks.columnId, columns.id))
    .innerJoin(workspaces, eq(columns.workspaceId, workspaces.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  return task ?? null;
}

export async function getTaskAssigneeIds(taskId: number) {
  const [task] = await getDb().select({ assigneeId: tasks.assigneeId })
    .from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return [...new Set([
    ...(task?.assigneeId ? [task.assigneeId] : []),
    ...(await getDb().select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId))).map(({ userId }) => userId),
  ])];
}

export async function listUserNotifications(userId: string, unreadOnly: boolean) {
  const db = getDb();
  const query = db.select().from(notifications).where(unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(50);
  return query;
}

export async function notifyUsersForComment(input: {
  recipientIds: string[];
  mentionIds: string[];
  authorId: string;
  authorName: string;
  workspaceId: number;
  task: NotificationTask;
  comment: string;
}) {
  const commentExcerpt = input.comment.trim().slice(0, 240);
  const mentioned = [...new Set(input.mentionIds.filter((id) => id !== input.authorId))];
  const mentionedSet = new Set(mentioned);
  const recipients = [...new Set(input.recipientIds.filter((id) => id !== input.authorId && !mentionedSet.has(id)))];
  const excerpt = commentExcerpt ? `: ${commentExcerpt}` : " con un archivo adjunto.";
  const shared = {
    actorId: input.authorId,
    actorName: input.authorName,
    type: "comment" as const,
    workspaceId: input.workspaceId,
    task: input.task,
  };
  await Promise.all([
    mentioned.length ? notifyTaskUsers({
      ...shared,
      recipientIds: mentioned,
      title: "Te mencionaron en una tarea",
      message: `te mencionó en la tarea${excerpt}`,
    }) : Promise.resolve(),
    recipients.length ? notifyTaskUsers({
      ...shared,
      recipientIds: recipients,
      message: `comentó en la tarea${excerpt}`,
    }) : Promise.resolve(),
  ]);
}
