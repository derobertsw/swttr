import ScoreDisplay from "@/components/ScoreDisplay";

interface WeatherHeaderProps {
  temperature: number;
  windspeed: number;
  feelsLike?: number;
  score?: number;
  totalClo?: number;
  targetRange?: [number, number];
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
}: WeatherHeaderProps) {
  const calculatedFeelsLike = feelsLike ?? calculateFeelsLike(temperature, windspeed);
  const showFeelsLike = calculatedFeelsLike !== temperature;

  return (
    <div className="pb-6 border-b border-white/20">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <div
            className="relative"
            style={{
              background: "radial-gradient(circle at 30% 50%, rgba(0,0,0,0.12) 0%, transparent 70%)",
              margin: "-12px",
              padding: "12px",
            }}
          >
            <span
              className="text-7xl font-medium tracking-tight"
              style={{
                color: "#F8FAFC",
                textShadow: "0px 1px 6px rgba(0,0,0,0.25)",
              }}
            >
              {temperature}
            </span>
            <span
              className="text-lg font-medium align-top ml-0.5"
              style={{
                color: "rgba(248,250,252,0.7)",
                textShadow: "0px 1px 4px rgba(0,0,0,0.2)",
                position: "relative",
                top: "-8px",
              }}
            >
              °F
            </span>
          </div>

          <div
            className="mt-2 flex items-center gap-1.5 text-[15px]"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            {showFeelsLike && (
              <>
                <span>Feels like {calculatedFeelsLike}°</span>
                <span style={{ opacity: 0.5 }}>·</span>
              </>
            )}
            <span>Wind {windspeed} mph</span>
          </div>

          {temperature < 32 && (
            <p
              className="mt-3 text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.8)" }}
            >
              Be Bold, Start Cold
            </p>
          )}
        </div>

        {score !== undefined && (
          <ScoreDisplay
            score={score}
            size="lg"
            totalClo={totalClo}
            targetRange={targetRange}
          />
        )}
      </div>
    </div>
  );
}
