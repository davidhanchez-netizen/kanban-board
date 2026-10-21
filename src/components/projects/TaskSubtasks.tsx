"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Subtask } from "@/types/projects";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo guardar la subtarea.");
  return result;
}

export function TaskSubtasks({ taskId }: { taskId: number }) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const completed = subtasks.filter((subtask) => subtask.completed).length;
  const progress = subtasks.length ? Math.round(completed / subtasks.length * 100) : 0;

  useEffect(() => {
    let active = true;
    request<{ subtasks: Subtask[] }>(`/api/subtasks?taskId=${taskId}`, { cache: "no-store" })
      .then(({ subtasks: loaded }) => { if (active) setSubtasks(loaded); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las subtareas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId]);

  async function addSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setError("");
    const optimisticId = -Date.now();
    const optimistic: Subtask = {
      id: optimisticId,
      taskId,
      title: nextTitle,
      completed: false,
      position: subtasks.length,
      createdAt: new Date().toISOString(),
    };
    setSubtasks((current) => [...current, optimistic]);
    setTitle("");
    try {
      const { subtask } = await request<{ subtask: Subtask }>("/api/subtasks", {
        method: "POST",
        body: JSON.stringify({ taskId, title: nextTitle }),
      });
      setSubtasks((current) => current.map((item) => item.id === optimisticId ? subtask : item));
    } catch (cause) {
      setSubtasks((current) => current.filter((item) => item.id !== optimisticId));
      setTitle(nextTitle);
      setError(cause instanceof Error ? cause.message : "No se pudo crear la subtarea.");
    }
  }

  async function toggle(subtask: Subtask) {
    setError("");
    setSubtasks((current) => current.map((item) => item.id === subtask.id ? { ...item, completed: !item.completed } : item));
    try {
      const { subtask: updated } = await request<{ subtask: Subtask }>("/api/subtasks", {
        method: "PATCH",
        body: JSON.stringify({ id: subtask.id, completed: !subtask.completed }),
      });
      setSubtasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setSubtasks((current) => current.map((item) => item.id === subtask.id ? subtask : item));
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la subtarea.");
    }
  }

  async function remove(subtask: Subtask) {
    setError("");
    setSubtasks((current) => current.filter((item) => item.id !== subtask.id));
    try {
      await request<{ success: boolean }>(`/api/subtasks?id=${subtask.id}`, { method: "DELETE" });
    } catch (cause) {
      setSubtasks((current) => [...current, subtask].sort((left, right) => left.position - right.position));
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la subtarea.");
    }
  }

  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Subtareas</h3>
        <span className="text-[11px] text-slate-500">{subtasks.length ? `${completed}/${subtasks.length} · ${progress}%` : "Lista de verificación"}</span>
      </div>
      {subtasks.length > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div>}
      {loading ? <p className="mt-3 text-xs text-slate-400">Cargando subtareas...</p> : (
        <ul className="mt-2 space-y-1">
          {subtasks.map((subtask) => (
            <li key={subtask.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-slate-50">
              <input type="checkbox" checked={subtask.completed} onChange={() => void toggle(subtask)} aria-label={`Marcar ${subtask.title}`} className="size-4 accent-indigo-600" />
              <span className={`min-w-0 flex-1 text-sm ${subtask.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>{subtask.title}</span>
              <button type="button" aria-label={`Eliminar ${subtask.title}`} onClick={() => void remove(subtask)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">×</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addSubtask} className="mt-2 flex gap-2">
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Añadir una subtarea..." aria-label="Nombre de la subtarea" className="form-control min-w-0 flex-1 !py-2 text-xs" />
        <button type="submit" disabled={!title.trim()} className="button-secondary !px-3 !py-2 text-xs">Añadir</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
    </section>
  );
}
