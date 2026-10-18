import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { changeSharedGear } from "@/lib/trip-shared-gear";

type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(request);
  return changeSharedGear(auth.supabase, id, auth.userId, body?.id, { ...body, action: "create" });
}
