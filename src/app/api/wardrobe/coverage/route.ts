import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { getWardrobeCoverage } from "@/lib/wardrobe-coverage/load";

/**
 * GET /api/wardrobe/coverage
 *
 * How much of a fixed scenario grid the signed-in user's wardrobe dresses
 * for, its gaps, and the items doing the most work (#93). See
 * src/lib/wardrobe-coverage/ for the grid and verdicts.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  try {
    const coverage = await getWardrobeCoverage(supabase, userId);
    return NextResponse.json(coverage, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("Failed to compute wardrobe coverage:", err);
    return jsonError("Failed to compute wardrobe coverage", 500);
  }
}
