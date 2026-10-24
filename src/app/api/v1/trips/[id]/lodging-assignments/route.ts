import { handleLodging } from "@/lib/trip-lodging-api";
type Context = { params: Promise<{ id: string }> };
/** Sets the listed people's nights only (#331): `{assignments, expected_revision, mutation_id, replace_nights?, expected_people_key?}`. */
export async function PUT(request: Request, context: Context) {
  return handleLodging(request, (await context.params).id, { action: "assign" });
}
