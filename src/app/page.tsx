"use client";

import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import Pusher from "pusher-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SettingsModal, type SettingsTab } from "@/app/components/SettingsModal";
import { WorkspaceFeatureViews } from "@/app/components/WorkspaceFeatureViews";

type Priority = "high" | "medium" | "low";
type Workspace = {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
};
type View = "board" | "list" | "calendar" | "dashboard" | "inbox" | "agents" | "strategy" | "knowledge" | "people";
type FeatureView = "agents" | "strategy" | "knowledge" | "people";

type Column = {
  id: number;
  name: string;
  workspace: string;
  workspaceId: number;
  position: number;
};

type Task = {
  id: number;
  title: string;
  description: string;
  priority: Priority;
  columnId: number;
  assignee: string;
  assigneeId: string | null;
  assigneeName: string;
  completed: boolean;
  dueDate: string | null;
  createdAt: string;
};

type TaskComment = {
  id: number;
  taskId: number;
  userId: string;
  content: string;
  createdAt: string;
  userName: string;
  userImage: string | null;
  attachments: CommentAttachment[];
};

type CommentAttachment = {
  id: number;
  commentId: number;
  fileName: string;
  mimeType: string;
};

type MentionOption = { id: string; name: string };
type PendingAttachment = { file: File; marker: string };

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "ADMIN" | "MEMBER";
};

type TaskDraft = {
  title: string;
  description: string;
  priority: Priority;
  columnId: string;
  assigneeId: string;
  dueDate: string;
  completed: boolean;
};

const priorityLabels: Record<Priority, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo completar la solicitud.");
  return result;
}

async function loadBoardData(isAdmin: boolean) {
  const [columnResult, taskResult, workspaceResult, userResult, mentionResult] = await Promise.all([
    request<{ columns: Column[] }>("/api/columns", { cache: "no-store" }),
    request<{ tasks: Task[] }>("/api/tasks", { cache: "no-store" }),
    request<{ workspaces: Workspace[] }>("/api/workspaces", { cache: "no-store" }),
    isAdmin
      ? request<{ users: UserOption[] }>("/api/users", { cache: "no-store" })
      : Promise.resolve({ users: [] as UserOption[] }),
    request<{ members: MentionOption[] }>("/api/mentions", { cache: "no-store" }),
  ]);
  return {
    columns: columnResult.columns,
    tasks: taskResult.tasks,
    users: userResult.users,
    workspaces: workspaceResult.workspaces,
    mentions: mentionResult.members,
  };
}

