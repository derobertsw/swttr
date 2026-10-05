import { handleLodging } from "@/lib/trip-lodging-api";
type Context = { params: Promise<{ id: string; stayId: string }> };
export async function PATCH(request: Request, context: Context) {
  const { id, stayId } = await context.params;
  return handleLodging(request, id, { action: "save", stayId });
}
export async function DELETE(request: Request, context: Context) {
  const { id, stayId } = await context.params;
  return handleLodging(request, id, { action: "remove", stayId });
}
