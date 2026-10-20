import { getPusherClientConfig } from "../../_pusher";
import { apiError, requireUser } from "../../_utils";

export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const config = getPusherClientConfig();
    if (!config) {
      return Response.json({ error: "Real-time updates are not configured." }, { status: 503 });
    }
    return Response.json(config, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
