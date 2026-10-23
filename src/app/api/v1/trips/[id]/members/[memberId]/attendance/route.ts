import { handleLodging } from "@/lib/trip-lodging-api";
type Context = { params: Promise<{ id: string; memberId: string }> };
/** Sets one person's dates (#331): `{attendance, expected_revision, mutation_id, replace_nights?, expected_people_key?}`. */
export async function PUT(request: Request, context: Context) {
  const { id, memberId } = await context.params;
  return handleLodging(request, id, { action: "attendance", memberId });
}
