import { Mountain } from "lucide-react";
import { formatElevation } from "@/lib/locationSuggestion";
import type { ForecastPointProvenance, WeatherProvenance } from "@/types/weather";

/** "Top of K-1 Express Gondola, 1,262 m (4,140 ft)": a resort point and the elevation it was read at. */
function forecastPointSummary(point: ForecastPointProvenance): string | null {
  if (typeof point.label !== "string" || !point.label) return null;
  return typeof point.elevationM === "number" && Number.isFinite(point.elevationM)
    ? `${point.label}, ${formatElevation(point.elevationM)}` : point.label;
}

/**
 * Where a resort's forecast was read (#7), shown with the weather so the
 * layers can be read against it. Nothing for an ordinary place.
 */
export function ForecastPointLine({ point }: { point?: ForecastPointProvenance }) {
  const summary = point && forecastPointSummary(point);
  if (!summary) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <Mountain className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>Forecast at {summary}</span>
    </p>
  );
}

/** Keep unknown provider freshness absent; available-hour bounds may contain gaps. */
export function WeatherSourceDetails({ provenance }: { provenance?: WeatherProvenance }) {
  if (!provenance) return null;
  const { coverage, point } = provenance;
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-control py-2 text-foreground underline decoration-border underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Weather source and coverage
      </summary>
      <div className="space-y-2 break-words pt-1">
        <p>{provenance.provider}. Source units: °F and mph.</p>
        {point && (
          <p>
            Forecast point: {point.label ? `${point.label}, ` : ""}{point.latitude}, {point.longitude}
            {point.elevationM !== undefined && <>, at {formatElevation(point.elevationM)}</>}
            {point.elevationSource === "requested" ? " (the resort's mapped elevation)." : " (the provider's terrain elevation)."}
          </p>
        )}
        {provenance.timeZone && <p>Destination time zone: {provenance.timeZone}.</p>}
        {provenance.observedTime && <p>Current conditions timestamp: {provenance.observedTime.replace("T", " ")}.</p>}
        {coverage && <p>Available forecast: {coverage.firstHour.replace("T", " ")} to {coverage.lastHour.replace("T", " ")}. {coverage.availableHours} usable hours; gaps may exist within this range.</p>}
      </div>
    </details>
  );
}
