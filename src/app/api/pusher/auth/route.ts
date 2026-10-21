import { eq } from "drizzle-orm";
import { authorizeWorkspaceChannel } from "../../_pusher";
import { apiError, canAccessWorkspace, requireUser } from "../../_utils";
import { getDb } from "@/app/db";
import { workspaces } from "@/app/db/schema";

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;

    const formData = new URLSearchParams(await request.text());
    const socketId = formData.get("socket_id");
    const channelName = formData.get("channel_name");
    const match = typeof channelName === "string" && /^private-workspace-(\d+)$/.exec(channelName);
    if (
      typeof socketId !== "string" ||
      !/^\d+\.\d+$/.test(socketId) ||
      !match
    ) {
      return Response.json({ error: "Invalid Pusher channel authorization request." }, { status: 400 });
    }

    const workspaceId = Number(match[1]);
    if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) {
      return Response.json({ error: "Invalid workspace." }, { status: 400 });
    }
    const [workspace] = await getDb()
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if (!(await canAccessWorkspace(workspaceId, user.id))) return Response.json({ error: "Workspace not found." }, { status: 404 });

    const authorization = authorizeWorkspaceChannel(socketId, channelName);
    if (!authorization) {
      return Response.json({ error: "Real-time updates are not configured." }, { status: 503 });
    }
    return Response.json(authorization);
  } catch (error) {
    return apiError(error);
  }
}
