import Pusher from "pusher";

let pusher: Pusher | null = null;
let missingConfigurationReported = false;

function getPusher() {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    if (!missingConfigurationReported) {
      console.error("Pusher is not configured. Set PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, and PUSHER_CLUSTER.");
      missingConfigurationReported = true;
    }
    return null;
  }

  pusher ??= new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
  return pusher;
}

export function getPusherClientConfig() {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;
  return { key: PUSHER_KEY, cluster: PUSHER_CLUSTER };
}

export async function publishWorkspaceEvent(
  workspaceId: number,
  eventName: string,
  data: Record<string, unknown>,
) {
  try {
    const client = getPusher();
    if (!client) return;
    await client.trigger(`private-workspace-${workspaceId}`, eventName, data);
  } catch (error) {
    console.error(`Pusher failed to publish ${eventName} for workspace ${workspaceId}:`, error);
  }
}

export async function publishUserEvent(
  userId: string,
  eventName: string,
  data: Record<string, unknown>,
) {
  try {
    const client = getPusher();
    if (!client) return;
    await client.trigger(`private-user-${userId}`, eventName, data);
  } catch (error) {
    console.error(`Pusher failed to publish ${eventName} for user ${userId}:`, error);
  }
}

export function authorizeWorkspaceChannel(socketId: string, channelName: string) {
  const client = getPusher();
  if (!client) return null;
  return client.authorizeChannel(socketId, channelName);
}
