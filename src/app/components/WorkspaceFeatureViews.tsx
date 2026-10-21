"use client";

import Image from "next/image";
import Pusher from "pusher-js";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Task = {
  id: number;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  columnId: number;
  assigneeId: string | null;
  assignees: { id: string }[];
  completed: boolean;
  dueDate: string | null;
};

type Column = { id: number; name: string };
type AgentKey = "auto_assign" | "task_summary" | "due_date_watch";
type Agent = { key: AgentKey; name: string; enabled: boolean };
type AgentLog = { id: number; agentKey: AgentKey; action: string; details: string; createdAt: string };
type Goal = { id: number; title: string; description: string; current: number; target: number };
type Article = {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  authorName: string | null;
  updatedAt: string;
};
type Person = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "ADMIN" | "MEMBER";
  jobTitle: string | null;
  department: string | null;
  about: string | null;
  outOfOffice: boolean;
  tasks: Task[];
};
type FeatureView = "agents" | "strategy" | "knowledge" | "people";

const viewDetails: Record<FeatureView, { title: string; description: string }> = {
  agents: { title: "Agentes", description: "Configura y ejecuta automatizaciones útiles para este espacio." },
  strategy: { title: "Estrategia", description: "Métricas del tablero y objetivos medibles del equipo." },
  knowledge: { title: "Conocimientos", description: "Guías internas y documentación Markdown compartida." },
  people: { title: "Personas", description: "Directorio del equipo, disponibilidad y carga de trabajo actual." },
};

const priorityNames = { high: "Alta", medium: "Media", low: "Baja" };

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo completar la solicitud.");
  return result;
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`feature-panel rounded-xl border p-5 shadow-sm ${className}`}>{children}</section>;
}

function ProgressBar({ value, color = "var(--ui-accent)" }: { value: number; color?: string }) {
  return (
    <div className="feature-track h-2 overflow-hidden rounded-full">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} />
    </div>
  );
}

