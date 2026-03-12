import { ChevronRight, Pencil } from "lucide-react";
import ScoreDisplay from "@/components/ScoreDisplay";
import { cn } from "@/lib/utils";
import type { PrecipitationType } from "@/types/weather";

interface WeatherHeaderProps {
  temperature: number;
  windspeed: number;
  feelsLike?: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
  score?: number;
  totalClo?: number;
  targetRange?: [number, number];
  regionalDeficit?: number;
  hasRegionalGap?: boolean;
  extremityDeficit?: number;
  hasExtremityGap?: boolean;
  interactive?: boolean;
  onEditWeather?: () => void;
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
  precipitation,
  precipitationType,
  score,
  totalClo,
  targetRange,
  regionalDeficit,
  hasRegionalGap,
  extremityDeficit,
  hasExtremityGap,
  interactive,
  onEditWeather,
}: WeatherHeaderProps) {
  const calculatedFeelsLike = feelsLike ?? calculateFeelsLike(temperature, windspeed);
  const showFeelsLike = calculatedFeelsLike !== temperature;
  const isInteractive = interactive && typeof onEditWeather === "function";

  const content = (
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
            {precipitation && (
              <>
                <span className="opacity-50">·</span>
                <span className="capitalize">{precipitationType ?? 'Precipitation'}</span>
              </>
            )}
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
            extremityDeficit={extremityDeficit}
            hasExtremityGap={hasExtremityGap}
          />
        )}
      </div>
    </div>
  );

  if (!isInteractive) {
    return content;
  }

  return (
    <button
      type="button"
      onClick={onEditWeather}
      aria-label="Change weather location, date, or time"
      className={cn(
        "group w-full rounded-2xl border border-white/20 bg-white/[0.05] p-3 text-left transition-colors",
        "hover:bg-white/[0.09] active:bg-white/[0.12]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
      )}
    >
      {content}
      <div className="pt-3">
        <span className="inline-flex w-full items-center justify-between rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-white/85 transition-colors group-hover:bg-white/15">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <Pencil className="size-3.5" />
            Change location or time
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/70">
            Tap
            <ChevronRight className="size-3.5" />
          </span>
        </span>
      </div>
    </button>
  );
}
