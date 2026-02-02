import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/garments/[id]/thermal-properties
 * Get detailed biophysical properties for a garment
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  // Fetch garment with all related data
  const { data: garment, error } = await supabase
    .from('garments')
    .select(`
      *,
      garment_thermal_properties (*),
      garment_protection (*),
      garment_ventilation (*),
      garment_activity_ratings (*),
      garment_materials (*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Garment not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format response with biophysical analysis
  const thermalProps = garment.garment_thermal_properties;

  const response = {
    garment: {
      id: garment.id,
      brand: garment.brand,
      model_name: garment.model_name,
      category: garment.category,
      garment_type: garment.garment_type,
      weight_grams: garment.weight_grams,
    },
    thermal_properties: thermalProps ? {
      // Thermal resistance (clo)
      thermal_resistance: {
        torso: thermalProps.rcl_torso,
        arms: thermalProps.rcl_arms,
        legs: thermalProps.rcl_legs,
        whole_body: thermalProps.rcl_whole_body,
        unit: 'clo',
      },
      // Evaporative resistance
      evaporative_resistance: {
        torso: thermalProps.recl_torso,
        arms: thermalProps.recl_arms,
        legs: thermalProps.recl_legs,
        whole_body: thermalProps.recl_whole_body,
        unit: 'm²Pa/W',
      },
      // Derived metrics
      permeability_index: thermalProps.im_whole_body,
      evaporative_potential: thermalProps.evap_potential,
      // Data quality
      estimation_method: thermalProps.estimation_method,
      confidence_score: thermalProps.confidence_score,
    } : null,
    protection: garment.garment_protection,
    ventilation: garment.garment_ventilation,
    activity_ratings: garment.garment_activity_ratings,
    materials: garment.garment_materials,
  };

  return NextResponse.json(response);
}
