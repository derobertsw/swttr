import { handleCandidate, listCandidates } from "@/lib/trip-stay-candidates";

type Context = { params: Promise<{ id: string }> };

/** The trip's stay options (#213) and the nights a comparison can cover. Anyone on the trip. */
export async function GET(_request: Request, context: Context) {
  return listCandidates((await context.params).id);
}

/** Adds an option: `{candidate, expected_revision: null}`. Organizer only; no night or booking changes. */
export async function POST(request: Request, context: Context) {
  return handleCandidate(request, (await context.params).id, { action: "save" });
}
