"use client";

import type { Project } from "@/types/projects";

type Task = {
  id: number;
  title: string;
  priority: "high" | "medium" | "low";
  completed: boolean;
  dueDate: string | null;
  columnId: number;
};

type Column = { id: number; name: string };

export function ProjectOverview({
  project,
  tasks,
  columns,
}: {
  project: Project;
  tasks: Task[];
  columns: Column[];
}) {
  const completed = tasks.filter((task) => task.completed).length;
  const overdue = tasks.filter((task) =>
    !task.completed && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10),
  ).length;
  const dueToday = tasks.filter((task) =>
    !task.completed && task.dueDate === new Date().toISOString().slice(0, 10),
  ).length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const priorityCounts = {
    high: tasks.filter((task) => task.priority === "high" && !task.completed).length,
    medium: tasks.filter((task) => task.priority === "medium" && !task.completed).length,
    low: tasks.filter((task) => task.priority === "low" && !task.completed).length,
  };

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: `${project.color}20` }}>
            {project.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{project.name}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {project.isPrivate ? "Privado" : "Público"}
              </span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
                {project.memberIds.length} {project.memberIds.length === 1 ? "colaborador" : "colaboradores"}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{project.description || "Este proyecto aún no tiene descripción."}</p>
          </div>
        </div>
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-xs">
            <span className="font-medium text-slate-600">Progreso del proyecto</span>
            <span className="font-semibold text-slate-800">{completed} de {tasks.length} tareas · {progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: project.color }} />
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Tareas abiertas", value: tasks.length - completed, color: "text-indigo-600" },
          { title: "Completadas", value: completed, color: "text-emerald-600" },
          { title: "Vencidas", value: overdue, color: "text-rose-600" },
          { title: "Vencen hoy", value: dueToday, color: "text-amber-600" },
        ].map((metric) => (
          <article key={metric.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{metric.title}</p>
            <p className={`mt-2 text-2xl font-bold ${metric.color}`}>{metric.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Trabajo por etapa</h3>
          <ul className="mt-4 space-y-3">
            {columns.map((column) => {
              const count = tasks.filter((task) => task.columnId === column.id && !task.completed).length;
              const maximum = Math.max(1, ...columns.map((item) => tasks.filter((task) => task.columnId === item.id && !task.completed).length));
              return (
                <li key={column.id}>
                  <div className="mb-1.5 flex justify-between text-xs text-slate-500"><span>{column.name}</span><span>{count}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${count / maximum * 100}%`, backgroundColor: project.color }} /></div>
                </li>
              );
            })}
            {!columns.length && <li className="text-xs text-slate-400">Aún no hay etapas en este proyecto.</li>}
          </ul>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">Prioridad pendiente</h3>
          <div className="mt-4 space-y-3">
            {[
              { label: "Alta", count: priorityCounts.high, color: "bg-rose-500" },
              { label: "Media", count: priorityCounts.medium, color: "bg-amber-400" },
              { label: "Baja", count: priorityCounts.low, color: "bg-sky-500" },
            ].map((priority) => (
              <div key={priority.label} className="flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-2"><i className={`size-2 rounded-full ${priority.color}`} />{priority.label}</span>
                <span className="font-semibold text-slate-800">{priority.count}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