export function WorkspaceFeatureViews({
  view,
  workspaceId,
  workspaceName,
  tasks,
  columns,
  pusherClient,
}: {
  view: FeatureView;
  workspaceId: number | null;
  workspaceName: string;
  tasks: Task[];
  columns: Column[];
  pusherClient: Pusher | null;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [articleSearch, setArticleSearch] = useState("");
  const [articleFormOpen, setArticleFormOpen] = useState(false);
  const [articleEditor, setArticleEditor] = useState<Article | null>(null);
  const [articleTitle, setArticleTitle] = useState("");
  const [articleContent, setArticleContent] = useState("");
  const [articleCategory, setArticleCategory] = useState("Procesos");
  const [articleTags, setArticleTags] = useState("");
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [goalEditor, setGoalEditor] = useState<Goal | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("0");
  const [goalTarget, setGoalTarget] = useState("100");
  const [expandedPeople, setExpandedPeople] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    const query = `?workspaceId=${workspaceId}`;
    const load = async () => {
      try {
        if (view === "agents") {
          const result = await apiRequest<{ agents: Agent[]; logs: AgentLog[] }>(`/api/agents${query}`, { cache: "no-store" });
          if (active) { setAgents(result.agents); setLogs(result.logs); }
        } else if (view === "strategy") {
          const result = await apiRequest<{ goals: Goal[] }>(`/api/strategy/goals${query}`, { cache: "no-store" });
          if (active) setGoals(result.goals);
        } else if (view === "knowledge") {
          const result = await apiRequest<{ articles: Article[] }>(`/api/knowledge${query}`, { cache: "no-store" });
          if (active) setArticles(result.articles);
        } else {
          const result = await apiRequest<{ people: Person[] }>(`/api/people${query}`, { cache: "no-store" });
          if (active) setPeople(result.people);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      void load();
    });
    return () => { active = false; };
  }, [workspaceId, view, refreshKey]);

  useEffect(() => {
    if (!pusherClient || !workspaceId) return;
    const channel = pusherClient.channel(`private-workspace-${workspaceId}`);
    if (!channel) return;
    const refresh = () => setRefreshKey((key) => key + 1);
    const eventNames = [
      "agent:updated",
      "strategy:updated",
      "knowledge:updated",
      "profile:updated",
      "task:created",
      "task:updated",
      "task:moved",
      "task:deleted",
    ];
    for (const eventName of eventNames) channel.bind(eventName, refresh);
    return () => {
      for (const eventName of eventNames) channel.unbind(eventName, refresh);
    };
  }, [pusherClient, workspaceId]);

  const filteredArticles = useMemo(() => {
    const query = articleSearch.trim().toLocaleLowerCase();
    if (!query) return articles;
    return articles.filter((article) =>
      `${article.title} ${article.content} ${article.category} ${article.tags.join(" ")}`.toLocaleLowerCase().includes(query),
    );
  }, [articles, articleSearch]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAgent(agent: Agent) {
    await perform(async () => {
      const result = await apiRequest<{ enabled: boolean; log: AgentLog }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ workspaceId, agentKey: agent.key, action: "toggle", enabled: !agent.enabled }),
      });
      setAgents((current) => current.map((item) => item.key === agent.key ? { ...item, enabled: result.enabled } : item));
      setLogs((current) => [result.log, ...current].slice(0, 50));
    });
  }

  async function runAgent(agent: Agent) {
    await perform(async () => {
      const result = await apiRequest<{ log: AgentLog }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ workspaceId, agentKey: agent.key, action: "run" }),
      });
      setLogs((current) => [result.log, ...current].slice(0, 50));
      setRefreshKey((key) => key + 1);
    });
  }

  function beginGoalEdit(goal?: Goal) {
    setGoalFormOpen(true);
    setGoalEditor(goal ?? null);
    setGoalTitle(goal?.title ?? "");
    setGoalDescription(goal?.description ?? "");
    setGoalCurrent(String(goal?.current ?? 0));
    setGoalTarget(String(goal?.target ?? 100));
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const payload = {
        title: goalTitle,
        description: goalDescription,
        current: Number(goalCurrent),
        target: Number(goalTarget),
        ...(goalEditor ? { id: goalEditor.id } : { workspaceId }),
      };
      const result = await apiRequest<{ goal: Goal }>("/api/strategy/goals", {
        method: goalEditor ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setGoals((current) => goalEditor
        ? current.map((goal) => goal.id === result.goal.id ? result.goal : goal)
        : [...current, result.goal]);
      setGoalFormOpen(false);
      setGoalEditor(null);
    });
  }

  async function removeGoal(goal: Goal) {
    if (!window.confirm(`¿Eliminar la meta “${goal.title}”?`)) return;
    await perform(async () => {
      await apiRequest(`/api/strategy/goals?id=${goal.id}`, { method: "DELETE" });
      setGoals((current) => current.filter((item) => item.id !== goal.id));
      if (goalEditor?.id === goal.id) { setGoalEditor(null); setGoalFormOpen(false); }
    });
  }

  function beginArticleEdit(article?: Article) {
    setArticleFormOpen(true);
    setArticleEditor(article ?? null);
    setArticleTitle(article?.title ?? "");
    setArticleContent(article?.content ?? "");
    setArticleCategory(article?.category ?? "Procesos");
    setArticleTags(article?.tags.join(", ") ?? "");
  }

  async function saveArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const payload = {
        title: articleTitle,
        content: articleContent,
        category: articleCategory,
        tags: articleTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        ...(articleEditor ? { id: articleEditor.id } : { workspaceId }),
      };
      const result = await apiRequest<{ article: Article }>("/api/knowledge", {
        method: articleEditor ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setArticles((current) => articleEditor
        ? current.map((article) => article.id === result.article.id ? result.article : article)
        : [result.article, ...current]);
      setArticleFormOpen(false);
      setArticleEditor(null);
    });
  }

  async function removeArticle(article: Article) {
    if (!window.confirm(`¿Eliminar el artículo “${article.title}”?`)) return;
    await perform(async () => {
      await apiRequest(`/api/knowledge?id=${article.id}`, { method: "DELETE" });
      setArticles((current) => current.filter((item) => item.id !== article.id));
      if (articleEditor?.id === article.id) { setArticleEditor(null); setArticleFormOpen(false); }
    });
  }

  const completedCount = tasks.filter((task) => task.completed).length;
  const openCount = tasks.length - completedCount;
  const priorityCounts = {
    high: tasks.filter((task) => !task.completed && task.priority === "high").length,
    medium: tasks.filter((task) => !task.completed && task.priority === "medium").length,
    low: tasks.filter((task) => !task.completed && task.priority === "low").length,
  };
  const detail = viewDetails[view];

  return (
    <section className="space-y-5">
      <header>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
          <span>Trabajo</span><span>/</span><span>{workspaceName}</span><span>/</span><span className="text-indigo-600">{detail.title}</span>
        </div>
        <h2 className="text-[26px] font-bold tracking-[-.04em] text-slate-900 sm:text-[30px]">{detail.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{detail.description}</p>
      </header>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {!workspaceId && <Panel>Selecciona o crea un espacio de trabajo para consultar esta sección.</Panel>}
      {loading && workspaceId && <Panel><p className="animate-pulse text-sm text-slate-500">Cargando información actualizada…</p></Panel>}

      {!loading && workspaceId && view === "agents" && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {agents.map((agent) => (
              <Panel key={agent.key} className="space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{agent.name}</h3>
                  <p className="feature-muted mt-1 text-xs leading-5">
                    {agent.key === "auto_assign" ? "Distribuye tareas abiertas sin responsable al miembro con menor carga activa." :
                      agent.key === "task_summary" ? "Genera un resumen de avance y prioridades pendientes del tablero." :
                        "Busca tareas abiertas que vencen durante los próximos siete días."}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" role="switch" aria-checked={agent.enabled} disabled={busy} onClick={() => void toggleAgent(agent)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${agent.enabled ? "bg-[var(--ui-accent)]" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${agent.enabled ? "left-[22px]" : "left-0.5"}`} />
                    <span className="sr-only">{agent.enabled ? "Desactivar" : "Activar"} {agent.name}</span>
                  </button>
                  <span className={`text-xs font-medium ${agent.enabled ? "text-emerald-600" : "feature-muted"}`}>{agent.enabled ? "Activo" : "Pausado"}</span>
                  <button type="button" disabled={busy} onClick={() => void runAgent(agent)} className="button-secondary ml-auto !px-3 !py-1.5 text-xs">
                    {busy ? "Ejecutando…" : "Ejecutar ahora"}
                  </button>
                </div>
              </Panel>
            ))}
          </div>
          <Panel>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 className="font-semibold text-slate-900">Registro de actividad</h3><p className="feature-muted mt-1 text-xs">Ejecuciones y cambios recientes de los agentes.</p></div>
              <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="button-secondary !px-3 !py-1.5 text-xs">Actualizar</button>
            </div>
            {logs.length ? <ol className="divide-y divide-slate-100">
              {logs.map((log) => <li key={log.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-semibold text-slate-800">{agentNamesForKey(log.agentKey)}</span>
                  <span className="feature-muted">· {log.action}</span>
                  <time className="feature-muted ml-auto">{new Date(log.createdAt).toLocaleString("es-MX")}</time>
                </div>
                <p className="feature-muted mt-1 text-sm leading-6">{log.details}</p>
              </li>)}
            </ol> : <p className="feature-muted py-5 text-center text-sm">Aún no hay actividad. Ejecuta un agente para generar su primer registro.</p>}
          </Panel>
        </>
      )}

      {!loading && workspaceId && view === "strategy" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Tareas completadas", value: completedCount, total: tasks.length },
              { label: "Tareas pendientes", value: openCount, total: tasks.length },
              { label: "Avance del tablero", value: tasks.length ? Math.round(completedCount / tasks.length * 100) : 0, total: 100, suffix: "%" },
            ].map((stat) => <Panel key={stat.label}>
              <p className="feature-muted text-sm">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{stat.value}{stat.suffix ?? ""}{!stat.suffix && <span className="feature-muted ml-1 text-sm font-medium">/ {stat.total}</span>}</p>
              <div className="mt-4"><ProgressBar value={stat.total ? stat.value / stat.total * 100 : 0} /></div>
            </Panel>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h3 className="mb-4 font-semibold text-slate-900">Prioridad de tareas abiertas</h3>
              <div className="space-y-4">
                {(["high", "medium", "low"] as const).map((priority) => <div key={priority}>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-700">{priorityNames[priority]}</span><span className="feature-muted">{priorityCounts[priority]}</span></div>
                  <ProgressBar value={openCount ? priorityCounts[priority] / openCount * 100 : 0}
                    color={priority === "high" ? "#ef4444" : priority === "medium" ? "#f59e0b" : "#10b981"} />
                </div>)}
              </div>
            </Panel>
            <Panel>
              <h3 className="mb-4 font-semibold text-slate-900">Productividad por colaborador</h3>
              {people.length ? <div className="space-y-3">
                {people.map((person) => {
                  const assigned = tasks.filter((task) =>
                    task.assigneeId === person.id || task.assignees.some((assignee) => assignee.id === person.id),
                  );
                  const done = assigned.filter((task) => task.completed).length;
                  return <div key={person.id} className="flex items-center gap-3">
                    <PersonAvatar person={person} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{person.name ?? person.email ?? "Miembro"}</span>
                    <span className="feature-muted text-xs">{done}/{assigned.length}</span>
                    <div className="w-20"><ProgressBar value={assigned.length ? done / assigned.length * 100 : 0} /></div>
                  </div>;
                })}
              </div> : <p className="feature-muted text-sm">No hay colaboradores para mostrar.</p>}
            </Panel>
          </div>
          <Panel>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 className="font-semibold text-slate-900">Metas y resultados clave</h3><p className="feature-muted mt-1 text-xs">Avance compartido y persistente para {workspaceName}.</p></div>
              <button type="button" onClick={() => beginGoalEdit()} className="button-primary !px-3 !py-2 text-xs">Nueva meta</button>
            </div>
            {goalFormOpen ? (
              <form onSubmit={(event) => void saveGoal(event)} className="mb-5 grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">Título<input required maxLength={160} value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} className="feature-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                <label className="text-xs font-medium text-slate-600">Descripción<input maxLength={2000} value={goalDescription} onChange={(event) => setGoalDescription(event.target.value)} className="feature-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                <label className="text-xs font-medium text-slate-600">Avance actual<input type="number" min="0" max="1000000" required value={goalCurrent} onChange={(event) => setGoalCurrent(event.target.value)} className="feature-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                <label className="text-xs font-medium text-slate-600">Objetivo<input type="number" min="1" max="1000000" required value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} className="feature-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <button type="button" onClick={() => { setGoalFormOpen(false); setGoalEditor(null); }} className="button-secondary !py-2 text-xs">Cancelar</button>
                  <button type="submit" disabled={busy} className="button-primary !py-2 text-xs">{busy ? "Guardando…" : goalEditor ? "Guardar cambios" : "Crear meta"}</button>
                </div>
              </form>
            ) : null}
            {goals.length ? <div className="grid gap-3 md:grid-cols-2">
              {goals.map((goal) => <article key={goal.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h4 className="font-semibold text-slate-800">{goal.title}</h4>{goal.description && <p className="feature-muted mt-1 text-xs">{goal.description}</p>}</div>
                  <button type="button" aria-label={`Editar meta ${goal.title}`} onClick={() => beginGoalEdit(goal)} className="feature-link text-xs font-medium">Editar</button>
                  <button type="button" aria-label={`Eliminar meta ${goal.title}`} disabled={busy} onClick={() => void removeGoal(goal)} className="text-xs font-medium text-rose-600">Eliminar</button>
                </div>
                <div className="mb-2 mt-4 flex justify-between text-xs"><span className="text-slate-600">{goal.current} / {goal.target}</span><span className="feature-muted">{Math.round(Math.min(100, goal.current / goal.target * 100))}%</span></div>
                <ProgressBar value={goal.current / goal.target * 100} />
                <button type="button" disabled={busy} onClick={() => void perform(async () => {
                  const result = await apiRequest<{ goal: Goal }>("/api/strategy/goals", {
                    method: "PATCH",
                    body: JSON.stringify({ id: goal.id, current: Math.min(goal.current + 1, 1_000_000) }),
                  });
                  setGoals((current) => current.map((item) => item.id === result.goal.id ? result.goal : item));
                })} className="feature-link mt-3 text-xs font-semibold">+ Marcar avance</button>
              </article>)}
            </div> : <p className="feature-muted py-5 text-center text-sm">Crea una meta para empezar a medir resultados.</p>}
          </Panel>
        </>
      )}

      {!loading && workspaceId && view === "knowledge" && (
        <>
          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1"><span className="sr-only">Buscar artículos</span><input type="search" value={articleSearch} onChange={(event) => setArticleSearch(event.target.value)} placeholder="Buscar por título, contenido, categoría o etiqueta…" className="feature-input w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <button type="button" onClick={() => beginArticleEdit()} className="button-primary !px-3 !py-2 text-sm">Nuevo artículo</button>
            </div>
          </Panel>
          {articleFormOpen ? (
            <Panel>
              <form onSubmit={(event) => void saveArticle(event)} className="space-y-3">
                <h3 className="font-semibold text-slate-900">{articleEditor ? "Editar artículo" : "Nuevo artículo"}</h3>
                <label className="block text-xs font-medium text-slate-600">Título<input required maxLength={180} value={articleTitle} onChange={(event) => setArticleTitle(event.target.value)} className="feature-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-600">Categoría<input required maxLength={60} value={articleCategory} onChange={(event) => setArticleCategory(event.target.value)} placeholder="Procesos, Técnico, Onboarding…" className="feature-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                  <label className="block text-xs font-medium text-slate-600">Etiquetas, separadas por comas<input value={articleTags} onChange={(event) => setArticleTags(event.target.value)} placeholder="onboarding, equipo" className="feature-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                </div>
                <label className="block text-xs font-medium text-slate-600">Contenido Markdown<textarea required maxLength={50000} rows={9} value={articleContent} onChange={(event) => setArticleContent(event.target.value)} placeholder="# Título&#10;&#10;Escribe aquí una guía para el equipo…" className="feature-input mt-1.5 w-full resize-y rounded-lg border px-3 py-2 font-mono text-sm" /></label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setArticleFormOpen(false); setArticleEditor(null); }} className="button-secondary !py-2 text-xs">Cancelar</button>
                  <button type="submit" disabled={busy} className="button-primary !py-2 text-xs">{busy ? "Guardando…" : articleEditor ? "Guardar cambios" : "Publicar artículo"}</button>
                </div>
              </form>
            </Panel>
          ) : null}
          {filteredArticles.length ? <div className="grid gap-4 lg:grid-cols-2">
            {filteredArticles.map((article) => <Panel key={article.id} className="space-y-3">
              <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><span className="feature-link text-[10px] font-bold uppercase tracking-wider">{article.category}</span><h3 className="mt-1 text-lg font-semibold text-slate-900">{article.title}</h3></div>
                <button type="button" onClick={() => beginArticleEdit(article)} className="feature-link text-xs font-medium">Editar</button>
                <button type="button" disabled={busy} onClick={() => void removeArticle(article)} className="text-xs font-medium text-rose-600">Eliminar</button>
              </div>
              <pre className="feature-muted max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6">{article.content}</pre>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {article.tags.map((tag) => <span key={tag} className="feature-tag rounded-full px-2 py-1 text-[10px] font-medium">{tag}</span>)}
                <span className="feature-muted ml-auto text-[10px]">{article.authorName ?? "Miembro"} · {new Date(article.updatedAt).toLocaleDateString("es-MX")}</span>
              </div>
            </Panel>)}
          </div> : <Panel><p className="feature-muted py-5 text-center text-sm">{articleSearch ? "No hay artículos que coincidan con la búsqueda." : "Aún no hay artículos. Crea la primera guía del equipo."}</p></Panel>}
        </>
      )}

      {!loading && workspaceId && view === "people" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {people.map((person) => {
            const expanded = expandedPeople.has(person.id);
            const assignedTasks = person.tasks;
            return <Panel key={person.id} className="overflow-hidden p-0">
              <button type="button" aria-expanded={expanded} onClick={() => setExpandedPeople((current) => {
                const next = new Set(current);
                if (next.has(person.id)) next.delete(person.id); else next.add(person.id);
                return next;
              })} className="flex w-full items-start gap-3 p-5 text-left">
                <PersonAvatar person={person} large />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{person.name ?? person.email ?? "Miembro"}</span>
                  <span className="feature-muted mt-0.5 block truncate text-xs">{person.jobTitle ?? person.department ?? person.role}</span>
                  {person.department && person.jobTitle && <span className="feature-muted mt-0.5 block truncate text-[11px]">{person.department}</span>}
                  <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${person.outOfOffice ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{person.outOfOffice ? "Fuera de la oficina" : "Disponible"}</span>
                </span>
                <span className="feature-muted text-xs">{assignedTasks.length} tareas {expanded ? "−" : "+"}</span>
              </button>
              {expanded && <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                {person.about && <p className="feature-muted mb-3 text-xs leading-5">{person.about}</p>}
                {assignedTasks.length ? <ul className="space-y-2">
                  {assignedTasks.map((task) => <li key={task.id} className="flex items-start gap-2 text-xs">
                    <span className={`mt-1 size-2 shrink-0 rounded-full ${task.priority === "high" ? "bg-rose-500" : task.priority === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <span className="min-w-0 flex-1 text-slate-700">{task.title}<span className="feature-muted block">{columns.find((column) => column.id === task.columnId)?.name ?? "Sin columna"}{task.dueDate ? ` · Vence ${task.dueDate}` : ""}</span></span>
                    <span className="feature-muted">{priorityNames[task.priority]}</span>
                  </li>)}
                </ul> : <p className="feature-muted text-xs">No tiene tareas pendientes asignadas en este espacio.</p>}
              </div>}
            </Panel>;
          })}
          {!people.length && <Panel className="md:col-span-2 xl:col-span-3"><p className="feature-muted py-5 text-center text-sm">No hay perfiles de equipo disponibles.</p></Panel>}
        </div>
      )}
    </section>
  );
}

function agentNamesForKey(key: AgentKey) {
  return key === "auto_assign" ? "Asignador Automático" : key === "task_summary" ? "Resumidor de Tareas" : "Detector de Fechas Límite";
}

function PersonAvatar({ person, large = false }: { person: Person; large?: boolean }) {
  const size = large ? 48 : 32;
  if (person.image) {
    return <Image src={person.image} alt="" width={size} height={size} unoptimized className={`shrink-0 rounded-full object-cover ${large ? "size-12" : "size-8"}`} />;
  }
  const initials = (person.name ?? person.email ?? "U").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 ${large ? "size-12 text-sm" : "size-8 text-[10px]"}`}>{initials}</span>;
}
