import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /api/wardrobe/available
 * Get all available calibrated items (garments, handwear, headwear)
 */
export async function GET() {
  const supabase = getSupabase();

  if (!supabase) {
    return NextResponse.json({ items: [] });
  }

  try {
    // Fetch all item types in parallel
    const [garmentsResult, handwearResult, headwearResult] = await Promise.all([
      supabase
        .from("garments")
        .select("id, brand, model_name, category, garment_type, garment_thermal_properties(rcl_whole_body)")
        .order("brand")
        .order("model_name"),
      supabase
        .from("handwear")
        .select("id, brand, model_name, handwear_type, rcl_clo, dexterity_score")
        .order("brand")
        .order("model_name"),
      supabase
        .from("headwear")
        .select("id, brand, model_name, headwear_type, rcl_clo, covers_ears, covers_neck, covers_face")
        .order("brand")
        .order("model_name"),
    ]);

    const items = [
      ...(garmentsResult.data || []).map((g) => ({
        id: g.id,
        type: "garment" as const,
        brand: g.brand,
        model_name: g.model_name,
        category: g.category,
        garment_type: g.garment_type,
        rcl_clo: g.garment_thermal_properties?.[0]?.rcl_whole_body,
      })),
      ...(handwearResult.data || []).map((h) => ({
        id: h.id,
        type: "handwear" as const,
        brand: h.brand,
        model_name: h.model_name,
        category: h.handwear_type,
        rcl_clo: h.rcl_clo,
        dexterity_score: h.dexterity_score,
      })),
      ...(headwearResult.data || []).map((h) => ({
        id: h.id,
        type: "headwear" as const,
        brand: h.brand,
        model_name: h.model_name,
        category: h.headwear_type,
        rcl_clo: h.rcl_clo,
        covers_ears: h.covers_ears,
        covers_neck: h.covers_neck,
        covers_face: h.covers_face,
      })),
    ];

    return NextResponse.json({ items });
  } catch (err) {
    console.error("Database error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
