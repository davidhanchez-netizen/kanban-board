import { asc, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import { users, workspaceInvitations, workspaceMembers, workspaces } from "@/app/db/schema";

async function publishWorkspaceListUpdate() {
  const remaining = await getDb().select({ id: workspaces.id }).from(workspaces);
  await Promise.all(remaining.map(({ id }) =>
    publishWorkspaceEvent(id, "workspace:updated", {}),
  ));
}

export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const db = getDb();
    const memberships = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id));
    const visible = [eq(workspaces.isPrivate, false), eq(workspaces.createdBy, user.id)];
    if (memberships.length) visible.push(inArray(workspaces.id, memberships.map(({ workspaceId }) => workspaceId)));
    const result = await db.select().from(workspaces).where(or(...visible)).orderBy(asc(workspaces.name));
    const memberRows = result.length
      ? await db.select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(inArray(workspaceMembers.workspaceId, result.map(({ id }) => id)))
      : [];
    const invitationRows = result.length
      ? await db.select({ workspaceId: workspaceInvitations.workspaceId, email: workspaceInvitations.email })
        .from(workspaceInvitations)
        .where(inArray(workspaceInvitations.workspaceId, result.map(({ id }) => id)))
      : [];
    const membersByWorkspace = new Map<number, string[]>();
    for (const member of memberRows) {
      const members = membersByWorkspace.get(member.workspaceId) ?? [];
      members.push(member.userId);
      membersByWorkspace.set(member.workspaceId, members);
    }
    const invitationsByWorkspace = new Map<number, string[]>();
    for (const invitation of invitationRows) {
      const emails = invitationsByWorkspace.get(invitation.workspaceId) ?? [];
      emails.push(invitation.email);
      invitationsByWorkspace.set(invitation.workspaceId, emails);
    }
    return Response.json({
      workspaces: result.map((workspace) => ({
        ...workspace,
        memberIds: [...new Set([workspace.createdBy, ...(membersByWorkspace.get(workspace.id) ?? [])].filter((id): id is string => Boolean(id)))],
        memberEmails: workspace.createdBy === user.id || user.role === "ADMIN"
          ? invitationsByWorkspace.get(workspace.id) ?? []
          : [],
      })),
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
    const parsed = parseWorkspaceInput(body);
    if (!parsed) return Response.json({ error: "Provide a valid workspace name, description, icon, color, and visibility." }, { status: 400 });
    const { memberIds, memberEmails, ...workspace } = parsed;
    const db = getDb();
    const emailUsers = memberEmails.length
      ? await db.select({ id: users.id, email: users.email }).from(users)
      : [];
    const emailMatches = new Map(emailUsers
      .filter((member): member is { id: string; email: string } => Boolean(member.email))
      .map((member) => [member.email.toLocaleLowerCase(), member.id]));
    const uniqueMemberIds = [...new Set([user.id, ...memberIds, ...memberEmails.flatMap((email) => {
      const memberId = emailMatches.get(email);
      return memberId ? [memberId] : [];
    })])];
    const validMembers = await db.select({ id: users.id }).from(users).where(inArray(users.id, uniqueMemberIds));
    if (validMembers.length !== uniqueMemberIds.length) {
      return Response.json({ error: "Every project member must be an existing user." }, { status: 400 });
    }

    const [created] = await db
      .insert(workspaces)
      .values({ ...workspace, createdBy: user.id })
      .onConflictDoNothing({ target: workspaces.name })
      .returning();
    if (!created) return Response.json({ error: "A workspace with that name already exists." }, { status: 409 });
    await db.insert(workspaceMembers).values(uniqueMemberIds.map((userId) => ({ workspaceId: created.id, userId })));
    const pendingEmails = memberEmails.filter((email) => !emailMatches.has(email));
    if (pendingEmails.length) {
      await db.insert(workspaceInvitations).values(pendingEmails.map((email) => ({
        workspaceId: created.id,
        email,
        invitedBy: user.id,
      }))).onConflictDoNothing();
    }

    await publishWorkspaceListUpdate();
    revalidatePath("/");
    return Response.json({ workspace: { ...created, memberIds: uniqueMemberIds, memberEmails: pendingEmails } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

function parseWorkspaceInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) return null;
  const description = input.description === undefined ? "" : input.description;
  const icon = input.icon === undefined ? "briefcase" : input.icon;
  const color = input.color === undefined ? "#4f46e5" : input.color;
  const isPrivate = input.isPrivate === undefined ? false : input.isPrivate;
  const memberIds = input.memberIds === undefined ? [] : input.memberIds;
  const memberEmails = input.memberEmails === undefined ? [] : input.memberEmails;
  if (typeof description !== "string" || description.length > 500) return null;
  if (typeof icon !== "string" || !icon.trim() || icon.length > 8) return null;
  if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  if (typeof isPrivate !== "boolean") return null;
  if (!Array.isArray(memberIds) || memberIds.length > 50 || memberIds.some((id) => typeof id !== "string" || !id.trim())) return null;
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
