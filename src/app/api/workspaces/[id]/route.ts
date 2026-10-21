import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../../_utils";
import { publishWorkspaceEvent } from "../../_pusher";
import { getDb } from "@/app/db";
import { columns, taskAssignees, tasks, users, workspaceInvitations, workspaceMembers, workspaces } from "@/app/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

function parseWorkspaceInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) return null;
  const description = input.description === undefined ? "" : input.description;
  const icon = input.icon === undefined ? "briefcase" : input.icon;
  const color = input.color === undefined ? "#4f46e5" : input.color;
  const isPrivate = input.isPrivate;
  const memberIds = input.memberIds === undefined ? [] : input.memberIds;
  const memberEmails = input.memberEmails === undefined ? [] : input.memberEmails;
  if (typeof description !== "string" || description.length > 500) return null;
  if (typeof icon !== "string" || !icon.trim() || icon.length > 8) return null;
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  if (isPrivate !== undefined && typeof isPrivate !== "boolean") return null;
  if (!Array.isArray(memberIds) || memberIds.length > 50 || memberIds.some((memberId) => typeof memberId !== "string" || !memberId.trim())) return null;
  if (!Array.isArray(memberEmails) || memberEmails.length > 50 || memberEmails.some((email) => typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254)) return null;
  return {
    name: input.name.trim(),
    description: description.trim(),
    icon: icon.trim(),
    color,
    isPrivate,
    memberIds: memberIds as string[],
    memberEmails: [...new Set((memberEmails as string[]).map((email) => email.trim().toLocaleLowerCase()))],
  };
}

async function publishWorkspaceListUpdate(additionalChannelId?: number) {
  const remaining = await getDb().select({ id: workspaces.id }).from(workspaces);
  const channelIds = new Set(remaining.map(({ id }) => id));
  if (additionalChannelId) channelIds.add(additionalChannelId);
  await Promise.all([...channelIds].map((id) => publishWorkspaceEvent(id, "workspace:updated", {})));
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return Response.json({ error: "A valid workspace id is required." }, { status: 400 });
    if (!(await canAccessWorkspace(id, user.id))) return Response.json({ error: "Workspace not found." }, { status: 404 });
    const body: unknown = await request.json();
    const membershipIncluded = Boolean(body && typeof body === "object" && ("memberIds" in body || "memberEmails" in body));
    const parsed = parseWorkspaceInput(body);
    if (!parsed) return Response.json({ error: "Provide valid project details, members, and visibility." }, { status: 400 });
    const { memberIds, memberEmails, ...workspace } = parsed;
    const db = getDb();
    const [current] = await db.select({ createdBy: workspaces.createdBy, isPrivate: workspaces.isPrivate })
      .from(workspaces).where(eq(workspaces.id, id)).limit(1);
    if (!current) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if ((membershipIncluded || workspace.isPrivate !== undefined && workspace.isPrivate !== current.isPrivate) &&
      current.createdBy !== user.id && user.role !== "ADMIN") {
      return Response.json({ error: "Only the project creator can change visibility or membership." }, { status: 403 });
    }
    const emailUsers = memberEmails.length
      ? await db.select({ id: users.id, email: users.email }).from(users)
      : [];
    const emailsByAddress = new Map(emailUsers
      .filter((member): member is { id: string; email: string } => Boolean(member.email))
      .map((member) => [member.email.toLocaleLowerCase(), member.id]));
    const nextMemberIds = [...new Set([user.id, current.createdBy, ...memberIds, ...memberEmails.flatMap((email) => {
      const memberId = emailsByAddress.get(email);
      return memberId ? [memberId] : [];
    })].filter((memberId): memberId is string => Boolean(memberId)))];
    const pendingEmails = memberEmails.filter((email) => !emailsByAddress.has(email));
    if (membershipIncluded) {
      if (workspace.isPrivate) {
        const assignedMembers = await db.select({ userId: taskAssignees.userId })
          .from(taskAssignees)
          .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
          .innerJoin(columns, eq(tasks.columnId, columns.id))
          .where(eq(columns.workspaceId, id));
        for (const { userId } of assignedMembers) {
          if (!nextMemberIds.includes(userId)) nextMemberIds.push(userId);
        }
      }
      const knownMembers = await db.select({ id: users.id }).from(users).where(inArray(users.id, nextMemberIds));
      if (knownMembers.length !== nextMemberIds.length) return Response.json({ error: "Every project member must be an existing user." }, { status: 400 });
    }
    const [duplicate] = await getDb().select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.name, workspace.name), ne(workspaces.id, id)))
      .limit(1);
    if (duplicate) return Response.json({ error: "A workspace with that name already exists." }, { status: 409 });

    const [updated] = await db.update(workspaces)
      .set(workspace)
      .where(eq(workspaces.id, id))
      .returning();
    if (!updated) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if (membershipIncluded) {
      await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, id));
      await db.insert(workspaceMembers).values(nextMemberIds.map((userId) => ({ workspaceId: id, userId })));
      await db.delete(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, id));
      if (pendingEmails.length) {
        await db.insert(workspaceInvitations).values(pendingEmails.map((email) => ({
          workspaceId: id,
          email,
          invitedBy: user.id,
        }))).onConflictDoNothing();
      }
    }
    await publishWorkspaceListUpdate(id);
    revalidatePath("/");
    return Response.json({ workspace: { ...updated, memberIds: nextMemberIds, memberEmails: pendingEmails } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const id = parseId((await params).id);
    if (!id) return Response.json({ error: "A valid workspace id is required." }, { status: 400 });
    if (!(await canAccessWorkspace(id, user.id))) return Response.json({ error: "Workspace not found." }, { status: 404 });
    const db = getDb();
    const [workspace] = await db.select({ id: workspaces.id, createdBy: workspaces.createdBy })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if (workspace.createdBy !== user.id && user.role !== "ADMIN") {
      return Response.json({ error: "Only the project creator can delete it." }, { status: 403 });
    }

    const [workspaceTask] = await db.select({ id: tasks.id })
      .from(tasks)
      .innerJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(columns.workspaceId, id))
      .limit(1);
    if (workspaceTask) {
      return Response.json(
        { error: "Move or delete all tasks in this workspace before deleting it. This protects existing task and comment history." },
        { status: 409 },
      );
    }

    const [deleted] = await db.delete(workspaces).where(and(eq(workspaces.id, id), sql`not exists (
      select 1 from ${columns}
      inner join ${tasks} on ${tasks.columnId} = ${columns.id}
      where ${columns.workspaceId} = ${workspaces.id}
    )`)).returning({ id: workspaces.id });
    if (!deleted) {
      return Response.json({ error: "Workspace is no longer empty and cannot be deleted." }, { status: 409 });
    }
    await publishWorkspaceListUpdate(id);
    revalidatePath("/");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
