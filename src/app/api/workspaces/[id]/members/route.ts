import { and, eq, ne, sql } from "drizzle-orm";
import { publishWorkspaceEvent } from "../../../_pusher";
import { apiError, canAccessWorkspace, parseId, requireUser } from "../../../_utils";
import { getDb } from "@/app/db";
import { users, workspaceInvitations, workspaceMembers, workspaces } from "@/app/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const workspaceId = parseId((await params).id);
    if (!workspaceId) return Response.json({ error: "A valid project id is required." }, { status: 400 });
    if (!(await canAccessWorkspace(workspaceId, user.id))) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const [workspace] = await getDb().select({ createdBy: workspaces.createdBy })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const members = await getDb()
      .select({ id: users.id, name: users.name, email: users.email, image: users.image })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const invitations = workspace?.createdBy === user.id || user.role === "ADMIN"
      ? await getDb().select({ email: workspaceInvitations.email, createdAt: workspaceInvitations.createdAt })
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.workspaceId, workspaceId))
      : [];
    return Response.json({ members, invitations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const workspaceId = parseId((await params).id);
    if (!workspaceId) return Response.json({ error: "A valid project id is required." }, { status: 400 });
    if (!(await canAccessWorkspace(workspaceId, user.id))) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || typeof (body as { email?: unknown }).email !== "string") {
      return Response.json({ error: "Provide a valid member email." }, { status: 400 });
    }
    const email = (body as { email: string }).email.trim().toLocaleLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return Response.json({ error: "Provide a valid member email." }, { status: 400 });
    }

    const db = getDb();
    const [member] = await db.select({ id: users.id }).from(users)
      .where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (member) {
      await db.insert(workspaceMembers)
        .values({ workspaceId, userId: member.id })
        .onConflictDoNothing();
      await db.delete(workspaceInvitations).where(and(
        eq(workspaceInvitations.workspaceId, workspaceId),
        eq(workspaceInvitations.email, email),
      ));
    } else {
      await db.insert(workspaceInvitations)
        .values({ workspaceId, email, invitedBy: user.id })
        .onConflictDoUpdate({
          target: [workspaceInvitations.workspaceId, workspaceInvitations.email],
          set: { invitedBy: user.id, createdAt: new Date() },
        });
    }
    await publishWorkspaceEvent(workspaceId, "workspace:updated", {});
    const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    return Response.json({ member: member ? { id: member.id, email } : null, invitation: member ? null : { email }, workspaceId: workspace?.id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const workspaceId = parseId((await params).id);
    if (!workspaceId) return Response.json({ error: "A valid project id is required." }, { status: 400 });
    const [workspace] = await getDb()
      .select({ createdBy: workspaces.createdBy })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) return Response.json({ error: "Project not found." }, { status: 404 });
    if (workspace.createdBy !== user.id) {
      return Response.json({ error: "Only the project creator can remove members." }, { status: 403 });
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Provide a valid member id or invitation email." }, { status: 400 });
    }
    const { userId, email } = body as { userId?: unknown; email?: unknown };
    if (typeof email === "string") {
      await getDb().delete(workspaceInvitations).where(and(
        eq(workspaceInvitations.workspaceId, workspaceId),
        eq(workspaceInvitations.email, email.trim().toLocaleLowerCase()),
      ));
      await publishWorkspaceEvent(workspaceId, "workspace:updated", {});
      return Response.json({ success: true });
    }
    if (typeof userId !== "string" || !userId.trim()) {
      return Response.json({ error: "Provide a valid member id or invitation email." }, { status: 400 });
    }
    const memberId = userId;
    if (memberId === workspace.createdBy) {
      return Response.json({ error: "The project creator cannot be removed." }, { status: 400 });
    }
    await getDb().delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId), ne(workspaceMembers.userId, user.id)));
    await publishWorkspaceEvent(workspaceId, "workspace:updated", {});
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
