import { NextResponse } from "next/server";
import { itemThermalMetadata } from '@/lib/recommendations/item-thermal-metadata';
import { getSupabase } from "@/lib/supabase";

/**
 * GET /api/wardrobe/available
 * Get catalog items and their thermal/provenance data, including generic estimates.
 */
export async function GET() {
  const supabase = getSupabase();

  if (!supabase) {
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 503 });
  }

  try {
    // Fetch all item types in parallel
    const [garmentsResult, handwearResult, headwearResult] = await Promise.all([
      supabase
        .from("garments")
        .select("id, brand, model_name, brand_logo_url, item_image_url, category, covers_torso, covers_arms, covers_legs, garment_type, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities, garment_thermal_properties(*), garment_protection(*)")
        .order("brand")
        .order("model_name"),
      supabase
        .from("handwear")
        .select("id, brand, model_name, brand_logo_url, item_image_url, handwear_type, rcl_clo, dexterity_score")
        .order("brand")
        .order("model_name"),
      supabase
        .from("headwear")
        .select("id, brand, model_name, brand_logo_url, item_image_url, headwear_type, rcl_clo, covers_ears, covers_neck, covers_face")
        .order("brand")
        .order("model_name"),
    ]);

    // A failed query would otherwise look like an empty catalog.
    const queryError = garmentsResult.error || handwearResult.error || headwearResult.error;
    if (queryError) {
      console.error("Failed to load catalog:", queryError);
      return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
    }

    const items = [
      ...(garmentsResult.data || []).map((g) => ({
        id: g.id,
        type: "garment" as const,
        brand: g.brand,
        model_name: g.model_name,
        brand_logo_url: g.brand_logo_url,
        item_image_url: g.item_image_url,
        category: g.category,
        ...itemThermalMetadata('garment', g),
      })),
      ...(handwearResult.data || []).map((h) => ({
        id: h.id,
        type: "handwear" as const,
        brand: h.brand,
        model_name: h.model_name,
        brand_logo_url: h.brand_logo_url,
        item_image_url: h.item_image_url,
        category: h.handwear_type,
        ...itemThermalMetadata('handwear', h),
        dexterity_score: h.dexterity_score,
      })),
      ...(headwearResult.data || []).map((h) => ({
        id: h.id,
        type: "headwear" as const,
        brand: h.brand,
        model_name: h.model_name,
        brand_logo_url: h.brand_logo_url,
        item_image_url: h.item_image_url,
        category: h.headwear_type,
        ...itemThermalMetadata('headwear', h),
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
