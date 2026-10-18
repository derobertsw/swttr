import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { changeSharedGear } from "@/lib/trip-shared-gear";

type RouteContext = { params: Promise<{ id: string; gearId: string }> };
async function mutate(request: NextRequest, ctx: RouteContext, deleting = false) {
  const { id, gearId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(request);
  const action = deleting ? "delete" : body?.action;
  if (!deleting && !["assign", "accept", "decline", "pack", "unpack"].includes(action as string)) {
    return NextResponse.json({ error: "Choose a shared gear action." }, { status: 400 });
  }
  return changeSharedGear(auth.supabase, id, auth.userId, gearId, { ...body, action });
}
export async function PATCH(request: NextRequest, ctx: RouteContext) { return mutate(request, ctx); }
export async function DELETE(request: NextRequest, ctx: RouteContext) { return mutate(request, ctx, true); }
