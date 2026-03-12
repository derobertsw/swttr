import { ChevronRight, CloudRain, CloudSnow, Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

interface PrecipitationAlert {
  state: "rain" | "mixed" | "snow" | "precipitation";
  eyebrow: string;
  label: string;
  detail: string;
  badge: string;
  icon: LucideIcon;
  shellClassName: string;
  alertClassName: string;
  iconClassName: string;
  badgeClassName: string;
}

function getPrecipitationAlert(
  precipitation?: boolean,
  precipitationType?: PrecipitationType
): PrecipitationAlert | null {
  if (!precipitation) return null;

  switch (precipitationType) {
    case "rain":
      return {
        state: "rain",
        eyebrow: "Current weather",
        label: "Rain right now",
        detail: "Wet conditions: shell protection matters.",
        badge: "Shell on",
        icon: CloudRain,
        shellClassName:
          "border-cyan-100/28 bg-[linear-gradient(180deg,rgba(73,170,201,0.22)_0%,rgba(255,255,255,0.08)_34%,rgba(255,255,255,0.04)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_40px_rgba(7,52,88,0.18)]",
        alertClassName:
          "border-cyan-100/24 bg-slate-950/14 text-cyan-50 shadow-[0_18px_38px_rgba(8,145,178,0.18)]",
        iconClassName: "bg-cyan-200/18 text-cyan-50 ring-1 ring-inset ring-cyan-100/22",
        badgeClassName: "border-cyan-100/20 bg-white/10 text-cyan-50/90",
      };
    case "mixed":
      return {
        state: "mixed",
        eyebrow: "Current weather",
        label: "Wintry mix",
        detail: "Cold and wet: keep waterproof layers on.",
        badge: "Shell on",
        icon: CloudRain,
        shellClassName:
          "border-sky-100/25 bg-[linear-gradient(180deg,rgba(83,146,191,0.22)_0%,rgba(255,255,255,0.08)_34%,rgba(255,255,255,0.04)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_18px_40px_rgba(8,47,88,0.18)]",
        alertClassName:
          "border-sky-100/24 bg-slate-950/14 text-sky-50 shadow-[0_18px_38px_rgba(14,116,144,0.16)]",
        iconClassName: "bg-sky-200/18 text-sky-50 ring-1 ring-inset ring-sky-100/22",
        badgeClassName: "border-sky-100/20 bg-white/10 text-sky-50/90",
      };
    case "snow":
      return {
        state: "snow",
        eyebrow: "Current weather",
        label: "Snow falling",
        detail: "Active precipitation on route.",
        badge: "Snowing",
        icon: CloudSnow,
        shellClassName:
          "border-indigo-100/24 bg-[linear-gradient(180deg,rgba(125,143,214,0.18)_0%,rgba(255,255,255,0.08)_34%,rgba(255,255,255,0.04)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_18px_40px_rgba(49,59,123,0.16)]",
        alertClassName:
          "border-indigo-100/20 bg-slate-950/12 text-slate-50 shadow-[0_18px_38px_rgba(99,102,241,0.14)]",
        iconClassName: "bg-indigo-100/16 text-slate-50 ring-1 ring-inset ring-indigo-100/22",
        badgeClassName: "border-indigo-100/20 bg-white/10 text-slate-50/90",
      };
    default:
      return {
        state: "precipitation",
        eyebrow: "Current weather",
        label: "Precipitation",
        detail: "Wet conditions in the current weather.",
        badge: "Wet out",
        icon: CloudRain,
        shellClassName:
          "border-cyan-100/24 bg-[linear-gradient(180deg,rgba(73,170,201,0.18)_0%,rgba(255,255,255,0.08)_34%,rgba(255,255,255,0.04)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_18px_40px_rgba(7,52,88,0.16)]",
        alertClassName:
          "border-cyan-100/22 bg-slate-950/12 text-cyan-50 shadow-[0_18px_38px_rgba(8,145,178,0.16)]",
        iconClassName: "bg-cyan-200/16 text-cyan-50 ring-1 ring-inset ring-cyan-100/20",
        badgeClassName: "border-cyan-100/20 bg-white/10 text-cyan-50/90",
      };
  }
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
  const precipitationAlert = getPrecipitationAlert(precipitation, precipitationType);
  const isInteractive = interactive && typeof onEditWeather === "function";
  const shellClassName = cn(
    "group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-colors",
    precipitationAlert
      ? precipitationAlert.shellClassName
      : "border-white/20 bg-white/[0.05]",
    isInteractive &&
      (precipitationAlert
        ? "hover:border-white/40 active:border-white/50"
        : "hover:bg-white/[0.09] active:bg-white/[0.12]")
  );

  const content = (
    <div className={cn("relative z-20", isInteractive && "pointer-events-none")}>
      <div className="pb-6 border-b border-white/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col">
            <div className="relative -m-3 p-3 bg-[radial-gradient(circle_at_30%_50%,rgba(0,0,0,0.12)_0%,transparent_70%)]">
              <span className="text-7xl font-medium tracking-tight text-slate-50 [text-shadow:0px_1px_6px_rgba(0,0,0,0.25)]">
                {temperature}
              </span>
              <span className="ml-0.5 relative -top-2 align-top text-lg font-medium text-slate-200/85 [text-shadow:0px_1px_4px_rgba(0,0,0,0.2)]">
                °F
              </span>
            </div>
          </div>

          {score !== undefined && (
            <div className={cn(isInteractive && "pointer-events-auto relative z-30")}>
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
            </div>
          )}
        </div>

        {precipitationAlert && (
          <div
            className={cn(
              "mt-4 grid gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md sm:grid-cols-[auto_1fr_auto] sm:items-center",
              precipitationAlert.alertClassName
            )}
          >
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-2xl",
                precipitationAlert.iconClassName
              )}
            >
              <precipitationAlert.icon className="size-5 shrink-0" aria-hidden="true" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
                {precipitationAlert.eyebrow}
              </p>
              <p className="mt-1 text-base font-semibold text-white">
                {precipitationAlert.label}
              </p>
              <p className="mt-1 text-xs font-medium text-white/72">
                {precipitationAlert.detail}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                precipitationAlert.badgeClassName
              )}
            >
              {precipitationAlert.badge}
            </span>
          </div>
        )}

        <div className={cn("flex flex-wrap items-center gap-1.5 text-sm text-white/70", precipitationAlert ? "mt-4" : "mt-2")}>
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
    </div>
  );

  const footer = isInteractive ? (
    <div className="pointer-events-none relative z-20 pt-3">
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
  ) : null;
  const precipitationOverlay = precipitationAlert ? (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18)_0%,transparent_42%),linear-gradient(118deg,rgba(255,255,255,0.10)_0%,transparent_32%)]"
    />
  ) : null;

  if (!isInteractive) {
    return (
      <div
        className={shellClassName}
        data-precipitation-state={precipitationAlert?.state ?? "dry"}
      >
        {precipitationOverlay}
        {content}
      </div>
    );
  }

  return (
    <div
      className={shellClassName}
      data-precipitation-state={precipitationAlert?.state ?? "dry"}
    >
      <button
        type="button"
        onClick={onEditWeather}
        aria-label="Change weather location, date, or time"
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800"
      />
      {precipitationOverlay}
      {content}
      {footer}
    </div>
  );
}