function Icon({
  name,
  size = 18,
}: {
  name: "search" | "plus" | "filter" | "board" | "list" | "calendar" | "chart" | "inbox" | "chevron" | "more" | "clock" | "check" | "close" | "arrow" | "spark" | "trash" | "edit" | "briefcase";
  size?: number;
}) {
  const paths: Record<typeof name, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    filter: <><path d="M4 7h16M7 12h10M10 17h4" /><circle cx="8" cy="7" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" /></>,
    board: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
    inbox: <><path d="M4 4h16l2 11v5H2v-5L4 4Z" /><path d="M2 14h6l2 3h4l2-3h6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" /><path d="M10 11v5m4-5v5" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4h8v3M3 12h18m-11 0v2h4v-2" /></>,
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-[3px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90vh] w-full overflow-y-auto ${wide ? "max-w-xl" : "max-w-md"} animate-[modal-in_.18s_ease-out] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl`}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="close" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}

function TaskModal({
  task,
  columns,
  users,
  isAdmin,
  commentAuthor,
  commentAuthorImage,
  mentionUsers,
  workspaceId,
  pusherClient,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task | null;
  columns: Column[];
  users: UserOption[];
  isAdmin: boolean;
  commentAuthor: string;
  commentAuthorImage: string | null;
  mentionUsers: MentionOption[];
  workspaceId: number | null;
  pusherClient: Pusher | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: TaskDraft, id?: number) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({
    title: task?.title ?? "",
    description: task?.description ?? "",
    priority: task?.priority ?? "medium",
    columnId: String(task?.columnId ?? columns[0]?.id ?? ""),
    assigneeId: task?.assigneeId ?? "",
    dueDate: task?.dueDate ?? "",
    completed: task?.completed ?? false,
  }));
  const [removing, setRemoving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(draft, task?.id);
  }

  return (
    <Modal
      title={task ? "Detalles de la tarea" : "Crear una tarea"}
      subtitle={task ? "Actualiza el trabajo y su seguimiento." : "Añade una tarea al espacio de trabajo."}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título">
          <input autoFocus required maxLength={180} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="¿Qué hay que hacer?" className="form-control text-base font-medium" />
        </Field>
        <Field label="Descripción">
          <textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Añade contexto o próximos pasos..." className="form-control resize-y" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Columna">
            <select required value={draft.columnId} onChange={(event) => setDraft({ ...draft, columnId: event.target.value })} className="form-control">
              {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })} className="form-control">
              {(["high", "medium", "low"] as Priority[]).map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
            </select>
          </Field>
          {isAdmin ? (
            <Field label="Asignada a">
              <select value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })} className="form-control">
                <option value="">Sin asignar</option>
                {users.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.email ?? "Usuario"} ({member.role === "ADMIN" ? "Admin" : "Miembro"})</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Asignada a"><p className="text-sm text-slate-600">{task?.assigneeName ?? "Tú"}</p></Field>
          )}
          <Field label="Fecha límite">
            <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="form-control" />
          </Field>
        </div>
        {task && <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={draft.completed} onChange={(event) => setDraft({ ...draft, completed: event.target.checked })} className="size-4 accent-indigo-600" />Marcar como completada</label>}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          {isAdmin && task && onDelete ? (
            <button type="button" disabled={saving || removing} onClick={async () => { setRemoving(true); try { await onDelete(task.id); } finally { setRemoving(false); } }} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Icon name="trash" size={16} />Eliminar</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="button-secondary">Cancelar</button>
            <button type="submit" disabled={saving || !draft.columnId} className="button-primary">{saving ? "Guardando..." : task ? "Guardar cambios" : "Crear tarea"}</button>
          </div>
        </div>
      </form>
      {task && <TaskComments taskId={task.id} workspaceId={workspaceId} pusherClient={pusherClient} author={commentAuthor} authorImage={commentAuthorImage} mentionUsers={mentionUsers} />}
    </Modal>
  );
}

function TaskComments({
  taskId,
  workspaceId,
  pusherClient,
  author,
  authorImage,
  mentionUsers,
}: {
  taskId: number;
  workspaceId: number | null;
  pusherClient: Pusher | null;
  author: string;
  authorImage: string | null;
  mentionUsers: MentionOption[];
}) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    request<{ comments: TaskComment[] }>(`/api/comments?taskId=${taskId}`, { cache: "no-store" })
      .then((result) => {
        if (active) {
          setComments((current) => {
            const commentsById = new Map(result.comments.map((comment) => [comment.id, comment]));
            for (const comment of current) commentsById.set(comment.id, comment);
            return [...commentsById.values()].sort((left, right) =>
              new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id - right.id,
            );
          });
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los comentarios.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [taskId]);

  useEffect(() => {
    if (!pusherClient || !workspaceId) return;
    const channel = pusherClient.channel(`private-workspace-${workspaceId}`);
    if (!channel) return;

    function onCommentCreated(payload: { comment?: TaskComment }) {
      const comment = payload.comment;
      if (!comment || comment.taskId !== taskId) return;
      setComments((current) => current.some((item) => item.id === comment.id)
        ? current
        : [...current, comment].sort((left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id - right.id,
        ));
    }

    function onCommentUpdated(payload: { comment?: { id?: number; taskId?: number } }) {
      if (!payload.comment || payload.comment.taskId !== taskId) return;
      request<{ comments: TaskComment[] }>(`/api/comments?taskId=${taskId}`, { cache: "no-store" })
        .then((result) => setComments(result.comments))
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "No se pudieron actualizar los comentarios.");
        });
    }

    function onProfileUpdated(payload: { user?: { id?: string; name?: string | null; image?: string | null; imageStored?: boolean } }) {
        const member = payload.user;
        if (!member?.id) return;
        const applyProfile = (image: string | null) => {
          setComments((current) => current.map((comment) => comment.userId === member.id
            ? { ...comment, userName: member.name ?? comment.userName, userImage: image }
            : comment));
        };
        if (member.imageStored && !member.image) {
          request<{ image: string | null }>(`/api/profile/avatar?userId=${encodeURIComponent(member.id)}`, { cache: "no-store" })
            .then(({ image }) => applyProfile(image))
            .catch((cause: unknown) => console.error("Unable to refresh comment author avatar:", cause));
        } else {
          applyProfile(member.image ?? null);
        }
    }

    channel.bind("comment:created", onCommentCreated);
    channel.bind("comment:updated", onCommentUpdated);
    channel.bind("profile:updated", onProfileUpdated);
    return () => {
        channel.unbind("comment:created", onCommentCreated);
        channel.unbind("comment:updated", onCommentUpdated);
        channel.unbind("profile:updated", onProfileUpdated);
    };
  }, [pusherClient, taskId, workspaceId]);

  useEffect(() => {
    if (!toolsOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !toolsMenuRef.current?.contains(event.target)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [toolsOpen]);

  function insertMarkdown(value: string) {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? content.length;
    const end = editor?.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${value}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + value.length, start + value.length);
    });
    setToolsOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent && files.length === 0) return;

    setSaving(true);
    setError("");
    const optimisticId = -Date.now();
    const optimisticComment: TaskComment = {
      id: optimisticId,
      taskId,
      userId: "current-user",
      content: trimmedContent,
      createdAt: new Date().toISOString(),
      userName: author,
      userImage: authorImage,
      attachments: [],
    };
    setComments((current) => [...current, optimisticComment]);
    setContent("");
    let commentCreated = false;
    let uploadedCount = 0;
    try {
      const commentContent = files.reduce((value, pending) => value.replace(pending.marker, ""), trimmedContent).trim();
      const result = await request<{ comment: TaskComment }>("/api/comments", {
        method: "POST",
        body: JSON.stringify({ taskId, content: commentContent, attachmentsCount: files.length }),
      });
      commentCreated = true;
      setComments((current) => [
        ...current.filter((comment) => comment.id !== optimisticId && comment.id !== result.comment.id),
        result.comment,
      ].sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id - right.id,
      ));

      let commentMarkdown = commentContent;
      for (const pending of files) {
        const { file } = pending;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("No se pudo leer el archivo."));
          reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
          reader.readAsDataURL(file);
        });
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const { attachment } = await request<{ attachment: CommentAttachment }>(
          `/api/comments/${result.comment.id}/attachments`,
          {
            method: "POST",
            body: JSON.stringify({ fileName: file.name, mimeType: file.type, data: base64 }),
          },
        );
        setComments((current) => current.map((comment) =>
          comment.id === result.comment.id
            ? { ...comment, attachments: [...comment.attachments, attachment] }
            : comment,
        ));
        const url = `/api/comment-attachments?id=${attachment.id}`;
        const safeName = file.name.replace(/[\[\]\\]/g, "");
        const markdown = file.type.startsWith("image/")
          ? `![${safeName}](${url})`
          : `[${safeName}](${url})`;
        commentMarkdown = `${commentMarkdown}${commentMarkdown ? "\n" : ""}${markdown}`;
        const { comment: updatedComment } = await request<{ comment: TaskComment }>("/api/comments", {
          method: "PATCH",
          body: JSON.stringify({ id: result.comment.id, content: commentMarkdown }),
        });
        setComments((current) => current.map((comment) =>
          comment.id === updatedComment.id ? { ...comment, ...updatedComment } : comment,
        ));
        uploadedCount++;
      }
      setFiles([]);
    } catch (cause) {
      if (commentCreated) {
        setFiles(files.slice(uploadedCount));
        const detail = cause instanceof Error ? cause.message : "Error al subir el archivo.";
        setError(`El comentario se guardó, pero no se pudieron subir todos los archivos: ${detail}`);
      } else {
        setComments((current) => current.filter((comment) => comment.id !== optimisticId));
        setContent(trimmedContent);
        setFiles(files);
        setError(cause instanceof Error ? cause.message : "No se pudo publicar el comentario.");
      }
    } finally {
      setSaving(false);
    }
  }

  const toolbarItems = [
    { label: "Encabezado grande", value: "# " },
    { label: "Encabezado mediano", value: "## " },
    { label: "Encabezado pequeño", value: "### " },
    { label: "Lista con viñetas", value: "- " },
    { label: "Lista numerada", value: "1. " },
    { label: "Mención", value: "@" },
    { label: "Emoji", value: "😀" },
    { label: "Enlace", value: "[texto](https://)" },
    { label: "Tabla", value: "| Columna 1 | Columna 2 |\n| --- | --- |\n| Valor | Valor |" },
    { label: "Separador", value: "\n---\n" },
    { label: "Cita", value: "> " },
    { label: "Bloque de código", value: "```\n\n```" },
  ];

  return (
    <section className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-semibold text-slate-900">Comentarios y actividad</h3>
      {loading ? <p className="mt-3 text-xs text-slate-400">Cargando comentarios...</p> :
        comments.length ? (
          <ol className="mt-4 max-h-64 space-y-4 overflow-y-auto">
            {comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <UserAvatar image={comment.userImage} name={comment.userName} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold text-slate-800">{comment.userName}</span>
                    <time dateTime={comment.createdAt} className="text-[10px] text-slate-400">
                      {new Date(comment.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                  </div>
                  <MarkdownContent content={comment.content} />
                  {comment.attachments.map((attachment) => {
                    const url = `/api/comment-attachments?id=${attachment.id}`;
                    if (comment.content.includes(`(${url})`)) return null;
                    return attachment.mimeType.startsWith("image/") ? (
                      <a key={attachment.id} href={url} target="_blank" rel="noreferrer" className="mt-2 block w-fit">
                        <Image src={url} alt={attachment.fileName} width={480} height={320} unoptimized className="max-h-48 max-w-full rounded-lg border border-slate-200 object-contain" />
                      </a>
                    ) : (
                      <a key={attachment.id} href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
                        <Icon name="arrow" size={14} />{attachment.fileName}
                      </a>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="mt-3 text-xs text-slate-400">Aún no hay comentarios. Inicia la conversación.</p>}
      {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
      <form onSubmit={submit} className="mt-4 space-y-2">
        <div className="rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2 py-1.5">
            <div ref={toolsMenuRef} className="relative">
              <button type="button" aria-label="Insertar formato o contenido" aria-expanded={toolsOpen} aria-haspopup="menu" onClick={() => setToolsOpen((open) => !open)} className="button-secondary !px-2 !py-1"><Icon name="plus" size={15} /></button>
              {toolsOpen && <div role="menu" className="absolute bottom-10 left-0 z-50 grid max-h-72 w-56 grid-cols-1 gap-0.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {toolbarItems.map((item) => <button key={item.label} type="button" role="menuitem" onClick={() => insertMarkdown(item.value)} className="rounded-md px-2.5 py-1.5 text-left text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-200 dark:hover:bg-zinc-700">{item.label}</button>)}
                <span className="px-2.5 pt-2 text-[10px] font-semibold uppercase text-slate-400">Mencionar a alguien</span>
                {mentionUsers.slice(0, 8).map((member) => <button key={member.id} type="button" role="menuitem" onClick={() => insertMarkdown(`@${member.name.replace(/\s+/g, "")} `)} className="rounded-md px-2.5 py-1.5 text-left text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-200 dark:hover:bg-zinc-700">@{member.name}</button>)}
                <button type="button" role="menuitem" onClick={() => { setToolsOpen(false); fileInputRef.current?.click(); }} className="rounded-md px-2.5 py-1.5 text-left text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-200 dark:hover:bg-zinc-700">Adjuntar imagen o archivo</button>
              </div>}
            </div>
            <button type="button" onClick={() => setPreview((value) => !value)} className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-white">{preview ? "Editar Markdown" : "Vista previa"}</button>
          </div>
          {preview ? (
            <div className="min-h-24 p-3"><MarkdownContent content={content || "La vista previa del comentario aparecerá aquí."} /></div>
          ) : (
            <textarea
              ref={editorRef}
              aria-label="Escribe un comentario en Markdown"
              maxLength={5000}
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Escribe un comentario... Usa Markdown para darle formato."
              className="form-control resize-y rounded-none border-0 focus:shadow-none"
            />
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            const accepted = selected.filter((file) => {
              if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
                setError(`${file.name}: selecciona una imagen o un PDF.`);
                return false;
              }
              if (file.size > 2 * 1024 * 1024) {
                setError(`${file.name}: supera el límite de 2 MB.`);
                return false;
              }
              return true;
            });
            const remainingSlots = Math.max(0, 5 - files.length);
            if (accepted.length > remainingSlots) setError("Puedes adjuntar hasta 5 archivos por comentario.");
            const pending = accepted.slice(0, remainingSlots).map((file) => ({
              file,
              marker: file.type.startsWith("image/")
                ? `![${file.name}](attachment-pending:${crypto.randomUUID()})`
                : `[${file.name}](attachment-pending:${crypto.randomUUID()})`,
            }));
            setFiles((current) => [...current, ...pending]);
            if (pending.length) insertMarkdown(`${content && !content.endsWith("\n") ? "\n" : ""}${pending.map((item) => item.marker).join("\n")}`);
            event.target.value = "";
          }}
        />
        {files.length > 0 && <ul className="flex flex-wrap gap-2">{files.map(({ file, marker }, index) => <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-[11px] text-slate-600"><span className="max-w-40 truncate">{file.name}</span><button type="button" aria-label={`Quitar ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index)); setContent((current) => current.replace(marker, "").replace(/\n{3,}/g, "\n\n")); }} className="rounded-full p-1 hover:bg-white"><Icon name="close" size={12} /></button></li>)}</ul>}
        <p className="text-[10px] text-slate-400">Hasta 5 archivos, 2 MB cada uno. Imágenes, PDF, texto y CSV.</p>
        <div className="flex justify-end">
          <button type="submit" disabled={saving || (!content.trim() && files.length === 0)} className="button-primary">
            {saving ? <><span className="size-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Publicando...</> : "Comentar"}
          </button>
        </div>
      </form>
    </section>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];

  function inline(text: string, keyPrefix: string): React.ReactNode[] {
    const token = /(!\[[^\]]*\]\(\/api\/comment-attachments\?id=\d+\)|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(token)) {
      const index = match.index ?? 0;
      if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
      const value = match[0];
      if (value.startsWith("![")) {
        const image = value.match(/^!\[([^\]]*)\]\((\/api\/comment-attachments\?id=\d+)\)$/);
        if (image) nodes.push(<Image key={`${keyPrefix}-${index}`} src={image[2]} alt={image[1]} width={480} height={320} unoptimized className="my-2 max-h-48 max-w-full rounded-lg border border-slate-200 object-contain" />);
      } else if (value.startsWith("[")) {
        const link = value.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        if (link) nodes.push(<a key={`${keyPrefix}-${index}`} href={link[2]} target="_blank" rel="noreferrer" className="text-indigo-600 underline">{link[1]}</a>);
      } else if (value.startsWith("`")) {
        nodes.push(<code key={`${keyPrefix}-${index}`} className="rounded bg-slate-100 px-1 py-0.5 text-[.9em]">{value.slice(1, -1)}</code>);
      } else if (value.startsWith("**")) {
        nodes.push(<strong key={`${keyPrefix}-${index}`}>{value.slice(2, -2)}</strong>);
      } else {
        nodes.push(<em key={`${keyPrefix}-${index}`}>{value.slice(1, -1)}</em>);
      }
      lastIndex = index + value.length;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
  }

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = (`h${heading[1].length}`) as "h1" | "h2" | "h3";
      const headingSize = heading[1].length === 1 ? "text-lg" : heading[1].length === 2 ? "text-base" : "text-sm";
      blocks.push(<Tag key={index} className={`mt-2 font-semibold text-slate-800 ${headingSize}`}>{inline(heading[2], `h-${index}`)}</Tag>);
      index++;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      blocks.push(<hr key={index} className="my-3 border-slate-200" />);
      index++;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index++;
      blocks.push(<pre key={`code-${index}`} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(<blockquote key={index} className="my-2 border-l-2 border-indigo-300 pl-3 text-slate-500">{inline(line.slice(2), `q-${index}`)}</blockquote>);
      index++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[index])) {
        items.push(lines[index++].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} className={`my-2 pl-5 text-sm text-slate-600 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item, `li-${index}-${itemIndex}`)}</li>)}</List>);
      continue;
    }
    if (line.startsWith("|") && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1])) {
      const rows = [line];
      index += 2;
      while (index < lines.length && lines[index].startsWith("|")) rows.push(lines[index++]);
      const cells = rows.map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
      blocks.push(<div key={`table-${index}`} className="my-2 overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs"><tbody>{cells.map((row, rowIndex) => rowIndex === 1 ? null : <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} className="border border-slate-200 bg-slate-50 px-2 py-1 font-semibold">{inline(cell, `th-${rowIndex}-${cellIndex}`)}</th> : <td key={cellIndex} className="border border-slate-200 px-2 py-1">{inline(cell, `td-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|>|```|\s*[-*]\s+|\s*\d+\.\s+|\|)/.test(lines[index]) && !/^\s*(---|\*\*\*)\s*$/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`} className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600">{inline(paragraph.join("\n"), `p-${index}`)}</p>);
  }

  return <div>{blocks}</div>;
}

