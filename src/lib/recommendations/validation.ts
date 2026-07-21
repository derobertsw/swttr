/**
 * Request validation for recommendation API routes
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { fahrenheitToCelsius, mphToMs } from '@/lib/biophysics/ireq';
import { getAuthUserId } from '@/lib/auth';
import type { PrecipitationType } from '@/types/weather';

export interface WeatherInput {
  temperature: number;
  wind_speed: number;
  humidity?: number;
  precipitation?: boolean;
  precipitation_type?: PrecipitationType;
}

export interface ValidatedRequest {
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
  userId: string | null;
  weather: WeatherInput;
  tempC: number;
  windMs: number;
  body: Record<string, unknown>;
}

/**
 * Validate common request fields for recommendation endpoints
 * Returns ValidatedRequest on success, NextResponse on error
 */
export async function validateRecommendationRequest(
  request: NextRequest
): Promise<ValidatedRequest | NextResponse> {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const userId = await getAuthUserId();
  const body = await request.json();

  if (body.weather?.temperature === undefined || body.weather?.wind_speed === undefined) {
    return NextResponse.json(
      { error: 'weather.temperature and weather.wind_speed are required' },
      { status: 400 }
    );
  }

  return {
    supabase,
    userId,
    weather: body.weather,
    tempC: fahrenheitToCelsius(body.weather.temperature),
    windMs: mphToMs(body.weather.wind_speed),
    body,
  };
}
