import { handleLodging } from "@/lib/trip-lodging-api";
type Context = { params: Promise<{ id: string; date: string }> };
export async function PUT(request: Request, context: Context) {
  const { id, date } = await context.params;
  return handleLodging(request, id, { action: "night", date });
}
