"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Pusher from "pusher-js";

type NotificationItem = {
  id: number;
  userId: string;
  title: string;
  message: string;
  type: "assigned" | "comment" | "status_change";
  entityType: string;
  entityId: number;
  workspaceId: number;
  readAt: string | null;
  createdAt: string;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo completar la solicitud.");
  return result;
}

export function NotificationBell({
  userId,
  pusherClient,
  onOpenTask,
}: {
  userId: string;
  pusherClient: Pusher | null;
  onOpenTask: (workspaceId: number, taskId: number) => void;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seenIds = useRef(new Set<number>());

  const loadNotifications = useCallback(() => request<{
    notifications: NotificationItem[];
    unreadCount: number;
  }>(`/api/notifications?filter=${filter}`, { cache: "no-store" }), [filter]);

  const applyNotifications = useCallback((result: {
    notifications: NotificationItem[];
    unreadCount: number;
  }) => {
    for (const notification of result.notifications) seenIds.current.add(notification.id);
    setItems(result.notifications);
    setUnreadCount(result.unreadCount);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyNotifications(await loadNotifications());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las notificaciones.");
    } finally {
      setLoading(false);
    }
  }, [applyNotifications, loadNotifications]);

  useEffect(() => {
    let active = true;
    loadNotifications()
      .then((result) => {
        if (!active) return;
        applyNotifications(result);
        setError("");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las notificaciones.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [applyNotifications, loadNotifications]);

  useEffect(() => {
    if (!pusherClient) return;
    const channel = pusherClient.subscribe(`private-user-${userId}`);
    const onCreated = (payload: { notification?: NotificationItem }) => {
      const notification = payload.notification;
      if (!notification || notification.userId !== userId || seenIds.current.has(notification.id)) return;
      seenIds.current.add(notification.id);
      setItems((current) => filter === "unread" || !notification.readAt
        ? [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50)
        : current);
      if (!notification.readAt) setUnreadCount((count) => count + 1);
    };
    const onRead = (payload: { ids?: number[] }) => {
      const ids = new Set(payload.ids ?? []);
      setItems((current) => current.map((item) => ids.has(item.id)
        ? { ...item, readAt: new Date().toISOString() }
        : item));
      if (filter === "unread") setItems((current) => current.filter((item) => !ids.has(item.id)));
      void refresh();
    };
    channel.bind("notification:created", onCreated);
    channel.bind("notification:read", onRead);
    return () => {
      channel.unbind("notification:created", onCreated);
      channel.unbind("notification:read", onRead);
      pusherClient.unsubscribe(`private-user-${userId}`);
    };
  }, [filter, pusherClient, refresh, userId]);

  async function markRead(id: number) {
    const current = items.find((item) => item.id === id);
    if (!current || current.readAt) return;
    const readAt = new Date().toISOString();
    setItems((existing) => existing.map((item) => item.id === id ? { ...item, readAt } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await request("/api/notifications", { method: "PATCH", body: JSON.stringify({ id }) });
      setError("");
    } catch (cause) {
      setItems((existing) => existing.map((item) => item.id === id ? { ...item, readAt: null } : item));
      setUnreadCount((count) => count + 1);
      setError(cause instanceof Error ? cause.message : "No se pudo marcar como leída.");
    }
  }

  async function markAllRead() {
    const unread = items.filter((item) => !item.readAt);
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await request("/api/notifications", { method: "PATCH", body: JSON.stringify({ markAllRead: true }) });
      setError("");
    } catch (cause) {
      setItems((current) => current.map((item) => unread.some((wasUnread) => wasUnread.id === item.id)
        ? { ...item, readAt: null }
        : item));
      setUnreadCount((count) => count + unread.length);
      setError(cause instanceof Error ? cause.message : "No se pudieron marcar todas como leídas.");
    }
  }

  function openNotification(notification: NotificationItem) {
    void markRead(notification.id);
    setOpen(false);
    onOpenTask(notification.workspaceId, notification.entityId);
  }

  return (
    <div className="relative mr-1 shrink-0">
      <button type="button" aria-label={`Notificaciones, ${unreadCount} sin leer`} aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-indigo-700">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && <section aria-label="Bandeja de notificaciones" className="popover-surface absolute right-0 top-12 z-50 w-[min(92vw,390px)] overflow-hidden rounded-xl border border-slate-200 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div><h2 className="text-sm font-semibold text-slate-900">Notificaciones</h2><p className="text-[11px] text-slate-500">{unreadCount} sin leer</p></div>
          <button type="button" disabled={!unreadCount} onClick={() => void markAllRead()} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40">Marcar todas como leídas</button>
        </header>
        <div className="flex gap-1 border-b border-slate-100 px-3 py-2">
          {(["all", "unread"] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${filter === value ? "bg-purple-600 text-white" : "text-slate-500 hover:bg-slate-800 hover:text-white"}`}>
            {value === "all" ? "Todas" : "No leídas"}
          </button>)}
          <button type="button" aria-label="Actualizar notificaciones" onClick={() => void refresh()} className="ml-auto rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Actualizar</button>
        </div>
        {error && <p role="alert" className="px-4 py-2 text-xs text-rose-600">{error}</p>}
        <div className="max-h-[min(65vh,480px)] overflow-y-auto">
          {loading && !items.length ? <p className="px-4 py-8 text-center text-xs text-slate-500">Cargando notificaciones…</p> :
            items.length ? <ul className="divide-y divide-slate-100">
              {items.map((item) => <li key={item.id} className={`flex items-start gap-2 px-3 py-3 ${item.readAt ? "" : "bg-indigo-50/50"}`}>
                <button type="button" onClick={() => openNotification(item)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-slate-300" : "bg-rose-600"}`} /><span className="min-w-0"><span className="block text-xs font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{item.message}</span><time className="mt-1 block text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</time></span></span>
                </button>
                {!item.readAt && <button type="button" aria-label="Marcar notificación como leída" title="Marcar como leída" onClick={() => void markRead(item.id)} className="mt-1 rounded p-1 text-slate-400 hover:bg-indigo-100 hover:text-indigo-700">
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4"><path d="m4 10 4 4 8-8" /></svg>
                </button>}
              </li>)}
            </ul> : <p className="px-4 py-9 text-center text-xs text-slate-500">No tienes notificaciones{filter === "unread" ? " sin leer" : ""}.</p>}
        </div>
      </section>}
    </div>
  );
}
