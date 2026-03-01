import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import type { GarmentCategory, GarmentType, HoodType } from '@/types/garments';

/**
 * GET /api/v1/garments
 * List all garments with optional filtering
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const brand = searchParams.get('brand');
  const includeDetails = searchParams.get('include') === 'all';

  let query = supabase.from('garments').select(`
    *,
    garment_thermal_properties (*),
    garment_activity_ratings (*)
    ${includeDetails ? ', garment_protection (*), garment_ventilation (*)' : ''}
  `);

  if (category) {
    query = query.eq('category', category);
  }
  if (brand) {
    query = query.ilike('brand', `%${brand}%`);
  }

  const { data, error } = await query.order('brand').order('model_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ garments: data });
}

/**
 * POST /api/v1/garments
 * Create a new garment
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  const body = await request.json();

  // Validate required fields
  const required = ['brand', 'model_name', 'category', 'garment_type'];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400 }
      );
    }
  }

  // Infer arm coverage from garment type if not explicitly provided
  const armCoveringTypes: GarmentType[] = ['top_long_sleeve', 'jacket', 'one_piece'];
  const coversArms = body.covers_arms ?? armCoveringTypes.includes(body.garment_type);

  // Validate arm clo consistency: arm-covering garments must have rcl_arms
  if (coversArms && body.thermal_properties) {
    const armClo = body.thermal_properties.rcl_arms;
    const torsoClo = body.thermal_properties.rcl_torso;
    if ((armClo === undefined || armClo === null || armClo === 0) && torsoClo > 0) {
      return NextResponse.json(
        { error: 'Arm-covering garments (long sleeve, jacket, one piece) must have rcl_arms > 0 when rcl_torso > 0' },
        { status: 400 }
      );
    }
  }

  // Insert garment
  const garmentData: {
    brand: string;
    model_name: string;
    category: GarmentCategory;
    garment_type: GarmentType;
    year_released?: number;
    msrp_usd?: number;
    covers_torso?: boolean;
    covers_arms?: boolean;
    covers_legs?: boolean;
    covers_head?: boolean;
    hood_type?: HoodType;
    weight_grams?: number;
    packed_volume_liters?: number;
  } = {
    brand: body.brand,
    model_name: body.model_name,
    category: body.category,
    garment_type: body.garment_type,
    year_released: body.year_released,
    msrp_usd: body.msrp_usd,
    covers_torso: body.covers_torso ?? false,
    covers_arms: coversArms,
    covers_legs: body.covers_legs ?? false,
    covers_head: body.covers_head ?? false,
    hood_type: body.hood_type ?? 'none',
    weight_grams: body.weight_grams,
    packed_volume_liters: body.packed_volume_liters,
  };

  const { data: garment, error: garmentError } = await supabase
    .from('garments')
    .insert(garmentData)
    .select()
    .single();

  if (garmentError) {
    return NextResponse.json({ error: garmentError.message }, { status: 500 });
  }

  // Insert thermal properties if provided
  if (body.thermal_properties) {
    const { error: thermalError } = await supabase
      .from('garment_thermal_properties')
      .insert({
        garment_id: garment.id,
        ...body.thermal_properties,
      });

    if (thermalError) {
      console.error('Failed to insert thermal properties:', thermalError);
    }
  }

  // Insert activity ratings if provided
  if (body.activity_ratings) {
    const { error: ratingsError } = await supabase
      .from('garment_activity_ratings')
      .insert({
        garment_id: garment.id,
        ...body.activity_ratings,
      });

    if (ratingsError) {
      console.error('Failed to insert activity ratings:', ratingsError);
    }
  }

  // Fetch complete garment data
  const { data: completeGarment } = await supabase
    .from('garments')
    .select(`
      *,
      garment_thermal_properties (*),
      garment_activity_ratings (*)
    `)
    .eq('id', garment.id)
    .single();

  return NextResponse.json({ garment: completeGarment }, { status: 201 });
}
