import { and, asc, desc, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, parseId, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import {
  agentActivity,
  columns,
  tasks,
  userPreferences,
  users,
  workspaceAgents,
  workspaces,
} from "@/app/db/schema";

const agentNames = {
  auto_assign: "Asignador Automático",
  task_summary: "Resumidor de Tareas",
  due_date_watch: "Detector de Fechas Límite",
} as const;

type AgentKey = keyof typeof agentNames;

function isAgentKey(value: unknown): value is AgentKey {
  return typeof value === "string" && value in agentNames;
}

async function ensureWorkspace(workspaceId: number) {
  const [workspace] = await getDb()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return workspace;
}

export async function GET(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const workspaceId = parseId(new URL(request.url).searchParams.get("workspaceId") ?? "");
    if (!workspaceId) return Response.json({ error: "Choose a valid workspace." }, { status: 400 });
    if (!(await ensureWorkspace(workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });

    const db = getDb();
    const [configuredAgents, logs] = await Promise.all([
      db.select().from(workspaceAgents).where(eq(workspaceAgents.workspaceId, workspaceId)),
      db.select().from(agentActivity).where(eq(agentActivity.workspaceId, workspaceId))
        .orderBy(desc(agentActivity.createdAt), desc(agentActivity.id)).limit(50),
    ]);
    const configured = new Map(configuredAgents.map((agent) => [agent.agentKey, agent.enabled]));
    return Response.json({
      agents: Object.entries(agentNames).map(([key, name]) => ({
        key,
        name,
        enabled: configured.get(key) ?? false,
      })),
      logs,
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
    if (!body || typeof body !== "object") return Response.json({ error: "Agent action is required." }, { status: 400 });
    const input = body as Record<string, unknown>;
    const workspaceId = parseId(String(input.workspaceId ?? ""));
    if (!workspaceId || !isAgentKey(input.agentKey)) {
      return Response.json({ error: "Choose a valid workspace and agent." }, { status: 400 });
    }
    if (!(await ensureWorkspace(workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });
    const db = getDb();

    if (input.action === "toggle") {
      if (typeof input.enabled !== "boolean") return Response.json({ error: "Enabled must be a boolean." }, { status: 400 });
      await db.insert(workspaceAgents)
        .values({ workspaceId, agentKey: input.agentKey, enabled: input.enabled, updatedBy: user.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [workspaceAgents.workspaceId, workspaceAgents.agentKey],
          set: { enabled: input.enabled, updatedBy: user.id, updatedAt: new Date() },
        });
      const [log] = await db.insert(agentActivity).values({
        workspaceId,
        agentKey: input.agentKey,
        action: input.enabled ? "Activado" : "Desactivado",
        details: `${agentNames[input.agentKey]} ${input.enabled ? "activado" : "desactivado"} por ${user.name ?? user.email ?? "un miembro"}.`,
      }).returning();
      await publishWorkspaceEvent(workspaceId, "agent:updated", { agentKey: input.agentKey });
      revalidatePath("/");
      return Response.json({ enabled: input.enabled, log });
    }

    if (input.action !== "run") return Response.json({ error: "Unsupported agent action." }, { status: 400 });

    let details: string;
    if (input.agentKey === "auto_assign") {
      const candidates = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
        .where(or(isNull(userPreferences.userId), eq(userPreferences.outOfOffice, false)))
        .orderBy(asc(users.name), asc(users.email));
      const available = candidates;
      const openTasks = await db.select({ id: tasks.id })
        .from(tasks)
        .innerJoin(columns, eq(tasks.columnId, columns.id))
        .where(and(eq(columns.workspaceId, workspaceId), eq(tasks.completed, false), isNull(tasks.assigneeId)))
        .orderBy(asc(tasks.createdAt));
      const assignedCounts = await db.select({ assigneeId: tasks.assigneeId })
        .from(tasks)
        .innerJoin(columns, eq(tasks.columnId, columns.id))
        .where(and(eq(columns.workspaceId, workspaceId), eq(tasks.completed, false)));
      const counts = new Map<string, number>();
      for (const task of assignedCounts) {
        if (task.assigneeId) counts.set(task.assigneeId, (counts.get(task.assigneeId) ?? 0) + 1);
      }
      let assigned = 0;
      const taskUpdates: Array<Promise<unknown>> = [];
      for (const task of openTasks) {
        const candidate = available
          .sort((left, right) =>
            (counts.get(left.id) ?? 0) - (counts.get(right.id) ?? 0) ||
            (left.name ?? left.email ?? "").localeCompare(right.name ?? right.email ?? ""),
          )[0];
        if (!candidate) break;
        const [updated] = await db.update(tasks)
          .set({ assigneeId: candidate.id, assignee: candidate.name ?? candidate.email ?? "Miembro" })
          .where(eq(tasks.id, task.id))
          .returning();
        if (updated) {
          assigned += 1;
          counts.set(candidate.id, (counts.get(candidate.id) ?? 0) + 1);
          taskUpdates.push(publishWorkspaceEvent(workspaceId, "task:updated", { task: updated }));
        }
      }
      await Promise.all(taskUpdates);
      details = assigned
        ? `Asignó ${assigned} tarea${assigned === 1 ? "" : "s"} sin responsable al equipo, equilibrando la carga activa.`
        : "No encontró tareas abiertas sin responsable ni miembros disponibles para asignar.";
    } else if (input.agentKey === "task_summary") {
      const rows = await db.select({ title: tasks.title, completed: tasks.completed, priority: tasks.priority })
        .from(tasks)
        .innerJoin(columns, eq(tasks.columnId, columns.id))
        .where(eq(columns.workspaceId, workspaceId));
      const complete = rows.filter((task) => task.completed).length;
      const priorities = {
        high: rows.filter((task) => task.priority === "high" && !task.completed).length,
        medium: rows.filter((task) => task.priority === "medium" && !task.completed).length,
        low: rows.filter((task) => task.priority === "low" && !task.completed).length,
      };
      const focus = rows.filter((task) => !task.completed).slice(0, 5).map((task) => task.title);
      details = `Resumen del espacio: ${complete}/${rows.length} tareas completadas; ${priorities.high} de prioridad alta, ${priorities.medium} media y ${priorities.low} baja pendientes.${focus.length ? ` Próximas tareas: ${focus.join("; ")}.` : ""}`;
    } else {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const limit = new Date(today);
      limit.setUTCDate(limit.getUTCDate() + 7);
      const dueSoon = await db.select({ title: tasks.title, dueDate: tasks.dueDate })
        .from(tasks)
        .innerJoin(columns, eq(tasks.columnId, columns.id))
        .where(and(
          eq(columns.workspaceId, workspaceId),
          eq(tasks.completed, false),
          isNotNull(tasks.dueDate),
          gte(tasks.dueDate, today.toISOString().slice(0, 10)),
          lte(tasks.dueDate, limit.toISOString().slice(0, 10)),
        ))
        .orderBy(asc(tasks.dueDate));
      details = dueSoon.length
        ? `Detectó ${dueSoon.length} tarea${dueSoon.length === 1 ? "" : "s"} pendiente${dueSoon.length === 1 ? "" : "s"} con vencimiento en los próximos 7 días: ${dueSoon.map((task) => `${task.title} (${task.dueDate})`).join("; ")}.`
        : "No hay tareas pendientes con vencimiento en los próximos 7 días.";
    }

    const [log] = await db.insert(agentActivity).values({
      workspaceId,
      agentKey: input.agentKey,
      action: "Ejecución manual",
      details,
    }).returning();
    await publishWorkspaceEvent(workspaceId, "agent:updated", { agentKey: input.agentKey });
    revalidatePath("/");
    return Response.json({ log });
  } catch (error) {
    return apiError(error);
  }
}
