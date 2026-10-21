import { and, count, eq, isNull } from "drizzle-orm";
import { apiError, parseId, requireUser } from "../_utils";
import { publishUserEvent } from "../_pusher";
import { getDb } from "@/app/db";
import { notifications } from "@/app/db/schema";
import { listUserNotifications } from "../_notifications";

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const unreadOnly = new URL(request.url).searchParams.get("filter") === "unread";
    const [items, unread] = await Promise.all([
      listUserNotifications(user.id, unreadOnly),
      getDb().select({ count: count() }).from(notifications)
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    ]);
    return Response.json({ notifications: items, unreadCount: unread[0]?.count ?? 0 }, {
      headers: { "Cache-Control": "private, no-store" },
    });
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
      return Response.json({ error: "Notification id or markAllRead is required." }, { status: 400 });
    }
    const input = body as { id?: unknown; markAllRead?: unknown };
    const db = getDb();
    let updatedIds: number[] = [];
    if (input.markAllRead === true) {
      const updated = await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
        .returning({ id: notifications.id });
      updatedIds = updated.map(({ id }) => id);
    } else {
      const id = typeof input.id === "number" && Number.isSafeInteger(input.id) && input.id > 0
        ? input.id
        : typeof input.id === "string" ? parseId(input.id) : null;
      if (!id) return Response.json({ error: "A valid notification id is required." }, { status: 400 });
      const updated = await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(notifications.id, id),
          eq(notifications.userId, user.id),
          isNull(notifications.readAt),
        ))
        .returning({ id: notifications.id });
      updatedIds = updated.map(({ id: updatedId }) => updatedId);
    }
    if (updatedIds.length) {
      await publishUserEvent(user.id, "notification:read", { ids: updatedIds });
    }
    const [unreadCount] = await db.select({ count: count() }).from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return Response.json({ success: true, updatedIds, unreadCount: unreadCount?.count ?? 0 });
  } catch (error) {
    return apiError(error);
  }
}
