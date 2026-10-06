import type { WeatherProvenance } from "@/types/weather";

/** Keep unknown provider freshness absent; available-hour bounds may contain gaps. */
export function WeatherSourceDetails({ provenance }: { provenance?: WeatherProvenance }) {
  if (!provenance) return null;
  const { coverage } = provenance;
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-control py-2 text-foreground underline decoration-border underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Weather source and coverage
      </summary>
      <div className="space-y-2 break-words pt-1">
        <p>{provenance.provider}. Source units: °F and mph.</p>
        {provenance.timeZone && <p>Destination time zone: {provenance.timeZone}.</p>}
        {provenance.observedTime && <p>Current conditions timestamp: {provenance.observedTime.replace("T", " ")}.</p>}
        {coverage && <p>Available forecast: {coverage.firstHour.replace("T", " ")} to {coverage.lastHour.replace("T", " ")}. {coverage.availableHours} usable hours; gaps may exist within this range.</p>}
      </div>
    </details>
  );
}
