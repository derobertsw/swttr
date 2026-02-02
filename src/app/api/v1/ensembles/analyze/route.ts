import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { garmentToThermalProps } from '@/lib/biophysics/ensemble';
import {
  scoreEnsemble,
  convertWeatherToMetric,
  type GarmentWithProtection,
} from '@/lib/biophysics/scorer';
import { METABOLIC_RATES, type ActivityType } from '@/lib/biophysics/constants';

/**
 * POST /api/v1/ensembles/analyze
 * Analyze an ensemble of garments for given conditions
 *
 * Body:
 * {
 *   garment_ids: string[],
 *   weather: {
 *     temperature: number,  // °F
 *     wind_speed: number,   // mph
 *     humidity?: number,    // % (default 50)
 *     precipitation?: boolean,
 *     precipitation_type?: 'rain' | 'snow' | 'mixed'
 *   },
 *   activity: 'xc_skiing' | 'ski_touring_uphill' | 'ski_touring_downhill' | 'alpine_skiing'
 * }
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

  // Validate input
  if (!body.garment_ids || !Array.isArray(body.garment_ids) || body.garment_ids.length === 0) {
    return NextResponse.json(
      { error: 'garment_ids must be a non-empty array' },
      { status: 400 }
    );
  }

  if (!body.weather?.temperature || body.weather?.wind_speed === undefined) {
    return NextResponse.json(
      { error: 'weather.temperature and weather.wind_speed are required' },
      { status: 400 }
    );
  }

  const activityType = (body.activity ?? 'alpine_skiing') as ActivityType;

  // Fetch garments with thermal properties and protection
  const { data: garments, error } = await supabase
    .from('garments')
    .select(`
      *,
      garment_thermal_properties (*),
      garment_protection (*)
    `)
    .in('id', body.garment_ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!garments || garments.length === 0) {
    return NextResponse.json(
      { error: 'No garments found with provided IDs' },
      { status: 404 }
    );
  }

  // Convert garments to ThermalProps format with protection data
  const thermalGarments: GarmentWithProtection[] = garments.map((g) => {
    const baseProps = garmentToThermalProps(g, g.garment_thermal_properties ?? {});
    return {
      ...baseProps,
      category: g.category,
      windproofRating: g.garment_protection?.windproof_rating as GarmentWithProtection['windproofRating'],
      waterproofRating: g.garment_protection?.waterproof_rating as GarmentWithProtection['waterproofRating'],
      waterproofMm: g.garment_protection?.waterproof_mm,
    };
  });

  // Convert weather to metric
  const weatherMetric = convertWeatherToMetric({
    temperatureF: body.weather.temperature,
    windSpeedMph: body.weather.wind_speed,
    humidity: body.weather.humidity ?? 50,
    precipitation: body.weather.precipitation ?? false,
    precipitationType: body.weather.precipitation_type,
  });

  // Get metabolic rate for activity
  const metabolicRateKey = {
    xc_skiing: 'xc_skiing_moderate',
    ski_touring_uphill: 'ski_touring_uphill',
    ski_touring_downhill: 'ski_touring_downhill',
    alpine_skiing: 'alpine_skiing',
  }[activityType] as keyof typeof METABOLIC_RATES;

  // Score the ensemble
  const score = scoreEnsemble(
    thermalGarments,
    weatherMetric,
    {
      name: activityType,
      metabolicRate: METABOLIC_RATES[metabolicRateKey],
      hasStaticPeriods: activityType === 'alpine_skiing',
      windExposure: activityType === 'ski_touring_uphill' ? 'sheltered' : 'exposed',
    },
    activityType
  );

  // Build response
  return NextResponse.json({
    input: {
      garments: garments.map((g) => ({
        id: g.id,
        name: `${g.brand} ${g.model_name}`,
        category: g.category,
      })),
      weather: {
        temperature: `${body.weather.temperature}°F`,
        wind_speed: `${body.weather.wind_speed} mph`,
        humidity: `${body.weather.humidity ?? 50}%`,
        precipitation: body.weather.precipitation ?? false,
      },
      activity: activityType,
    },
    analysis: score,
    interpretation: {
      overall:
        score.totalScore >= 80
          ? 'Excellent ensemble for these conditions'
          : score.totalScore >= 60
          ? 'Good ensemble with minor adjustments recommended'
          : score.totalScore >= 40
          ? 'Adequate but significant improvements possible'
          : 'Not recommended for these conditions',
      details: generateInterpretation(score, activityType),
    },
  });
}

function generateInterpretation(
  score: ReturnType<typeof scoreEnsemble>,
  activity: ActivityType
): string[] {
  const details: string[] = [];

  if (score.componentScores.coldProtection < 50) {
    details.push(
      `Add more insulation. You have ${score.ensembleProperties.rclClo} clo but need at least ${score.ireq.min} clo.`
    );
  }

  if (score.componentScores.overheatPrevention < 50 && activity.includes('touring') || activity === 'xc_skiing') {
    details.push(
      'Risk of overheating during exertion. Consider lighter or more breathable layers.'
    );
  }

  if (score.componentScores.breathability < 60 && activity !== 'alpine_skiing') {
    details.push(
      `Breathability is limited (evap potential: ${score.ensembleProperties.evapPotential}). Consider more permeable fabrics.`
    );
  }

  if (score.componentScores.weatherProtection < 70) {
    details.push('Add a shell layer for better wind and precipitation protection.');
  }

  if (details.length === 0) {
    details.push('This ensemble is well-suited for the conditions and activity.');
  }

  return details;
}
