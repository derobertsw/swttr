/**
 * Request parsing for recommendation API routes
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { fahrenheitToCelsius, mphToMs } from '@/lib/biophysics/ireq';
import { parseExertionLevel, type ExertionLevel } from '@/lib/biophysics/exertion';
import { parseBodyMetricsFromRequestBody } from '@/lib/biophysics/bodyMetrics';
import { getAuthUserId } from '@/lib/auth';
import type { UserBodyMetrics } from '@/types/preferences';
import type { PrecipitationType } from '@/types/weather';

export interface WeatherInput {
  temperature: number;
  wind_speed: number;
  humidity?: number;
  precipitation?: boolean;
  precipitation_type?: PrecipitationType;
}

export interface RecommendationRequest {
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
  userId: string | null;
  /** Weather as sent (°F, mph), echoed back in `conditions`. */
  weather: WeatherInput;
  tempC: number;
  windMs: number;
  /** Relative humidity in percent (defaults to 50). */
  humidity: number;
  precipitation: boolean;
  exertion: ExertionLevel;
  bodyMetrics: UserBodyMetrics;
  useWardrobeOnly: boolean;
  prioritizeLightPack: boolean;
}

/**
 * Validate and parse a recommendation request body.
 * Returns the parsed request, or a NextResponse describing the error.
 */
export async function parseRecommendationRequest(
  request: NextRequest
): Promise<RecommendationRequest | NextResponse> {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const userId = await getAuthUserId();
  const body = await request.json();

  // Require finite numbers (0°F/0mph are valid), rejecting undefined, null,
  // booleans, and non-numeric strings that would otherwise coerce to a bogus
  // temperature in fahrenheitToCelsius.
  if (
    !Number.isFinite(body.weather?.temperature) ||
    !Number.isFinite(body.weather?.wind_speed)
  ) {
    return NextResponse.json(
      { error: 'weather.temperature and weather.wind_speed must be finite numbers' },
      { status: 400 }
    );
  }

  const weather: WeatherInput = body.weather;
  return {
    supabase,
    userId,
    weather,
    tempC: fahrenheitToCelsius(weather.temperature),
    windMs: mphToMs(weather.wind_speed),
    humidity: weather.humidity ?? 50,
    precipitation: weather.precipitation ?? false,
    exertion: parseExertionLevel(body.exertion ?? body.intensity),
    bodyMetrics: parseBodyMetricsFromRequestBody(body),
    useWardrobeOnly: body.use_wardrobe_only === true,
    prioritizeLightPack: Boolean(body.prioritize_light_pack),
  };
}
