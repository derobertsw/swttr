import { handleLodging } from "@/lib/trip-lodging-api";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return handleLodging(request, (await context.params).id, { action: "save" });
}
