"use client";

import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, CloudRain, CloudSnow, Loader2, MapPin, Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ACTIVITIES } from "@/data/activities";
import { EXERTION_LABELS, type ExertionLevel } from "@/lib/biophysics/exertion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PrecipitationType, WeatherContext } from "@/types/weather";
import { useTemperatureUnit } from "@/components/TemperatureUnitProvider";
import { formatTemperature } from "@/lib/temperature";
import { OutingTimeSummary } from "@/components/OutingTimeSummary";
import { WeatherSourceDetails } from "@/components/WeatherSourceDetails";
import type { Outing } from "@/types/outing";

/** The button that opens the place and time drawer, which returns focus to it. */
export const EDIT_WEATHER_ID = "result-edit-weather";

/** What kind of layers the result shows. */
type AdviceKind = "personalized" | "general";

interface ResultHeaderProps {
  outing?: Outing;
  activity?: string;
  exertion?: ExertionLevel;
  /** Omitted when there are no layers. */
  adviceKind?: AdviceKind;
  temperature: number;
  windspeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
  /** Where and when the weather applies. */
  context?: WeatherContext | null;
  /** Back to the form with the outing as entered. */
  onEditOuting?: () => void;
  onActivityChange?: (activity: string) => Promise<void>;
  /** Opens the place and time drawer. */
  onEditWeather?: () => void;
  loading?: boolean;
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

/** Falling now, or expected in a forecast. */
function precipitationLabel(
  precipitationType: PrecipitationType | undefined,
  isForecast: boolean
): { label: string; icon: LucideIcon } {
  switch (precipitationType) {
    case "rain":
      return { label: isForecast ? "Rain expected" : "Raining now", icon: CloudRain };
    case "mixed":
      return { label: isForecast ? "Wintry mix expected" : "Wintry mix now", icon: CloudRain };
    case "snow":
      return { label: isForecast ? "Snow expected" : "Snowing now", icon: CloudSnow };
    default:
      return { label: isForecast ? "Precipitation expected" : "Precipitation now", icon: CloudRain };
  }
}

/**
 * The forecast hour on the place's clock, e.g. "Thu, Oct 15, 2:00 PM EDT",
 * whatever time zone the device is in.
 */
function formatForecastTime(forecastTime: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(forecastTime));
  } catch {
    // A time zone this browser doesn't know: show the time with its UTC offset.
    return forecastTime.replace("T", " ");
  }
}

function ActivityControl({
  activity,
  onActivityChange,
  loading,
}: Pick<ResultHeaderProps, "activity" | "onActivityChange" | "loading">) {
  const [open, setOpen] = useState(false);
  const selected = ACTIVITIES.find((candidate) => candidate.value === activity);
  if (!selected) return null;

  if (!onActivityChange) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <selected.icon className="size-4" aria-hidden="true" />
        {selected.name}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => { if (!loading) setOpen(next); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          aria-label={`${selected.name}, change activity`}
          className="font-semibold"
        >
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <selected.icon aria-hidden="true" />}
          {selected.name}
          <ChevronDown className="opacity-70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        {ACTIVITIES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "flex min-h-9 w-full items-center gap-2.5 rounded-[calc(var(--radius)-4px)] px-3 py-2 text-base transition-colors hover:bg-accent hover:text-accent-foreground max-md:min-h-11 pointer-coarse:min-h-11 md:text-sm",
              option.value === activity && "font-semibold"
            )}
            onClick={() => {
              setOpen(false);
              if (option.value !== activity) {
                void onActivityChange(option.value);
              }
            }}
          >
            <option.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">{option.name}</span>
            {option.value === activity && <Check className="size-4 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The outing the layers are for: activity and effort, place and time, and the
 * conditions they were built for, with ways to change each.
 */
export function ResultHeader({
  outing,
  activity,
  exertion,
  adviceKind,
  temperature,
  windspeed,
  precipitation,
  precipitationType,
  context,
  onEditOuting,
  onActivityChange,
  onEditWeather,
  loading,
}: ResultHeaderProps) {
  const { temperatureUnit } = useTemperatureUnit();
  const feelsLike = calculateFeelsLike(temperature, windspeed);
  const isForecast = context?.source === "forecast";
  const precipitationState = precipitation ? precipitationLabel(precipitationType, isForecast) : null;
  const when = context
    ? context.source === "forecast"
      ? `Forecast for ${formatForecastTime(context.forecastTime, context.timeZone)}`
      : "Current conditions"
    : null;

  return (
    <header className="flex flex-col gap-3">
      {onEditOuting && (
        <Button type="button" variant="ghost" size="sm" className="-ml-3 self-start" onClick={onEditOuting}>
          <ArrowLeft aria-hidden="true" />
          Edit outing
        </Button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-title font-semibold text-foreground md:text-title-lg">Your layers</h2>
        {adviceKind === "personalized" && <Badge variant="primary">Personalized</Badge>}
        {adviceKind === "general" && <Badge variant="neutral">General guide</Badge>}
      </div>

      <div className="flex flex-col gap-1.5">
        {(activity || exertion) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
            <ActivityControl activity={activity} onActivityChange={onActivityChange} loading={loading} />
            {exertion && <span className="text-muted-foreground">{EXERTION_LABELS[exertion]} effort</span>}
          </div>
        )}
        {context && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="text-foreground">{context.place ?? "Your location"}</span>
              <span aria-hidden="true"> · </span>
              <span>{when}</span>
            </span>
          </p>
        )}
        {outing && <OutingTimeSummary when={outing.when} />}
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{formatTemperature(temperature, temperatureUnit)}</span>
          {feelsLike !== temperature && <> · Feels like {formatTemperature(feelsLike, temperatureUnit)}</>}
          {" · "}
          <span>Wind {windspeed} mph</span>
        </p>
        {precipitationState && (
          <p
            className="flex items-center gap-1.5 text-sm font-medium text-foreground"
            data-precipitation-state={precipitationType ?? "precipitation"}
          >
            <precipitationState.icon className="size-4 shrink-0" aria-hidden="true" />
            {precipitationState.label}
          </p>
        )}
      </div>

      <WeatherSourceDetails provenance={context?.provenance} />

      {onEditWeather && (
        <Button id={EDIT_WEATHER_ID} type="button" variant="outline" size="sm" className="self-start" onClick={onEditWeather} disabled={loading}>
          <Pencil aria-hidden="true" />
          Change place or time
        </Button>
      )}
    </header>
  );
}