function ColumnModal({
  column,
  workspaceName,
  saving,
  onClose,
  onSave,
}: {
  column: Column | null;
  workspaceName: string;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(column?.name ?? "");
  return (
    <Modal title={column ? "Editar columna" : "Añadir columna"} subtitle={column ? "Cambia el nombre de esta etapa." : `Crea una etapa para ${workspaceName}.`} onClose={onClose}>
      <form onSubmit={async (event) => { event.preventDefault(); await onSave(name); }} className="space-y-5">
        <Field label="Nombre de la columna">
          <input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Por hacer" className="form-control" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="button-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="button-primary">{saving ? "Guardando..." : column ? "Guardar" : "Añadir columna"}</button>
        </div>
      </form>
    </Modal>
  );
}

function WorkspaceModal({
  workspace,
  saving,
  onClose,
  onSave,
}: {
  workspace?: Workspace | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: Pick<Workspace, "name" | "description" | "icon" | "color">) => Promise<void>;
}) {
  const [name, setName] = useState(workspace?.name ?? "");
  const [description, setDescription] = useState(workspace?.description ?? "");
  const [icon, setIcon] = useState(workspace?.icon ?? "briefcase");
  const [color, setColor] = useState(workspace?.color ?? "#4f46e5");
  return (
    <Modal title={workspace ? "Editar espacio de trabajo" : "Crear espacio de trabajo"} subtitle={workspace ? "Actualiza el nombre y la apariencia del espacio." : "El nuevo espacio quedará disponible para todo el equipo."} onClose={onClose} wide>
      <form onSubmit={async (event) => { event.preventDefault(); await onSave({ name: name.trim(), description: description.trim(), icon: icon.trim(), color }); }} className="space-y-4">
        <Field label="Nombre del espacio">
          <input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Under Control" className="form-control" />
        </Field>
        <Field label="Descripción">
          <textarea maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe este proyecto o espacio de trabajo." className="form-control resize-y" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Icono o emoji">
            <input required maxLength={8} value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="📁" className="form-control" />
          </Field>
          <Field label="Color del espacio">
            <div className="flex h-[38px] items-center gap-3 rounded-lg border border-slate-200 px-3">
              <input type="color" aria-label="Color del espacio" value={color} onChange={(event) => setColor(event.target.value)} className="size-7 cursor-pointer border-0 bg-transparent p-0" />
              <span className="text-xs font-medium uppercase text-slate-600">{color}</span>
            </div>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="button-secondary">Cancelar</button>
          <button type="submit" disabled={saving || !name.trim() || !icon.trim()} className="button-primary">{saving ? "Guardando..." : workspace ? "Guardar cambios" : "Crear espacio"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PriorityPill({ priority }: { priority: Priority }) {
  const color = priority === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : priority === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${color}`}><span className={`size-1.5 rounded-full bg-current priority-${priority}`} />{priorityLabels[priority]}</span>;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("") || "U";
}

function UserAvatar({ image, name }: { image: string | null; name: string }) {
  return image ? (
    <Image src={image} alt="" width={36} height={36} unoptimized className="size-9 rounded-full object-cover" />
  ) : (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-700">
      {initials(name)}
    </span>
  );
}

export default function Home() {
  const { data: session, status, update: updateSession } = useSession();
  const isAdmin = session?.user.role === "ADMIN";
  const currentUserId = session?.user.id;
  const displayName = session?.user.name ?? session?.user.email ?? "Usuario";
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [mentionUsers, setMentionUsers] = useState<MentionOption[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [view, setView] = useState<View>("board");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [columnFilter, setColumnFilter] = useState<number | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [columnDialog, setColumnDialog] = useState<{ open: boolean; column: Column | null }>({ open: false, column: null });
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceEdit, setWorkspaceEdit] = useState<Workspace | null>(null);
  const [workspaceDelete, setWorkspaceDelete] = useState<Workspace | null>(null);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<number | null>(null);
  const [columnMenu, setColumnMenu] = useState<number | null>(null);
  const [pusherClient, setPusherClient] = useState<Pusher | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "unavailable">("connecting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [navigationLabels, setNavigationLabels] = useState<"icons" | "icons-and-text">("icons-and-text");
  const [navigationOrder, setNavigationOrder] = useState(["work", "agents", "strategy", "knowledge", "people"]);
  const [browserNotifications, setBrowserNotifications] = useState(false);
  const [projectNotifications, setProjectNotifications] = useState(true);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [muteDueToday, setMuteDueToday] = useState(false);
  const [showRowNumbers, setShowRowNumbers] = useState(false);
  const tasksRef = useRef(tasks);
  const notificationSettingsRef = useRef({ browserNotifications, projectNotifications, doNotDisturb, muteDueToday });
  const sidebarProfileMenuRef = useRef<HTMLDivElement>(null);
  const headerProfileMenuRef = useRef<HTMLDivElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const headerCreateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => {
    notificationSettingsRef.current = { browserNotifications, projectNotifications, doNotDisturb, muteDueToday };
  }, [browserNotifications, projectNotifications, doNotDisturb, muteDueToday]);

  const applyBoardData = useCallback((data: Awaited<ReturnType<typeof loadBoardData>>) => {
    setColumns(data.columns);
    setTasks(data.tasks);
    setUsers(data.users);
    setMentionUsers(data.mentions);
    setWorkspaces(data.workspaces);
    setWorkspaceId((currentId) => {
      if (currentId && data.workspaces.some((workspace) => workspace.id === currentId)) return currentId;
      return data.workspaces.find((workspace) => workspace.name === "Producto")?.id ?? data.workspaces[0]?.id ?? null;
    });
  }, []);

  function selectWorkspace(id: number) {
    if (id === workspaceId) return;
    setWorkspaceId(id);
    setView("board");
    setMineOnly(false);
    setColumnFilter("all");
    setPriorityFilter("all");
    setSearch("");
    setFilterOpen(false);
    setColumnMenu(null);
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    loadBoardData(isAdmin)
      .then((data) => {
        if (!active) return;
        applyBoardData(data);
        setError("");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el tablero.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [status, isAdmin, applyBoardData]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    request<{ profile: { settings: { navigationLabels: "icons" | "icons-and-text"; navigationOrder: string[]; theme: "system" | "light" | "dark"; themeStyle: "aura" | "cyberpunk" | "forest" | "sunset" | "monochrome"; sidebarColor: "midnight" | "purple" | "space-blue" | "olive" | "pink"; compactMode: boolean; browserNotifications: boolean; projectNotifications: boolean; doNotDisturb: boolean; muteDueToday: boolean; showRowNumbers: boolean; colorBlindMode: boolean } } }>("/api/profile", { cache: "no-store" })
      .then(({ profile }) => {
        if (!active) return;
        setNavigationLabels(profile.settings.navigationLabels);
        setNavigationOrder(profile.settings.navigationOrder);
        setBrowserNotifications(profile.settings.browserNotifications);
        setProjectNotifications(profile.settings.projectNotifications);
        setDoNotDisturb(profile.settings.doNotDisturb);
        setMuteDueToday(profile.settings.muteDueToday);
        setShowRowNumbers(profile.settings.showRowNumbers);
        document.documentElement.dataset.theme = profile.settings.theme;
        document.documentElement.dataset.palette = profile.settings.themeStyle;
        document.documentElement.dataset.sidebarColor = profile.settings.sidebarColor;
        document.documentElement.dataset.compact = String(profile.settings.compactMode);
        document.documentElement.dataset.colorBlind = String(profile.settings.colorBlindMode);
      })
      .catch((cause: unknown) => {
        console.error("Unable to load user navigation preferences:", cause);
      });
    return () => { active = false; };
  }, [status]);

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (
        !sidebarProfileMenuRef.current?.contains(event.target) &&
        !headerProfileMenuRef.current?.contains(event.target)
      ) setUserMenuOpen(false);
      if (
        !createMenuRef.current?.contains(event.target) &&
        !headerCreateMenuRef.current?.contains(event.target)
      ) setCreateMenuOpen(false);
      if (!(event.target instanceof Element) || !event.target.closest("[data-workspace-menu]")) {
        setWorkspaceMenuId(null);
      }
    }
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !workspaceId || workspaceId < 1) return;

    let active = true;
    let client: Pusher | null = null;
    request<{ key: string; cluster: string }>("/api/pusher/config", { cache: "no-store" })
      .then(({ key, cluster }) => {
        if (!active) return;
        setRealtimeStatus("connecting");
        client = new Pusher(key, {
          cluster,
          channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
        });
        const channel = client.subscribe(`private-workspace-${workspaceId}`);
        channel.bind("pusher:subscription_succeeded", () => {
          if (active) setRealtimeStatus("connected");
        });
        channel.bind("pusher:subscription_error", (cause: unknown) => {
          console.error("Pusher workspace subscription failed:", cause);
          if (active) setRealtimeStatus("unavailable");
        });

        const upsertTask = (payload: { task?: Task; removed?: boolean; id?: number }) => {
          if (payload.removed && Number.isSafeInteger(payload.id)) {
            setTasks((current) => current.filter((task) => task.id !== payload.id));
            setTaskDialog((current) => current.task?.id === payload.id ? { open: false, task: null } : current);
            return;
          }
          const task = payload.task;
          if (!task || !Number.isSafeInteger(task.id)) return;
          const previousTask = tasksRef.current.find((item) => item.id === task.id);
          const notificationSettings = notificationSettingsRef.current;
          if (
            task.assigneeId === currentUserId &&
            !task.completed &&
            previousTask?.assigneeId !== currentUserId &&
            notificationSettings.browserNotifications &&
            notificationSettings.projectNotifications &&
            !notificationSettings.doNotDisturb &&
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted" &&
            !(notificationSettings.muteDueToday && task.dueDate === new Date().toISOString().slice(0, 10))
          ) {
            new Notification("Tarea asignada", { body: task.title, icon: "/logo.png" });
          }
          setTasks((current) => {
            const existing = current.find((item) => item.id === task.id);
            const nextTask = { ...task, assigneeName: task.assigneeName ?? task.assignee ?? existing?.assigneeName ?? "Usuario" };
            return existing
              ? current.map((item) => item.id === task.id ? nextTask : item)
              : [...current, nextTask];
          });
          setTaskDialog((current) => current.task?.id === task.id
            ? { ...current, task: { ...task, assigneeName: task.assigneeName ?? task.assignee ?? current.task.assigneeName } }
            : current);
        };
        const removeTask = (payload: { id?: number }) => {
          if (!Number.isSafeInteger(payload.id)) return;
          setTasks((current) => current.filter((task) => task.id !== payload.id));
          setTaskDialog((current) => current.task?.id === payload.id ? { open: false, task: null } : current);
        };
        const upsertColumn = (payload: { column?: Column }) => {
          const column = payload.column;
          if (!column || !Number.isSafeInteger(column.id)) return;
          setColumns((current) => {
            const exists = current.some((item) => item.id === column.id);
            return exists
              ? current.map((item) => item.id === column.id ? column : item)
              : [...current, column];
          });
        };
        const removeColumn = (payload: { id?: number }) => {
          if (!Number.isSafeInteger(payload.id)) return;
          setColumns((current) => current.filter((column) => column.id !== payload.id));
          setTasks((current) => current.filter((task) => task.columnId !== payload.id));
        };

        channel.bind("task:created", upsertTask);
        channel.bind("task:updated", upsertTask);
        channel.bind("task:moved", upsertTask);
        channel.bind("task:deleted", removeTask);
        channel.bind("column:created", upsertColumn);
        channel.bind("column:updated", upsertColumn);
        channel.bind("column:deleted", removeColumn);
        const updateMemberProfile = (payload: { user?: { id?: string; name?: string | null; image?: string | null; imageStored?: boolean } }) => {
          const member = payload.user;
          if (!member?.id) return;
          const applyProfile = (image: string | null) => {
            setUsers((current) => current.map((item) => item.id === member.id
              ? { ...item, name: member.name ?? item.name, image }
              : item));
            setMentionUsers((current) => current.map((item) => item.id === member.id
              ? { ...item, name: (member.name ?? item.name) || "Usuario" }
              : item));
          };
          if (member.imageStored && !member.image) {
            request<{ image: string | null }>(`/api/profile/avatar?userId=${encodeURIComponent(member.id)}`, { cache: "no-store" })
              .then(({ image }) => applyProfile(image))
              .catch((cause: unknown) => console.error("Unable to refresh member avatar:", cause));
          } else {
            applyProfile(member.image ?? null);
          }
        };
        channel.bind("profile:updated", updateMemberProfile);
        const refreshWorkspaceList = () => {
          request<{ workspaces: Workspace[] }>("/api/workspaces", { cache: "no-store" })
            .then(({ workspaces: updatedWorkspaces }) => {
              if (!active) return;
              setWorkspaces(updatedWorkspaces);
              if (!updatedWorkspaces.some((workspace) => workspace.id === workspaceId)) {
                const nextWorkspace = updatedWorkspaces[0] ?? null;
                setWorkspaceId(nextWorkspace?.id ?? null);
                setView(nextWorkspace ? "board" : "dashboard");
                setMineOnly(false);
                setSearch("");
                setColumnFilter("all");
                setPriorityFilter("all");
                setColumnMenu(null);
              }
            })
            .catch((cause: unknown) => {
              if (active) setError(cause instanceof Error ? cause.message : "No se pudo actualizar la lista de espacios.");
            });
        };
        channel.bind("workspace:updated", refreshWorkspaceList);
        setPusherClient(client);
      })
      .catch((cause: unknown) => {
        console.error("Unable to initialize Pusher real-time updates:", cause);
        if (active) setRealtimeStatus("unavailable");
      });

    return () => {
      active = false;
      setPusherClient(null);
      if (client) {
        client.unsubscribe(`private-workspace-${workspaceId}`);
        client.disconnect();
      }
    };
  }, [status, workspaceId, currentUserId]);

  async function mutate<T>(url: string, init?: RequestInit): Promise<T | null> {
    setSaving(true);
    setError("");
    try {
      return await request<T>(url, init);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  const activeWorkspace = workspaces.find((item) => item.id === workspaceId) ?? null;
  const workspaceName = activeWorkspace?.name ?? "Espacio de trabajo";
  const activeColumns = useMemo(() => columns.filter((column) => column.workspaceId === workspaceId), [columns, workspaceId]);
  const activeColumnIds = useMemo(() => new Set(activeColumns.map((column) => column.id)), [activeColumns]);
  const workspaceTasks = useMemo(() => tasks.filter((task) => activeColumnIds.has(task.columnId)), [tasks, activeColumnIds]);
  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return workspaceTasks.filter((task) => {
      const matchesSearch = !query || `${task.title} ${task.description}`.toLocaleLowerCase().includes(query);
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesColumn = columnFilter === "all" || task.columnId === columnFilter;
      const matchesAssignee = !mineOnly || task.assigneeId === currentUserId;
      return matchesSearch && matchesPriority && matchesColumn && matchesAssignee;
    });
  }, [workspaceTasks, search, priorityFilter, columnFilter, mineOnly, currentUserId]);
  const completedCount = workspaceTasks.filter((task) => task.completed).length;
  const hasFilters = priorityFilter !== "all" || columnFilter !== "all";
  const featureView = view === "agents" || view === "strategy" || view === "knowledge" || view === "people";

  async function saveTask(draft: TaskDraft, id?: number) {
    const previousTasks = tasks;
    const existingTask = id ? tasks.find((task) => task.id === id) : undefined;
    const selectedAssignee = users.find((user) => user.id === draft.assigneeId);
    const optimisticTask: Task = {
      id: id ?? -Date.now(),
      title: draft.title.trim(),
      description: draft.description,
      priority: draft.priority,
      columnId: Number(draft.columnId),
      assignee: selectedAssignee?.name ?? selectedAssignee?.email ?? existingTask?.assignee ?? displayName,
      assigneeId: isAdmin ? draft.assigneeId || null : currentUserId ?? null,
      assigneeName: selectedAssignee?.name ?? selectedAssignee?.email ?? (isAdmin ? existingTask?.assigneeName : displayName) ?? displayName,
      completed: draft.completed,
      dueDate: draft.dueDate || null,
      createdAt: existingTask?.createdAt ?? new Date().toISOString(),
    };
    setTasks((current) => id
      ? current.map((task) => task.id === id ? optimisticTask : task)
      : [...current, optimisticTask]);
    const result = await mutate<{ task: Task }>(id ? "/api/tasks" : "/api/tasks", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify({
        ...(id ? { id } : {}),
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        columnId: Number(draft.columnId),
        ...(isAdmin ? { assigneeId: draft.assigneeId || null } : {}),
        dueDate: draft.dueDate || null,
        ...(id ? { completed: draft.completed } : {}),
      }),
    });
    if (result) {
      setTasks((current) => [
        ...current.filter((task) => task.id !== optimisticTask.id && task.id !== result.task.id),
        { ...result.task, assigneeName: result.task.assignee || optimisticTask.assigneeName },
      ]);
      setTaskDialog({ open: false, task: null });
    } else setTasks(previousTasks);
  }

  async function deleteTask(id: number) {
    const previousTasks = tasks;
    setTasks((current) => current.filter((task) => task.id !== id));
    const result = await mutate<{ success: boolean }>(`/api/tasks?id=${id}`, { method: "DELETE" });
    if (result) setTaskDialog({ open: false, task: null });
    else setTasks(previousTasks);
  }

  async function saveColumn(name: string) {
    const editing = columnDialog.column;
    const previousColumns = columns;
    const optimisticColumn: Column = {
      id: editing?.id ?? -Date.now(),
      name: name.trim(),
      workspace: workspaceName,
      workspaceId: workspaceId ?? 0,
      position: editing?.position ?? Date.now(),
    };
    setColumns((current) => editing
      ? current.map((column) => column.id === editing.id ? optimisticColumn : column)
      : [...current, optimisticColumn]);
    const result = await mutate<{ column: Column }>("/api/columns", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(editing ? { id: editing.id, name } : { name, workspaceId }),
    });
    if (result) {
      setColumns((current) => [
        ...current.filter((column) => column.id !== optimisticColumn.id && column.id !== result.column.id),
        result.column,
      ]);
      setColumnDialog({ open: false, column: null });
    } else setColumns(previousColumns);
  }

  async function createWorkspace(values: Pick<Workspace, "name" | "description" | "icon" | "color">) {
    setSaving(true);
    setError("");
    const optimisticId = -Date.now();
    const optimisticWorkspace = { id: optimisticId, ...values };
    setWorkspaces((current) => [...current, optimisticWorkspace]);
    setWorkspaceId(optimisticId);
    setView("board");
    try {
      const result = await request<{ workspace: Workspace }>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setWorkspaces((current) => current.map((item) => item.id === optimisticId ? result.workspace : item));
      setWorkspaceId(result.workspace.id);
      setWorkspaceDialogOpen(false);
    } catch (cause) {
      setWorkspaces((current) => current.filter((item) => item.id !== optimisticId));
      setWorkspaceId((current) => current === optimisticId ? activeWorkspace?.id ?? null : current);
      setError(cause instanceof Error ? cause.message : "No se pudo crear el espacio de trabajo.");
    } finally {
      setSaving(false);
    }
  }

  async function updateWorkspace(values: Pick<Workspace, "name" | "description" | "icon" | "color">) {
    if (!workspaceEdit) return;
    const workspace = workspaceEdit;
    const previousWorkspaces = workspaces;
    const updatedWorkspace = { ...workspace, ...values };
    setWorkspaces((current) => current.map((item) => item.id === workspace.id ? updatedWorkspace : item));
    setSaving(true);
    setError("");
    try {
      const result = await request<{ workspace: Workspace }>(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setWorkspaces((current) => current.map((item) => item.id === result.workspace.id ? result.workspace : item));
      setWorkspaceEdit(null);
      setWorkspaceMenuId(null);
    } catch (cause) {
      setWorkspaces(previousWorkspaces);
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el espacio.");
    } finally {
      setSaving(false);
    }
  }

  async function removeWorkspace(workspace: Workspace) {
    const previousWorkspaces = workspaces;
    setWorkspaces((current) => current.filter((item) => item.id !== workspace.id));
    setWorkspaceDelete(null);
    setWorkspaceMenuId(null);
    setSaving(true);
    setError("");
    try {
      await request<{ success: boolean }>(`/api/workspaces/${workspace.id}`, { method: "DELETE" });
      if (workspaceId === workspace.id) {
        const nextWorkspace = previousWorkspaces.find((item) => item.id !== workspace.id) ?? null;
        setWorkspaceId(nextWorkspace?.id ?? null);
        setView(nextWorkspace ? "board" : "dashboard");
        setMineOnly(false);
        setSearch("");
        setColumnFilter("all");
        setPriorityFilter("all");
        setColumnMenu(null);
      }
    } catch (cause) {
      setWorkspaces(previousWorkspaces);
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el espacio.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteColumn(column: Column) {
    setColumnMenu(null);
    const previousColumns = columns;
    setColumns((current) => current.filter((item) => item.id !== column.id));
    const result = await mutate<{ success: boolean }>(`/api/columns?id=${column.id}`, { method: "DELETE" });
    if (!result) setColumns(previousColumns);
  }

  async function moveTask(task: Task, columnId: number) {
    if (task.columnId === columnId) return;
    const previousTasks = tasks;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, columnId } : item));
    const result = await mutate<{ task: Task }>("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, columnId }) });
    if (result) {
      setTasks((current) => current.map((item) => item.id === task.id
        ? { ...result.task, assigneeName: item.assigneeName }
        : item));
    } else setTasks(previousTasks);
  }

  async function toggleTaskCompletion(task: Task) {
    const previousTasks = tasks;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item));
    const result = await mutate<{ task: Task }>("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({ id: task.id, completed: !task.completed }),
    });
    if (result) {
      setTasks((current) => current.map((item) => item.id === task.id
        ? { ...result.task, assigneeName: item.assigneeName }
        : item));
    } else setTasks(previousTasks);
  }

  function showTask(task: Task) {
    setTaskDialog({ open: true, task });
  }

  const viewNames: Record<View, string> = {
    board: "Tablero",
    list: "Lista",
    calendar: "Calendario",
    dashboard: "Resumen",
    inbox: "Bandeja de entrada",
    agents: "Agentes",
    strategy: "Estrategia",
    knowledge: "Conocimientos",
    people: "Personas",
  };

  if (status === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] text-sm text-slate-500">Verificando sesión…</main>;
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-5 py-10">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-200/50">
          <Image src="/logo.png" alt="Under Control" width={48} height={48} className="mx-auto size-12 object-contain" />
          <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Under Control Workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Inicia sesión para ver el espacio de trabajo y las tareas del equipo.</p>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={() => void signIn("google")} className="button-secondary w-full !py-3">Continuar con Google</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="kanban-app min-h-screen bg-[#f7f8fc] text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[252px] flex-col border-r border-slate-200/80 bg-white px-4 py-5 lg:flex">
        <a href="#" className="mb-9 flex items-center gap-3 px-2">
          <Image src="/logo.png" alt="Under Control" width={36} height={36} className="size-9 shrink-0 object-contain" />
          <span><span className="block text-[15px] font-bold tracking-tight text-slate-900">Under Control</span><span className="text-[11px] font-medium text-slate-400">WORKSPACE</span></span>
        </a>

        <div className="relative mb-5 px-1" ref={createMenuRef}>
          <button type="button" aria-expanded={createMenuOpen} onClick={() => setCreateMenuOpen((open) => !open)} className="button-primary w-full justify-center"><Icon name="plus" size={16} />Crear</button>
          {createMenuOpen && <div className="absolute left-1 right-1 top-12 z-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            <button type="button" disabled={!activeColumns.length} onClick={() => { setCreateMenuOpen(false); setTaskDialog({ open: true, task: null }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 disabled:opacity-40"><Icon name="check" size={15} />Crear tarea</button>
            <button type="button" onClick={() => { setCreateMenuOpen(false); setWorkspaceDialogOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50"><Icon name="briefcase" size={15} />Crear espacio de trabajo</button>
            <button type="button" disabled={!workspaceId} onClick={() => { setCreateMenuOpen(false); setColumnDialog({ open: true, column: null }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 disabled:opacity-40"><Icon name="plus" size={15} />Crear columna</button>
          </div>}
        </div>

        <nav aria-label="Navegación principal" className="mb-6 space-y-1">
          <button type="button" onClick={() => { setView("dashboard"); setMineOnly(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium ${view === "dashboard" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="chart" size={17} />{navigationLabels === "icons-and-text" && "Inicio"}</button>
          <button type="button" onClick={() => { setView("inbox"); setMineOnly(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium ${view === "inbox" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="inbox" size={17} />{navigationLabels === "icons-and-text" && "Bandeja de entrada"}</button>
          <button type="button" onClick={() => { setView("board"); setMineOnly((value) => !value); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium ${mineOnly ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="check" size={17} />{navigationLabels === "icons-and-text" && "Mis tareas"}<span className="ml-auto text-[10px] text-slate-400">{workspaceTasks.filter((task) => task.assigneeId === currentUserId).length}</span></button>
        </nav>

        <nav aria-label="Secciones de trabajo" className="space-y-4 overflow-y-auto">
          {navigationOrder.map((item) => {
            if (item === "work") return <div key={item} className="px-2">
              <div className="mb-3 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                <span>{navigationLabels === "icons" ? "Espacios" : "Proyectos y espacios"}</span>
                <button type="button" aria-label="Crear espacio de trabajo" onClick={() => setWorkspaceDialogOpen(true)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-indigo-700"><Icon name="plus" size={15} /></button>
              </div>
              <div className="space-y-1">
                {workspaces.map((workspace) => {
                  const selected = workspaceId === workspace.id;
                  const menuOpen = workspaceMenuId === workspace.id;
                  return (
                    <div key={workspace.id} data-workspace-menu className="group/workspace relative flex items-center">
                      <button
                        type="button"
                        title={workspace.description || workspace.name}
                        aria-current={selected ? "true" : undefined}
                        onClick={() => selectWorkspace(workspace.id)}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 pr-1 text-left text-[13px] font-medium transition ${selected ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        {workspace.name === "Under Control"
                          ? <Image src="/logo.png" alt="" width={24} height={24} className="size-6 shrink-0 object-contain" />
                          : <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md text-sm" style={{ backgroundColor: `${workspace.color}20`, color: workspace.color }}>
                            {workspace.icon === "briefcase" ? <Icon name="briefcase" size={16} /> : workspace.icon}
                          </span>}
                        {navigationLabels === "icons-and-text" && <span className="min-w-0 flex-1 truncate">{workspace.name}</span>}
                        <span className="ml-auto text-[11px] text-slate-400">{columns.filter((column) => column.workspaceId === workspace.id).length}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Opciones de ${workspace.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          setWorkspaceMenuId((current) => current === workspace.id ? null : workspace.id);
                        }}
                        className={`absolute right-1 z-10 rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 ${selected || menuOpen ? "opacity-100" : "opacity-0 group-hover/workspace:opacity-100 group-focus-within/workspace:opacity-100"}`}
                      >
                        <Icon name="more" size={16} />
                      </button>
                      {menuOpen && <div role="menu" className="absolute right-1 top-11 z-40 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                        <button type="button" role="menuitem" onClick={(event) => {
                          event.stopPropagation();
                          setWorkspaceEdit(workspace);
                          setWorkspaceMenuId(null);
                        }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
                          <Icon name="edit" size={14} />Editar espacio
                        </button>
                        <button type="button" role="menuitem" onClick={(event) => {
                          event.stopPropagation();
                          setWorkspaceDelete(workspace);
                          setWorkspaceMenuId(null);
                        }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-rose-600 hover:bg-rose-50">
                          <Icon name="trash" size={14} />Eliminar espacio
                        </button>
                      </div>}
                    </div>
                  );
                })}
                {!workspaces.length && !loading && <p className="px-3 py-2 text-xs text-slate-400">Aún no hay espacios.</p>}
              </div>
            </div>;
            const labels: Record<string, string> = { agents: "Agentes", strategy: "Estrategia", knowledge: "Conocimientos", people: "Personas" };
            const icons: Record<string, string> = { agents: "✦", strategy: "↗", knowledge: "▤", people: "♙" };
            const active = view === item;
            return <button key={item} type="button" title={labels[item] ?? item} onClick={() => { setView(item as FeatureView); setMineOnly(false); }} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] ${active ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><span className="w-[17px] text-center" aria-hidden="true">{icons[item] ?? "·"}</span>{navigationLabels === "icons-and-text" && (labels[item] ?? item)}</button>;
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-900"><Icon name="spark" size={15} />Todo en orden</div>
          <p className="text-[11px] leading-5 text-indigo-800/70">{completedCount} de {workspaceTasks.length} tareas completadas en {workspaceName}.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${workspaceTasks.length ? completedCount / workspaceTasks.length * 100 : 0}%` }} /></div>
        </div>
        <div className="relative mt-4 border-t border-slate-100 px-1 pt-4" ref={sidebarProfileMenuRef}>
          <button type="button" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)} className="flex w-full items-center gap-2 rounded-lg p-1 text-left hover:bg-slate-50">
            <UserAvatar image={session.user.image ?? null} name={displayName} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{displayName}</span><span className="block text-[10px] text-slate-400">{session.user.email}</span></span><Icon name="chevron" size={14} />
          </button>
          {userMenuOpen && <div className="absolute bottom-14 left-0 z-40 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="border-b border-slate-100 px-2 pb-2"><p className="truncate text-sm font-semibold text-slate-800">{displayName}</p><p className="truncate text-xs text-slate-500">{session.user.email}</p></div>
            <button type="button" onClick={() => { setUserMenuOpen(false); setSettingsTab("profile"); setSettingsOpen(true); }} className="mt-1 flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Perfil</button>
            <button type="button" onClick={() => { setUserMenuOpen(false); setSettingsTab("profile"); setSettingsOpen(true); }} className="flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Establecer aviso de ausencia</button>
            <button type="button" onClick={() => { setUserMenuOpen(false); setSettingsTab("appearance"); setSettingsOpen(true); }} className="flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Ajustes</button>
            <button type="button" onClick={() => { setUserMenuOpen(false); setWorkspaceDialogOpen(true); }} className="flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Nuevo espacio de trabajo</button>
            <button type="button" onClick={() => void signOut({ redirectTo: "/" })} className="mt-1 w-full rounded-md border-t border-slate-100 px-2 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">Cerrar sesión</button>
          </div>}
        </div>
      </aside>

      <main className="min-h-screen lg:ml-[252px]">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/logo.png" alt="Under Control" width={32} height={32} className="size-8 shrink-0 object-contain" />
              <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="hidden truncate text-[15px] font-bold text-slate-900 lg:block">{workspaceName}</h1><span className="hidden lg:block"><Icon name="chevron" size={14} /></span><select aria-label="Espacio de trabajo" value={workspaceId ?? ""} onChange={(event) => selectWorkspace(Number(event.target.value))} className="max-w-36 rounded-md border-0 bg-transparent p-0 text-[14px] font-bold text-slate-900 outline-none lg:hidden">{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><p className="mt-0.5 hidden text-[11px] text-slate-400 sm:block">Trabajo / {workspaceName}</p></div></div>
              {workspaceId && <span role="status" className={`hidden rounded-full px-2.5 py-1 text-[10px] font-medium sm:inline-flex ${realtimeStatus === "connected" ? "bg-emerald-50 text-emerald-700" : realtimeStatus === "connecting" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{realtimeStatus === "connected" ? "En tiempo real" : realtimeStatus === "connecting" ? "Conectando…" : "Tiempo real no disponible"}</span>}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <select aria-label="Navegación" value={view} onChange={(event) => { setView(event.target.value as View); setMineOnly(false); }} className="max-w-32 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 sm:hidden">
                <option value="dashboard">Inicio</option><option value="inbox">Bandeja</option><option value="board">Tablero</option><option value="list">Lista</option><option value="calendar">Calendario</option><option value="agents">Agentes</option><option value="strategy">Estrategia</option><option value="knowledge">Conocimientos</option><option value="people">Personas</option>
              </select>
              {!featureView && <>
              <button type="button" aria-label="Alternar mis tareas" onClick={() => setMineOnly(!mineOnly)} className={`rounded-lg p-2 sm:hidden ${mineOnly ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100"}`}><Icon name="inbox" size={17} /></button>
              <div className="relative hidden w-[min(34vw,280px)] sm:block"><Icon name="search" size={16} /><input aria-label="Buscar tareas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tareas..." className="search-control" /><kbd className="absolute right-3 top-2.5 rounded border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-400">⌘ K</kbd></div>
              <div className="relative">
                <button type="button" onClick={() => setFilterOpen(!filterOpen)} className={`button-secondary !px-2.5 sm:!px-3 ${hasFilters ? "border-indigo-200 bg-indigo-50 text-indigo-700" : ""}`}><Icon name="filter" size={16} /><span className="hidden sm:inline">Filtros</span>{hasFilters && <span className="size-1.5 rounded-full bg-indigo-600" />}</button>
                {filterOpen && <div className="absolute right-0 top-12 z-30 w-60 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Filtrar tareas</span><button type="button" onClick={() => { setPriorityFilter("all"); setColumnFilter("all"); }} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Limpiar</button></div>
                  <Field label="Prioridad"><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | "all")} className="form-control"><option value="all">Todas</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></Field>
                  <div className="mt-3"><Field label="Estado / columna"><select value={columnFilter} onChange={(event) => setColumnFilter(event.target.value === "all" ? "all" : Number(event.target.value))} className="form-control"><option value="all">Todas las columnas</option>{activeColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></Field></div>
                </div>}
              </div>
              </>}
              <div className="relative" ref={headerProfileMenuRef}>
                <button type="button" aria-label="Abrir menú de usuario" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)} className="rounded-full ring-offset-2 hover:ring-2 hover:ring-indigo-200"><UserAvatar image={session.user.image ?? null} name={displayName} /></button>
                {userMenuOpen && <div className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="flex items-center gap-3 border-b border-slate-100 px-2 pb-3"><UserAvatar image={session.user.image ?? null} name={displayName} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{displayName}</p><p className="truncate text-xs text-slate-500">{session.user.email}</p></div></div>
                  <button type="button" onClick={() => { setUserMenuOpen(false); setSettingsTab("profile"); setSettingsOpen(true); }} className="mt-1 flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Perfil</button>
                  <button type="button" onClick={() => { setUserMenuOpen(false); setSettingsTab("profile"); setSettingsOpen(true); }} className="flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Establecer aviso de ausencia</button>
                  <button type="button" onClick={() => { setUserMenuOpen(false); setSettingsTab("appearance"); setSettingsOpen(true); }} className="flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Ajustes</button>
                  <button type="button" onClick={() => { setUserMenuOpen(false); setWorkspaceDialogOpen(true); }} className="flex w-full rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Nuevo espacio de trabajo</button>
                  <button type="button" onClick={() => void signOut({ redirectTo: "/" })} className="mt-1 w-full rounded-md border-t border-slate-100 px-2 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">Cerrar sesión</button>
                </div>}
              </div>
              <div className="relative" ref={headerCreateMenuRef}>
                <button type="button" aria-expanded={createMenuOpen} onClick={() => setCreateMenuOpen((open) => !open)} className="button-primary !px-3"><Icon name="plus" size={17} /><span className="hidden sm:inline">Crear</span><span className="sm:hidden">+</span></button>
                {createMenuOpen && <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button type="button" disabled={activeColumns.length === 0} onClick={() => { setCreateMenuOpen(false); setTaskDialog({ open: true, task: null }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 disabled:opacity-40"><Icon name="check" size={15} />Nueva tarea</button>
                  <button type="button" onClick={() => { setCreateMenuOpen(false); setWorkspaceDialogOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50"><Icon name="briefcase" size={15} />Nuevo espacio</button>
                  <button type="button" disabled={!workspaceId} onClick={() => { setCreateMenuOpen(false); setColumnDialog({ open: true, column: null }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 disabled:opacity-40"><Icon name="plus" size={15} />Nueva columna</button>
                </div>}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-5 pb-12 pt-7 sm:px-8">
          <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            {!featureView && <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-400"><span>{view === "inbox" ? "Bandeja de entrada" : "Trabajo"}</span><span>/</span><span className="text-indigo-600">{workspaceName}</span></div><h2 className="text-[26px] font-bold tracking-[-.04em] text-slate-900 sm:text-[30px]">{view === "dashboard" ? "Panel de resumen" : view === "inbox" ? "Bandeja de entrada" : "Hola, aquí está tu trabajo."}</h2><p className="mt-1 text-sm text-slate-500">{view === "dashboard" ? `Un vistazo al progreso de ${workspaceName}.` : view === "inbox" ? "Tareas asignadas a ti en este espacio." : "Organiza tus prioridades y mantén el ritmo del equipo."}</p></div>}
            {!featureView && <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                {(["board", "list", "calendar", "dashboard"] as View[]).map((item) => <button key={item} type="button" aria-label={`Vista ${viewNames[item]}`} onClick={() => setView(item)} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === item ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}><Icon name={item === "board" ? "board" : item === "list" ? "list" : item === "calendar" ? "calendar" : "chart"} size={15} /><span className="hidden sm:inline">{viewNames[item]}</span></button>)}
              </div>
              {view !== "inbox" && <button type="button" onClick={() => setColumnDialog({ open: true, column: null })} className="button-secondary"><Icon name="plus" size={16} />Añadir columna</button>}
            </div>}
          </div>

          {!featureView && <div className="mb-5 flex gap-2 sm:hidden"><div className="relative flex-1"><Icon name="search" size={16} /><input aria-label="Buscar tareas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tareas..." className="search-control" /></div></div>}

          {mineOnly && <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700"><Icon name="inbox" size={15} />Mostrando solo tus tareas<button type="button" onClick={() => setMineOnly(false)} className="ml-auto underline underline-offset-2">Ver todas</button></div>}
          {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span className="font-bold">!</span><p className="flex-1">{error}</p><button type="button" aria-label="Descartar aviso" onClick={() => setError("")}><Icon name="close" size={16} /></button></div>}

          {loading && !featureView ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white p-4"><div className="h-3 w-24 rounded bg-slate-100" /><div className="mt-6 h-20 rounded-lg bg-slate-50" /><div className="mt-3 h-20 rounded-lg bg-slate-50" /></div>)}</div> :
            featureView ? <WorkspaceFeatureViews key={`${workspaceId ?? "none"}-${view}`} view={view} workspaceId={workspaceId} workspaceName={workspaceName} tasks={workspaceTasks} columns={activeColumns} pusherClient={pusherClient} /> :
            view === "dashboard" ? (
              <section className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { label: "Tareas totales", value: workspaceTasks.length, icon: "list" as const, tone: "bg-indigo-50 text-indigo-600" },
                    { label: "Completadas", value: completedCount, icon: "check" as const, tone: "bg-emerald-50 text-emerald-600" },
                    { label: "Pendientes", value: workspaceTasks.length - completedCount, icon: "clock" as const, tone: "bg-amber-50 text-amber-600" },
                  ].map((stat) => <div key={stat.label} className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{stat.label}</span><span className={`flex size-9 items-center justify-center rounded-lg ${stat.tone}`}><Icon name={stat.icon} /></span></div><div className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{stat.value}</div></div>)}
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30"><div className="mb-5"><h3 className="font-semibold text-slate-900">Progreso por columna</h3><p className="mt-1 text-xs text-slate-500">Tareas abiertas y completadas en cada etapa.</p></div>
                  {activeColumns.length ? <div className="space-y-5">{activeColumns.map((column) => { const group = workspaceTasks.filter((task) => task.columnId === column.id); const done = group.filter((task) => task.completed).length; return <div key={column.id}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-slate-700">{column.name}</span><span className="text-xs text-slate-400">{done} / {group.length} completadas</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${group.length ? done / group.length * 100 : 0}%` }} /></div></div>; })}</div> : <EmptyState title="Aún no hay columnas" body="Añade una columna para empezar a organizar tu trabajo." onAction={() => setColumnDialog({ open: true, column: null })} action="Añadir columna" />}</div>
              </section>
            ) : view === "inbox" ? (
              <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">
                <div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-semibold text-slate-900">Tareas asignadas a ti</h3><p className="mt-1 text-xs text-slate-500">Seguimiento de tareas de {workspaceName}. Este proyecto aún no almacena notificaciones individuales.</p></div>
                <div className="divide-y divide-slate-100">
                  {workspaceTasks.filter((task) => task.assigneeId === currentUserId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map((task) => <button key={task.id} type="button" onClick={() => showTask(task)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"><span className={`size-2 rounded-full ${task.completed ? "bg-emerald-500" : "bg-indigo-500"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{task.title}</span><span className="mt-1 block text-xs text-slate-500">{columns.find((column) => column.id === task.columnId)?.name ?? "Sin columna"} · {task.completed ? "Completada" : "Pendiente"}</span></span><time className="text-[10px] text-slate-400">{new Date(task.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</time></button>)}
                  {!workspaceTasks.some((task) => task.assigneeId === currentUserId) && <div className="px-5 py-10 text-center text-sm text-slate-500">No tienes tareas asignadas en este espacio.</div>}
                </div>
              </section>
            ) : view === "board" ? (
              <div className="-mx-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8">
                {activeColumns.length ? <div className="flex min-h-[420px] min-w-max items-start gap-4">
                  {activeColumns.map((column, index) => {
                    const items = visibleTasks.filter((task) => task.columnId === column.id);
                    return <section key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData("text/task-id")); const task = tasks.find((item) => item.id === id); if (task) void moveTask(task, column.id); }} className="w-[290px] rounded-xl border border-slate-200/80 bg-[#f0f2f8]/75 p-3 sm:w-[310px]">
                      <div className="mb-3 flex items-center gap-2 px-1 py-1">
                        <span className={`size-2 rounded-full ${["bg-indigo-500", "bg-amber-400", "bg-sky-500", "bg-emerald-500"][index % 4]}`} /><h3 className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">{column.name}</h3><span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">{items.length}</span>
                        <div className="relative"><button type="button" aria-label={`Acciones para ${column.name}`} onClick={() => setColumnMenu(columnMenu === column.id ? null : column.id)} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><Icon name="more" size={17} /></button>{columnMenu === column.id && <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"><button type="button" onClick={() => { setColumnMenu(null); setColumnDialog({ open: true, column }); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Icon name="edit" size={14} />Editar nombre</button><button type="button" onClick={() => void deleteColumn(column)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"><Icon name="trash" size={14} />Eliminar columna</button></div>}</div>
                      </div>
                      <div className="space-y-2.5">
                        {items.map((task) => <TaskCard key={task.id} task={task} onClick={() => showTask(task)} onComplete={() => void toggleTaskCompletion(task)} />)}
                        {items.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white/55 px-3 py-7 text-center text-xs text-slate-400">{search || hasFilters || mineOnly ? "No hay resultados." : "Suelta aquí una tarea o crea una nueva."}</div>}
                        <button type="button" onClick={() => setTaskDialog({ open: true, task: null })} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-indigo-700"><Icon name="plus" size={15} />Añadir tarea</button>
                      </div>
                    </section>;
                  })}
                  <button type="button" onClick={() => setColumnDialog({ open: true, column: null })} className="flex h-11 w-[170px] items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-500 transition hover:border-indigo-300 hover:bg-white hover:text-indigo-700"><Icon name="plus" size={16} />Añadir columna</button>
                </div> : <EmptyState title="Tu tablero empieza aquí" body="Crea la primera columna para organizar las tareas de este espacio." onAction={() => setColumnDialog({ open: true, column: null })} action="Añadir primera columna" />}
              </div>
            ) : view === "list" ? (
              <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">
                <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{showRowNumbers && <th className="px-3 py-3 text-right">#</th>}<th className="px-5 py-3">Tarea</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Prioridad</th><th className="px-4 py-3">Asignada a</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3 text-right">Acción</th></tr></thead><tbody>
                  {visibleTasks.map((task, index) => <tr key={task.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">{showRowNumbers && <td className="px-3 py-3.5 text-right text-xs text-slate-400">{index + 1}</td>}<td className="max-w-[340px] px-5 py-3.5"><button type="button" onClick={() => showTask(task)} className={`block truncate text-left text-sm font-semibold hover:text-indigo-700 ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</button>{task.description && <p className="mt-1 truncate text-xs text-slate-400">{task.description}</p>}</td><td className="px-4 py-3.5"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{columns.find((column) => column.id === task.columnId)?.name ?? "Sin estado"}</span></td><td className="px-4 py-3.5"><PriorityPill priority={task.priority} /></td><td className="px-4 py-3.5"><span className="flex items-center gap-2 text-xs text-slate-600"><span className="flex size-6 items-center justify-center rounded-full bg-indigo-50 text-[9px] font-bold text-indigo-600">{initials(task.assigneeName)}</span>{task.assigneeName}</span></td><td className="px-4 py-3.5 text-xs text-slate-500">{new Date(task.dueDate ?? task.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</td><td className="px-4 py-3.5 text-right"><button type="button" aria-label={task.completed ? "Marcar como pendiente" : "Marcar como completada"} onClick={() => void toggleTaskCompletion(task)} className={`rounded-lg p-2 ${task.completed ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"}`}><Icon name="check" size={17} /></button></td></tr>)}
                  </tbody></table></div>
                {visibleTasks.length === 0 && <div className="p-8"><EmptyState title="No hay tareas para mostrar" body="Prueba con otros filtros o crea una tarea nueva." onAction={() => setTaskDialog({ open: true, task: null })} action="Nueva tarea" /></div>}
              </div>
            ) : (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
                <div className="mb-5 flex items-center gap-2"><Icon name="calendar" size={18} /><div><h3 className="text-sm font-semibold text-slate-900">Cronología de tareas</h3><p className="mt-0.5 text-xs text-slate-400">Ordenadas por fecha límite o creación.</p></div></div>
                {visibleTasks.length ? <div className="space-y-5">{[...visibleTasks].sort((a, b) => new Date(a.dueDate ?? a.createdAt).getTime() - new Date(b.dueDate ?? b.createdAt).getTime()).map((task, index, list) => {
                  const date = task.dueDate ?? task.createdAt;
                  const label = new Date(date).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
                  const previous = index ? new Date(list[index - 1].dueDate ?? list[index - 1].createdAt).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : "";
                  return <div key={task.id} className="flex gap-4"><div className="flex w-28 shrink-0 justify-end pt-4 text-right text-[11px] font-semibold capitalize text-slate-400 sm:w-36">{label !== previous ? label : ""}</div><div className="relative flex flex-1 gap-3 border-l border-slate-200 pl-5 pb-1"><span className="absolute -left-[5px] top-[21px] size-2.5 rounded-full border-2 border-white bg-indigo-500 shadow-sm" /><button type="button" onClick={() => showTask(task)} className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left transition hover:border-indigo-100 hover:bg-indigo-50/40"><span className="min-w-0"><span className={`block truncate text-sm font-semibold ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span><span className="mt-1 block truncate text-xs text-slate-400">{columns.find((column) => column.id === task.columnId)?.name ?? "Sin estado"} · {task.dueDate ? "Fecha límite" : "Creada"}</span></span><PriorityPill priority={task.priority} /></button></div></div>;
                })}</div> : <EmptyState title="Tu cronología está vacía" body="Las tareas de este espacio aparecerán aquí." onAction={() => setTaskDialog({ open: true, task: null })} action="Nueva tarea" />}
              </section>
            )}
        </div>
      </main>

      {taskDialog.open && <TaskModal key={taskDialog.task?.id ?? "new-task"} task={taskDialog.task} columns={activeColumns} users={users} isAdmin={isAdmin} commentAuthor={displayName} commentAuthorImage={session.user.image ?? null} mentionUsers={mentionUsers} workspaceId={workspaceId} pusherClient={pusherClient} saving={saving} onClose={() => setTaskDialog({ open: false, task: null })} onSave={saveTask} onDelete={isAdmin ? deleteTask : undefined} />}
      {columnDialog.open && <ColumnModal key={columnDialog.column?.id ?? "new-column"} column={columnDialog.column} workspaceName={workspaceName} saving={saving} onClose={() => setColumnDialog({ open: false, column: null })} onSave={saveColumn} />}
      {workspaceDialogOpen && <WorkspaceModal saving={saving} onClose={() => setWorkspaceDialogOpen(false)} onSave={createWorkspace} />}
      {workspaceEdit && <WorkspaceModal workspace={workspaceEdit} saving={saving} onClose={() => setWorkspaceEdit(null)} onSave={updateWorkspace} />}
      {workspaceDelete && <Modal title="Eliminar espacio de trabajo" subtitle={`¿Seguro que quieres eliminar “${workspaceDelete.name}”? Solo se pueden eliminar espacios sin tareas.`} onClose={() => setWorkspaceDelete(null)}>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => setWorkspaceDelete(null)} className="button-secondary">Cancelar</button>
          <button type="button" disabled={saving} onClick={() => void removeWorkspace(workspaceDelete)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            <Icon name="trash" size={14} />{saving ? "Eliminando..." : "Eliminar espacio"}
          </button>
        </div>
      </Modal>}
      {settingsOpen && <SettingsModal workspaces={workspaces} initialTab={settingsTab} onClose={() => setSettingsOpen(false)} onProfileUpdated={(profile) => {
        setNavigationLabels(profile.settings.navigationLabels);
        setNavigationOrder(profile.settings.navigationOrder);
        setBrowserNotifications(profile.settings.browserNotifications);
        setProjectNotifications(profile.settings.projectNotifications);
        setDoNotDisturb(profile.settings.doNotDisturb);
        setMuteDueToday(profile.settings.muteDueToday);
        setShowRowNumbers(profile.settings.showRowNumbers);
        setUsers((current) => current.map((member) => member.id === profile.id
          ? { ...member, name: profile.name, image: profile.image }
          : member));
        setMentionUsers((current) => current.map((member) => member.id === profile.id
          ? { ...member, name: profile.name ?? "Usuario" }
          : member));
        void updateSession();
      }} />}
      <style jsx global>{`
        @keyframes modal-in { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .form-control { width: 100%; border: 1px solid #e2e8f0; border-radius: 9px; background: white; padding: 9px 11px; font-size: 13px; color: #1e293b; outline: none; transition: border-color .15s, box-shadow .15s; }
        .form-control:focus { border-color: #818cf8; box-shadow: 0 0 0 3px #e0e7ff; }
        .button-primary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 8px; background: #4f46e5; padding: 8px 13px; color: white; font-size: 12px; font-weight: 600; transition: background .15s, opacity .15s; }
        .button-primary:hover { background: #4338ca; }
        .button-primary:disabled { cursor: not-allowed; opacity: .55; }
        .button-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid #e2e8f0; border-radius: 8px; background: white; padding: 8px 12px; color: #475569; font-size: 12px; font-weight: 600; transition: background .15s, color .15s; }
        .button-secondary:hover { background: #f8fafc; color: #1e293b; }
        .search-control { width: 100%; border: 1px solid #e2e8f0; border-radius: 9px; background: #f8fafc; padding: 8px 58px 8px 34px; font-size: 12px; color: #334155; outline: none; transition: border-color .15s, background .15s; }
        .search-control:focus { border-color: #a5b4fc; background: white; }
        .search-control + kbd { pointer-events: none; }
        .relative:has(> svg) > .search-control { position: relative; }
        .relative:has(> svg) > svg { position: absolute; left: 11px; top: 9px; z-index: 1; color: #94a3b8; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      `}</style>
    </div>
  );
}

function TaskCard({ task, onClick, onComplete }: { task: Task; onClick: () => void; onComplete: () => void }) {
  return (
    <article draggable onDragStart={(event) => { event.dataTransfer.setData("text/task-id", String(task.id)); event.dataTransfer.effectAllowed = "move"; }} onClick={onClick} className={`group cursor-grab rounded-lg border bg-white p-3.5 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md active:cursor-grabbing ${task.completed ? "border-emerald-100" : "border-slate-200/80"}`}>
      <div className="mb-2.5 flex items-start justify-between gap-2"><span className={`text-[13px] font-semibold leading-5 ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span><button type="button" aria-label={task.completed ? "Marcar como pendiente" : "Marcar como completada"} onClick={(event) => { event.stopPropagation(); onComplete(); }} className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition ${task.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-indigo-500 hover:text-indigo-500"}`}><Icon name="check" size={12} /></button></div>
      {task.description && <p className="mb-3 line-clamp-2 text-[11px] leading-[1.6] text-slate-500">{task.description}</p>}
      <div className="flex items-center justify-between gap-2"><PriorityPill priority={task.priority} /><div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">{task.dueDate ? new Date(`${task.dueDate}T00:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : ""}</span><span title={`Asignada a ${task.assigneeName}`} className="flex size-6 items-center justify-center rounded-full bg-indigo-50 text-[8px] font-bold text-indigo-600">{initials(task.assigneeName)}</span></div></div>
    </article>
  );
}

function EmptyState({ title, body, onAction, action }: { title: string; body: string; onAction?: () => void; action?: string }) {
  return <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center"><span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name="spark" size={21} /></span><h3 className="text-sm font-semibold text-slate-800">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{body}</p>{onAction && action && <button type="button" onClick={onAction} className="button-primary mt-4"><Icon name="plus" size={15} />{action}</button>}</div>;
}
