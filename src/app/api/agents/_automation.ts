import { and, asc, eq, isNull, or } from "drizzle-orm";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import {
  agentActivity,
  columns,
  tasks,
  userPreferences,
  users,
  workspaceAgents,
  type Task,
} from "@/app/db/schema";

type Trigger = "created" | "updated";

async function writeTaskSummary(workspaceId: number, action: string) {
  const db = getDb();
  const rows = await db.select({ completed: tasks.completed, priority: tasks.priority })
    .from(tasks)
    .innerJoin(columns, eq(tasks.columnId, columns.id))
    .where(eq(columns.workspaceId, workspaceId));
  const completed = rows.filter((row) => row.completed).length;
  const high = rows.filter((row) => !row.completed && row.priority === "high").length;
  await db.insert(agentActivity).values({
    workspaceId,
    agentKey: "task_summary",
    action,
    details: `El espacio tiene ${completed} de ${rows.length} tareas completadas y ${high} tareas abiertas de prioridad alta.`,
  });
}

export async function runTaskAutomations(
  workspaceId: number,
  task: Task,
  trigger: Trigger,
  previousDueDate?: string | null,
) {
  const db = getDb();
  const enabledAgents = await db.select({ agentKey: workspaceAgents.agentKey })
    .from(workspaceAgents)
    .where(and(eq(workspaceAgents.workspaceId, workspaceId), eq(workspaceAgents.enabled, true)));
  const enabled = new Set(enabledAgents.map(({ agentKey }) => agentKey));
  let currentTask = task;
  let addedActivity = false;

  if (enabled.has("auto_assign") && !currentTask.assigneeId && !currentTask.completed) {
    const candidates = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(or(isNull(userPreferences.userId), eq(userPreferences.outOfOffice, false)))
      .orderBy(asc(users.name), asc(users.email));
    const assignedCounts = await db.select({ assigneeId: tasks.assigneeId })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(and(eq(columns.workspaceId, workspaceId), eq(tasks.completed, false)));
    const counts = new Map<string, number>();
    for (const row of assignedCounts) {
      if (row.assigneeId) counts.set(row.assigneeId, (counts.get(row.assigneeId) ?? 0) + 1);
    }
    for (const candidate of candidates.sort((left, right) =>
      (counts.get(left.id) ?? 0) - (counts.get(right.id) ?? 0) ||
      (left.name ?? left.email ?? "").localeCompare(right.name ?? right.email ?? ""),
    )) {
      const [assigned] = await db.update(tasks)
        .set({ assigneeId: candidate.id, assignee: candidate.name ?? candidate.email ?? "Miembro" })
        .where(and(eq(tasks.id, currentTask.id), isNull(tasks.assigneeId)))
        .returning();
      if (!assigned) break;
      currentTask = assigned;
      await db.insert(agentActivity).values({
        workspaceId,
        agentKey: "auto_assign",
        action: "Asignación automática",
        details: `Asignó “${assigned.title}” a ${candidate.name ?? candidate.email ?? "un miembro"} por tener la menor carga activa.`,
      });
      addedActivity = true;
      break;
    }
  }

  if (enabled.has("task_summary")) {
    await writeTaskSummary(
      workspaceId,
      trigger === "created" ? "Resumen actualizado al crear una tarea" : "Resumen actualizado al cambiar una tarea",
    );
    addedActivity = true;
  }

  const dueDateChanged = trigger === "created" || currentTask.dueDate !== previousDueDate;
  if (enabled.has("due_date_watch") && dueDateChanged && currentTask.dueDate && !currentTask.completed) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setUTCDate(limit.getUTCDate() + 7);
    const dueDate = currentTask.dueDate;
    const dueSoon = dueDate >= today.toISOString().slice(0, 10) &&
      dueDate <= limit.toISOString().slice(0, 10);
    if (dueSoon) {
      await db.insert(agentActivity).values({
        workspaceId,
        agentKey: "due_date_watch",
        action: "Vencimiento próximo detectado",
        details: `La tarea “${currentTask.title}” vence el ${dueDate}.`,
      });
      addedActivity = true;
    }
  }

  if (addedActivity) await publishWorkspaceEvent(workspaceId, "agent:updated", { taskId: currentTask.id });
  return currentTask;
}

export async function runTaskDeletionAutomation(workspaceId: number) {
  const db = getDb();
  const [summaryAgent] = await db.select({ enabled: workspaceAgents.enabled })
    .from(workspaceAgents)
    .where(and(
      eq(workspaceAgents.workspaceId, workspaceId),
      eq(workspaceAgents.agentKey, "task_summary"),
      eq(workspaceAgents.enabled, true),
    ))
    .limit(1);
  if (!summaryAgent) return;
  await writeTaskSummary(workspaceId, "Resumen actualizado al eliminar una tarea");
  await publishWorkspaceEvent(workspaceId, "agent:updated", { action: "task:deleted" });
}
