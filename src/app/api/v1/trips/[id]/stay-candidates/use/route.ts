import { readJson } from "@/lib/api";
import { handleUseOption } from "@/lib/trip-stay-use";

type Context = { params: Promise<{ id: string }> };

/**
 * Use for these nights (#213): `{option, first_night, checkout, member_ids?, preview: true}`
 * previews the chosen people in a compared stay or option for those nights;
 * `preview: false` with the preview's revision, crew and a mutation identity saves it.
 * Organizer only. Bookings never change.
 */
export async function POST(request: Request, context: Context) {
  const body = await readJson(request.clone());
  return handleUseOption(request, (await context.params).id, { preview: !!body && typeof body === "object" && (body as { preview?: unknown }).preview === true });
}
