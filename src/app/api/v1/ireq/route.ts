import { NextRequest, NextResponse } from 'next/server';
import {
  calculateIreq,
  fahrenheitToCelsius,
  mphToMs,
  celsiusToFahrenheit,
  msToMph,
} from '@/lib/biophysics/ireq';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';

/**
 * GET /api/v1/ireq
 * Calculate required insulation for conditions
 *
 * Query params:
 * - temp: temperature (required)
 * - wind: wind speed (required)
 * - humidity: relative humidity (default: 50)
 * - activity: activity level key (default: 'alpine_skiing')
 * - units: 'imperial' or 'metric' (default: 'imperial')
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Get parameters
  const tempParam = searchParams.get('temp');
  const windParam = searchParams.get('wind');
  const humidity = parseFloat(searchParams.get('humidity') ?? '50');
  const activityKey = searchParams.get('activity') ?? 'alpine_skiing';
  const units = searchParams.get('units') ?? 'imperial';

  // Validate required params
  if (!tempParam || !windParam) {
    return NextResponse.json(
      { error: 'Missing required parameters: temp and wind' },
      { status: 400 }
    );
  }

  const tempRaw = parseFloat(tempParam);
  const windRaw = parseFloat(windParam);

  if (isNaN(tempRaw) || isNaN(windRaw)) {
    return NextResponse.json(
      { error: 'Invalid temp or wind value' },
      { status: 400 }
    );
  }

  // Convert to metric if needed
  const tempC = units === 'imperial' ? fahrenheitToCelsius(tempRaw) : tempRaw;
  const windMs = units === 'imperial' ? mphToMs(windRaw) : windRaw;

  // Get metabolic rate
  const metabolicRate =
    METABOLIC_RATES[activityKey as keyof typeof METABOLIC_RATES] ??
    METABOLIC_RATES.alpine_skiing;

  // Calculate IREQ
  const ireq = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: humidity,
    metabolicRate,
  });

  // Build response
  const response = {
    input: {
      temperature: units === 'imperial'
        ? { value: tempRaw, unit: '°F' }
        : { value: tempRaw, unit: '°C' },
      wind_speed: units === 'imperial'
        ? { value: windRaw, unit: 'mph' }
        : { value: windRaw, unit: 'm/s' },
      humidity: { value: humidity, unit: '%' },
      activity: activityKey,
      metabolic_rate: { value: metabolicRate, unit: 'W/m²' },
    },
    result: {
      ireq_min: {
        value: ireq.ireqMin,
        unit: 'clo',
        description: 'Minimum insulation to prevent cooling',
      },
      ireq_neutral: {
        value: ireq.ireqNeutral,
        unit: 'clo',
        description: 'Insulation for thermal comfort',
      },
      duration_limited_exposure: {
        value: ireq.dleHours === Infinity ? null : ireq.dleHours,
        unit: 'hours',
        description: 'Max exposure time at minimum insulation',
      },
    },
    reference: {
      clo_examples: [
        { value: 0.5, description: 'Light base layer' },
        { value: 1.0, description: 'Base + light mid layer' },
        { value: 1.5, description: 'Base + fleece' },
        { value: 2.0, description: 'Base + insulated jacket' },
        { value: 2.5, description: 'Full winter ensemble' },
        { value: 3.5, description: 'Heavy winter ensemble' },
      ],
    },
  };

  return NextResponse.json(response);
}
