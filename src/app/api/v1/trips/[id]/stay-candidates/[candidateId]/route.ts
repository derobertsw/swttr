import { handleCandidate } from "@/lib/trip-stay-candidates";

type Context = { params: Promise<{ id: string; candidateId: string }> };

/** Changes an option: `{candidate, expected_revision}`. Organizer only. */
export async function PATCH(request: Request, context: Context) {
  const { id, candidateId } = await context.params;
  return handleCandidate(request, id, { action: "save", candidateId });
}

/** Removes an option: `{expected_revision}`. Organizer only; stays and nights don't change. */
export async function DELETE(request: Request, context: Context) {
  const { id, candidateId } = await context.params;
  return handleCandidate(request, id, { action: "remove", candidateId });
}
