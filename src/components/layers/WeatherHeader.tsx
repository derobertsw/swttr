import ScoreDisplay from "@/components/ScoreDisplay";

interface WeatherHeaderProps {
  temperature: number;
  windspeed: number;
  feelsLike?: number;
  score?: number;
  totalClo?: number;
  targetRange?: [number, number];
  regionalDeficit?: number;
  hasRegionalGap?: boolean;
}

/**
 * Calculates wind chill (feels like temperature) for cold conditions
 * Uses NWS wind chill formula when temp <= 50F and wind > 3 mph
 */
function calculateFeelsLike(temperature: number, windspeed: number): number {
  if (temperature <= 50 && windspeed > 3) {
    const windChill =
      35.74 +
      0.6215 * temperature -
      35.75 * Math.pow(windspeed, 0.16) +
      0.4275 * temperature * Math.pow(windspeed, 0.16);
    return Math.round(windChill);
  }
  return temperature;
}

/**
 * Displays current weather conditions and optional thermal comfort score
 * Layout prioritizes temperature as the hero element with secondary details below
 */
export function WeatherHeader({
  temperature,
  windspeed,
  feelsLike,
  score,
  totalClo,
  targetRange,
  regionalDeficit,
  hasRegionalGap,
}: WeatherHeaderProps) {
  const calculatedFeelsLike = feelsLike ?? calculateFeelsLike(temperature, windspeed);
  const showFeelsLike = calculatedFeelsLike !== temperature;

  return (
    <div className="pb-6 border-b border-white/20">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <div className="relative -m-3 p-3 bg-[radial-gradient(circle_at_30%_50%,rgba(0,0,0,0.12)_0%,transparent_70%)]">
            <span className="text-7xl font-medium tracking-tight text-slate-50 [text-shadow:0px_1px_6px_rgba(0,0,0,0.25)]">
              {temperature}
            </span>
            <span className="ml-0.5 relative -top-2 align-top text-lg font-medium text-slate-200/85 [text-shadow:0px_1px_4px_rgba(0,0,0,0.2)]">
              °F
            </span>
          </div>

          <div className="mt-2 flex items-center gap-1.5 text-sm text-white/70">
            {showFeelsLike && (
              <>
                <span>Feels like {calculatedFeelsLike}°</span>
                <span className="opacity-50">·</span>
              </>
            )}
            <span>Wind {windspeed} mph</span>
          </div>

          {temperature < 32 && (
            <p className="mt-3 text-sm font-medium text-white/85">
              Be Bold, Start Cold
            </p>
          )}
        </div>

        {score !== undefined && (
          <ScoreDisplay
            score={score}
            size="md"
            totalClo={totalClo}
            targetRange={targetRange}
            regionalDeficit={regionalDeficit}
            hasRegionalGap={hasRegionalGap}
          />
        )}
      </div>
    </div>
  );
}
