import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson, requireUser } from "@/lib/api";
import { CATALOG_REPORT_PROBLEM_MESSAGES, parseCatalogReport } from "@/lib/catalog-reports";
import { logError } from "@/lib/logger";

/**
 * POST /api/wardrobe/reports
 * Report a problem with a catalog item (#277). Body: {item_type, item_id,
 * reasons, note?, product_url?}. A person has one open report per item:
 * reporting it again adds the new reasons to that report (200, outcome
 * "updated") instead of starting another (201, outcome "created").
 *
 * 400 invalid input, 401 signed out, 404 no such catalog item, 429 too many
 * new reports today, 503 before migration 20261124120000 is applied.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const parsed = parseCatalogReport(await readJson(request));
  if (!parsed.ok) {
    return NextResponse.json(
      { error: CATALOG_REPORT_PROBLEM_MESSAGES[parsed.problem], problem: parsed.problem },
      { status: 400 }
    );
  }
  const report = parsed.value;

  try {
    const { data, error } = await supabase.rpc("submit_catalog_item_report", {
      p_user_id: userId,
      p_item_type: report.item_type,
      p_item_id: report.item_id,
      p_reasons: report.reasons,
      p_note: report.note,
      p_product_url: report.product_url,
    });

    if (error) {
      switch (error.code) {
        case "P0002":
          return jsonError("This item isn't in the catalog anymore.", 404);
        case "54000":
          return jsonError("You've sent a lot of reports today. Try again tomorrow.", 429);
        case "22023":
        case "23514":
          return jsonError("This report isn't valid.", 400);
        case "PGRST202":
        case "42883":
          // Migration 20261124120000 isn't applied yet.
          logError("POST /api/wardrobe/reports - submit_catalog_item_report missing", error.code);
          return jsonError("Reporting isn't available yet.", 503);
        default:
          logError("POST /api/wardrobe/reports", error.code ?? error);
          return jsonError("Couldn't send the report.", 500);
      }
    }

    const result = data as { id: string; outcome: "created" | "updated"; reasons: string[] };
    return NextResponse.json({ report: result }, { status: result.outcome === "created" ? 201 : 200 });
  } catch (error) {
    logError("POST /api/wardrobe/reports", error);
    return jsonError("Couldn't send the report.", 500);
  }
}
