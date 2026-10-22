import { handleLodging } from "@/lib/trip-lodging-api";
import { jsonError, readJson } from "@/lib/api";
import type { TripLodgingAction } from "@/types/trips";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  const body = await readJson(request.clone());
  if (!body || !["save", "remove", "night", "assign", "attendance"].includes(String(body.action))) return jsonError("Invalid preview action.", 400);
  return handleLodging(request, (await context.params).id, { action: body.action as TripLodgingAction, preview: true });
}
