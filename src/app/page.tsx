"use client";

import Image from "next/image";
import { signIn, signOut, useSession } from "next-auth/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Priority = "high" | "medium" | "low";
type Workspace = "Producto" | "Marketing" | "Operaciones";
type View = "board" | "list" | "calendar" | "dashboard";

type Column = {
  id: number;
  name: string;
  workspace: Workspace;
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

const workspaces: Workspace[] = ["Producto", "Marketing", "Operaciones"];
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
  const [columnResult, taskResult, userResult] = await Promise.all([
    request<{ columns: Column[] }>("/api/columns", { cache: "no-store" }),
    request<{ tasks: Task[] }>("/api/tasks", { cache: "no-store" }),
    isAdmin
      ? request<{ users: UserOption[] }>("/api/users", { cache: "no-store" })
      : Promise.resolve({ users: [] as UserOption[] }),
  ]);
  return { columns: columnResult.columns, tasks: taskResult.tasks, users: userResult.users };
}

function Icon({
  name,
  size = 18,
}: {
  name: "search" | "plus" | "filter" | "board" | "list" | "calendar" | "chart" | "inbox" | "chevron" | "more" | "clock" | "check" | "close" | "arrow" | "spark" | "trash" | "edit";
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
      <section role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-xl" : "max-w-md"} animate-[modal-in_.18s_ease-out] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl`}>
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
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task | null;
  columns: Column[];
  users: UserOption[];
  isAdmin: boolean;
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
          {isAdmin ? (
            <input autoFocus required maxLength={180} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="¿Qué hay que hacer?" className="form-control text-base font-medium" />
          ) : <p className="text-sm font-medium text-slate-800">{draft.title}</p>}
        </Field>
        <Field label="Descripción">
          {isAdmin ? (
            <textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Añade contexto o próximos pasos..." className="form-control resize-y" />
          ) : <p className="whitespace-pre-wrap text-sm text-slate-600">{draft.description || "Sin descripción."}</p>}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Columna">
            <select required value={draft.columnId} onChange={(event) => setDraft({ ...draft, columnId: event.target.value })} className="form-control">
              {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            {isAdmin ? (
              <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })} className="form-control">
                {(["high", "medium", "low"] as Priority[]).map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
              </select>
            ) : <PriorityPill priority={draft.priority} />}
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
            {isAdmin ? (
              <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="form-control" />
            ) : <p className="text-sm text-slate-600">{draft.dueDate || "Sin fecha límite."}</p>}
          </Field>
        </div>
        {task && <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={draft.completed} onChange={(event) => setDraft({ ...draft, completed: event.target.checked })} className="size-4 accent-indigo-600" />Marcar como completada</label>}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          {isAdmin && task && onDelete ? (
            <button type="button" disabled={saving || removing} onClick={async () => { setRemoving(true); try { await onDelete(task.id); } finally { setRemoving(false); } }} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Icon name="trash" size={16} />Eliminar</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="button-secondary">Cancelar</button>
            <button type="submit" disabled={saving || !draft.columnId} className="button-primary">{saving ? "Guardando..." : isAdmin ? task ? "Guardar cambios" : "Crear tarea" : "Actualizar estado"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ColumnModal({
  column,
  workspace,
  saving,
  onClose,
  onSave,
}: {
  column: Column | null;
  workspace: Workspace;
  saving: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(column?.name ?? "");
  return (
    <Modal title={column ? "Editar columna" : "Añadir columna"} subtitle={column ? "Cambia el nombre de esta etapa." : `Crea una etapa para ${workspace}.`} onClose={onClose}>
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

function PriorityPill({ priority }: { priority: Priority }) {
  const color = priority === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : priority === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${color}`}><span className="size-1.5 rounded-full bg-current" />{priorityLabels[priority]}</span>;
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
  const { data: session, status } = useSession();
  const isAdmin = session?.user.role === "ADMIN";
  const currentUserId = session?.user.id;
  const displayName = session?.user.name ?? session?.user.email ?? "Usuario";
  const roleLabel = isAdmin ? "ADMIN" : "MEMBER";
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [workspace, setWorkspace] = useState<Workspace>("Producto");
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
  const [columnMenu, setColumnMenu] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await loadBoardData(isAdmin);
      setColumns(data.columns);
      setTasks(data.tasks);
      setUsers(data.users);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el tablero.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    loadBoardData(isAdmin)
      .then((data) => {
        if (!active) return;
        setColumns(data.columns);
        setTasks(data.tasks);
        setUsers(data.users);
        setError("");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el tablero.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [status, isAdmin]);

  async function mutate<T>(url: string, init?: RequestInit): Promise<T | null> {
    setSaving(true);
    setError("");
    try {
      const result = await request<T>(url, init);
      await refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  const activeColumns = useMemo(() => columns.filter((column) => column.workspace === workspace), [columns, workspace]);
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

  async function saveTask(draft: TaskDraft, id?: number) {
    const result = await mutate<{ task: Task }>(id ? "/api/tasks" : "/api/tasks", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(id && !isAdmin
        ? { id, columnId: Number(draft.columnId), completed: draft.completed }
        : {
            ...(id ? { id } : {}),
            title: draft.title,
            description: draft.description,
            priority: draft.priority,
            columnId: Number(draft.columnId),
            assigneeId: draft.assigneeId || null,
            dueDate: draft.dueDate || null,
            ...(id ? { completed: draft.completed } : {}),
          }),
    });
    if (result) setTaskDialog({ open: false, task: null });
  }

  async function deleteTask(id: number) {
    const result = await mutate<{ success: boolean }>(`/api/tasks?id=${id}`, { method: "DELETE" });
    if (result) setTaskDialog({ open: false, task: null });
  }

  async function saveColumn(name: string) {
    const editing = columnDialog.column;
    const result = await mutate<{ column: Column }>("/api/columns", {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify(editing ? { id: editing.id, name } : { name, workspace }),
    });
    if (result) setColumnDialog({ open: false, column: null });
  }

  async function deleteColumn(column: Column) {
    setColumnMenu(null);
    const result = await mutate<{ success: boolean }>(`/api/columns?id=${column.id}`, { method: "DELETE" });
    if (result) setError("");
  }

  async function moveTask(task: Task, columnId: number) {
    if (task.columnId === columnId) return;
    await mutate("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, columnId }) });
  }

  function showTask(task: Task) {
    setTaskDialog({ open: true, task });
  }

  const viewNames: Record<View, string> = { board: "Tablero", list: "Lista", calendar: "Calendario", dashboard: "Resumen" };

  if (status === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] text-sm text-slate-500">Verificando sesión…</main>;
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-5 py-10">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-200/50">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white"><Icon name="spark" size={22} /></span>
          <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Under Control Workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Inicia sesión para ver tu espacio de trabajo y las tareas que tienes asignadas.</p>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={() => void signIn("google")} className="button-secondary w-full !py-3">Continuar con Google</button>
            <button type="button" onClick={() => void signIn("apple")} className="button-secondary w-full !py-3">Continuar con Apple</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[252px] flex-col border-r border-slate-200/80 bg-white px-4 py-5 lg:flex">
        <a href="#" className="mb-9 flex items-center gap-3 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200"><Icon name="spark" size={20} /></span>
          <span><span className="block text-[15px] font-bold tracking-tight text-slate-900">Under Control</span><span className="text-[11px] font-medium text-slate-400">WORKSPACE</span></span>
        </a>

        <div className="px-2">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Espacios de trabajo</div>
          <nav className="space-y-1">
            {workspaces.map((item, index) => (
              <button key={item} type="button" onClick={() => { setWorkspace(item); setMineOnly(false); setColumnFilter("all"); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${workspace === item ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
                <span className={`size-2 rounded-full ${["bg-violet-500", "bg-orange-400", "bg-teal-500"][index]}`} />{item}<span className="ml-auto text-[11px] text-slate-400">{columns.filter((column) => column.workspace === item).length}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-8 px-2">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Tu espacio</div>
          <button type="button" onClick={() => setMineOnly(!mineOnly)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${mineOnly ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="inbox" size={17} />Mis tareas<span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{workspaceTasks.filter((task) => task.assigneeId === currentUserId).length}</span></button>
          <button type="button" onClick={() => { setView("dashboard"); setMineOnly(false); }} className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${view === "dashboard" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="chart" size={17} />Panel de resumen</button>
        </div>

        <div className="mt-auto rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-900"><Icon name="spark" size={15} />Todo en orden</div>
          <p className="text-[11px] leading-5 text-indigo-800/70">{completedCount} de {workspaceTasks.length} tareas completadas en {workspace}.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${workspaceTasks.length ? completedCount / workspaceTasks.length * 100 : 0}%` }} /></div>
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 px-1 pt-4">
          <UserAvatar image={session.user.image ?? null} name={displayName} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{displayName}</span><span className="block text-[10px] text-slate-400">{roleLabel}</span></span>
        </div>
      </aside>

      <main className="min-h-screen lg:ml-[252px]">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="size-2.5 rounded-full bg-violet-500 lg:hidden" />
              <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="hidden truncate text-[15px] font-bold text-slate-900 lg:block">{workspace}</h1><span className="hidden lg:block"><Icon name="chevron" size={14} /></span><select aria-label="Espacio de trabajo" value={workspace} onChange={(event) => { setWorkspace(event.target.value as Workspace); setMineOnly(false); setColumnFilter("all"); }} className="max-w-36 rounded-md border-0 bg-transparent p-0 text-[14px] font-bold text-slate-900 outline-none lg:hidden">{workspaces.map((item) => <option key={item} value={item}>{item}</option>)}</select><p className="mt-0.5 hidden text-[11px] text-slate-400 sm:block">Workspace / {workspace}</p></div></div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
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
              <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
                <UserAvatar image={session.user.image ?? null} name={displayName} />
                <div className="hidden max-w-36 sm:block">
                  <p className="truncate text-xs font-semibold text-slate-800">{displayName}</p>
                  <span className={`text-[10px] font-semibold ${isAdmin ? "text-indigo-600" : "text-slate-500"}`}>{roleLabel}</span>
                </div>
                <button type="button" onClick={() => void signOut({ redirectTo: "/" })} className="button-secondary !px-2.5">Salir</button>
              </div>
              {isAdmin && <button type="button" onClick={() => setTaskDialog({ open: true, task: null })} disabled={activeColumns.length === 0} className="button-primary !px-3"><Icon name="plus" size={17} /><span className="hidden sm:inline">Nueva tarea</span><span className="sm:hidden">Nueva</span></button>}
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-5 pb-12 pt-7 sm:px-8">
          <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-400"><span>Workspace</span><span>/</span><span className="text-indigo-600">{workspace}</span></div><h2 className="text-[26px] font-bold tracking-[-.04em] text-slate-900 sm:text-[30px]">{view === "dashboard" ? "Panel de resumen" : "Hola, aquí está tu trabajo."}</h2><p className="mt-1 text-sm text-slate-500">{view === "dashboard" ? `Un vistazo al progreso de ${workspace}.` : "Organiza tus prioridades y mantén el ritmo del equipo."}</p></div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                {(["board", "list", "calendar", "dashboard"] as View[]).map((item) => <button key={item} type="button" aria-label={`Vista ${viewNames[item]}`} onClick={() => setView(item)} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === item ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}><Icon name={item === "board" ? "board" : item === "list" ? "list" : item === "calendar" ? "calendar" : "chart"} size={15} /><span className="hidden sm:inline">{viewNames[item]}</span></button>)}
              </div>
              {isAdmin && <button type="button" onClick={() => setColumnDialog({ open: true, column: null })} className="button-secondary"><Icon name="plus" size={16} />Añadir columna</button>}
            </div>
          </div>

          <div className="mb-5 flex gap-2 sm:hidden"><div className="relative flex-1"><Icon name="search" size={16} /><input aria-label="Buscar tareas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tareas..." className="search-control" /></div></div>

          {mineOnly && <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700"><Icon name="inbox" size={15} />Mostrando solo tus tareas<button type="button" onClick={() => setMineOnly(false)} className="ml-auto underline underline-offset-2">Ver todas</button></div>}
          {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span className="font-bold">!</span><p className="flex-1">{error}</p><button type="button" aria-label="Descartar aviso" onClick={() => setError("")}><Icon name="close" size={16} /></button></div>}

          {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white p-4"><div className="h-3 w-24 rounded bg-slate-100" /><div className="mt-6 h-20 rounded-lg bg-slate-50" /><div className="mt-3 h-20 rounded-lg bg-slate-50" /></div>)}</div> :
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
                  {activeColumns.length ? <div className="space-y-5">{activeColumns.map((column) => { const group = workspaceTasks.filter((task) => task.columnId === column.id); const done = group.filter((task) => task.completed).length; return <div key={column.id}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-slate-700">{column.name}</span><span className="text-xs text-slate-400">{done} / {group.length} completadas</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${group.length ? done / group.length * 100 : 0}%` }} /></div></div>; })}</div> : <EmptyState title="Aún no hay columnas" body="Añade una columna para empezar a organizar tu trabajo." onAction={isAdmin ? () => setColumnDialog({ open: true, column: null }) : undefined} action={isAdmin ? "Añadir columna" : undefined} />}</div>
              </section>
            ) : view === "board" ? (
              <div className="-mx-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8">
                {activeColumns.length ? <div className="flex min-h-[420px] min-w-max items-start gap-4">
                  {activeColumns.map((column, index) => {
                    const items = visibleTasks.filter((task) => task.columnId === column.id);
                    return <section key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData("text/task-id")); const task = tasks.find((item) => item.id === id); if (task) void moveTask(task, column.id); }} className="w-[290px] rounded-xl border border-slate-200/80 bg-[#f0f2f8]/75 p-3 sm:w-[310px]">
                      <div className="mb-3 flex items-center gap-2 px-1 py-1">
                        <span className={`size-2 rounded-full ${["bg-indigo-500", "bg-amber-400", "bg-sky-500", "bg-emerald-500"][index % 4]}`} /><h3 className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">{column.name}</h3><span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">{items.length}</span>
                        {isAdmin && <div className="relative"><button type="button" aria-label={`Acciones para ${column.name}`} onClick={() => setColumnMenu(columnMenu === column.id ? null : column.id)} className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"><Icon name="more" size={17} /></button>{columnMenu === column.id && <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"><button type="button" onClick={() => { setColumnMenu(null); setColumnDialog({ open: true, column }); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Icon name="edit" size={14} />Editar nombre</button><button type="button" onClick={() => void deleteColumn(column)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"><Icon name="trash" size={14} />Eliminar columna</button></div>}</div>}
                      </div>
                      <div className="space-y-2.5">
                        {items.map((task) => <TaskCard key={task.id} task={task} onClick={() => showTask(task)} onComplete={() => void mutate("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, completed: !task.completed }) })} />)}
                        {items.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white/55 px-3 py-7 text-center text-xs text-slate-400">{search || hasFilters || mineOnly ? "No hay resultados." : "Suelta aquí una tarea o crea una nueva."}</div>}
                        {isAdmin && <button type="button" onClick={() => setTaskDialog({ open: true, task: null })} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-indigo-700"><Icon name="plus" size={15} />Añadir tarea</button>}
                      </div>
                    </section>;
                  })}
                  {isAdmin && <button type="button" onClick={() => setColumnDialog({ open: true, column: null })} className="flex h-11 w-[170px] items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-500 transition hover:border-indigo-300 hover:bg-white hover:text-indigo-700"><Icon name="plus" size={16} />Añadir columna</button>}
                </div> : <EmptyState title="Tu tablero empieza aquí" body="Crea la primera columna para organizar las tareas de este espacio." onAction={isAdmin ? () => setColumnDialog({ open: true, column: null }) : undefined} action={isAdmin ? "Añadir primera columna" : undefined} />}
              </div>
            ) : view === "list" ? (
              <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">
                <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead><tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400"><th className="px-5 py-3">Tarea</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Prioridad</th><th className="px-4 py-3">Asignada a</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3 text-right">Acción</th></tr></thead><tbody>
                  {visibleTasks.map((task) => <tr key={task.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="max-w-[340px] px-5 py-3.5"><button type="button" onClick={() => showTask(task)} className={`block truncate text-left text-sm font-semibold hover:text-indigo-700 ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</button>{task.description && <p className="mt-1 truncate text-xs text-slate-400">{task.description}</p>}</td><td className="px-4 py-3.5"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{columns.find((column) => column.id === task.columnId)?.name ?? "Sin estado"}</span></td><td className="px-4 py-3.5"><PriorityPill priority={task.priority} /></td><td className="px-4 py-3.5"><span className="flex items-center gap-2 text-xs text-slate-600"><span className="flex size-6 items-center justify-center rounded-full bg-indigo-50 text-[9px] font-bold text-indigo-600">{initials(task.assigneeName)}</span>{task.assigneeName}</span></td><td className="px-4 py-3.5 text-xs text-slate-500">{new Date(task.dueDate ?? task.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</td><td className="px-4 py-3.5 text-right"><button type="button" aria-label={task.completed ? "Marcar como pendiente" : "Marcar como completada"} onClick={() => void mutate("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, completed: !task.completed }) })} className={`rounded-lg p-2 ${task.completed ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"}`}><Icon name="check" size={17} /></button></td></tr>)}
                  </tbody></table></div>
                {visibleTasks.length === 0 && <div className="p-8"><EmptyState title="No hay tareas para mostrar" body="Prueba con otros filtros o crea una tarea nueva." onAction={isAdmin ? () => setTaskDialog({ open: true, task: null }) : undefined} action={isAdmin ? "Nueva tarea" : undefined} /></div>}
              </div>
            ) : (
              <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
                <div className="mb-5 flex items-center gap-2"><Icon name="calendar" size={18} /><div><h3 className="text-sm font-semibold text-slate-900">Cronología de tareas</h3><p className="mt-0.5 text-xs text-slate-400">Ordenadas por fecha límite o creación.</p></div></div>
                {visibleTasks.length ? <div className="space-y-5">{[...visibleTasks].sort((a, b) => new Date(a.dueDate ?? a.createdAt).getTime() - new Date(b.dueDate ?? b.createdAt).getTime()).map((task, index, list) => {
                  const date = task.dueDate ?? task.createdAt;
                  const label = new Date(date).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
                  const previous = index ? new Date(list[index - 1].dueDate ?? list[index - 1].createdAt).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : "";
                  return <div key={task.id} className="flex gap-4"><div className="flex w-28 shrink-0 justify-end pt-4 text-right text-[11px] font-semibold capitalize text-slate-400 sm:w-36">{label !== previous ? label : ""}</div><div className="relative flex flex-1 gap-3 border-l border-slate-200 pl-5 pb-1"><span className="absolute -left-[5px] top-[21px] size-2.5 rounded-full border-2 border-white bg-indigo-500 shadow-sm" /><button type="button" onClick={() => showTask(task)} className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left transition hover:border-indigo-100 hover:bg-indigo-50/40"><span className="min-w-0"><span className={`block truncate text-sm font-semibold ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span><span className="mt-1 block truncate text-xs text-slate-400">{columns.find((column) => column.id === task.columnId)?.name ?? "Sin estado"} · {task.dueDate ? "Fecha límite" : "Creada"}</span></span><PriorityPill priority={task.priority} /></button></div></div>;
                })}</div> : <EmptyState title="Tu cronología está vacía" body="Las tareas de este espacio aparecerán aquí." onAction={isAdmin ? () => setTaskDialog({ open: true, task: null }) : undefined} action={isAdmin ? "Nueva tarea" : undefined} />}
              </section>
            )}
        </div>
      </main>

      {taskDialog.open && <TaskModal key={taskDialog.task?.id ?? "new-task"} task={taskDialog.task} columns={activeColumns} users={users} isAdmin={isAdmin} saving={saving} onClose={() => setTaskDialog({ open: false, task: null })} onSave={saveTask} onDelete={isAdmin ? deleteTask : undefined} />}
      {columnDialog.open && <ColumnModal key={columnDialog.column?.id ?? "new-column"} column={columnDialog.column} workspace={workspace} saving={saving} onClose={() => setColumnDialog({ open: false, column: null })} onSave={saveColumn} />}
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
