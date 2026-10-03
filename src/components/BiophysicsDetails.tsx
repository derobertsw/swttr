import React from "react";
import { BiophysicsRecommendation } from "@/types/biophysics";
import { ThermometerSnowflake, Droplets, Shield, Gauge, Activity, Shirt } from "lucide-react";

interface BiophysicsDetailsProps {
  data: BiophysicsRecommendation;
}

const scoreLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  coldProtection: { label: "Cold protection", icon: <ThermometerSnowflake className="size-3.5" aria-hidden="true" /> },
  overheatPrevention: { label: "Overheat prevention", icon: <ThermometerSnowflake className="size-3.5" aria-hidden="true" /> },
  breathability: { label: "Breathability", icon: <Droplets className="size-3.5" aria-hidden="true" /> },
  weatherProtection: { label: "Weather protection", icon: <Shield className="size-3.5" aria-hidden="true" /> },
  weight: { label: "Weight", icon: <Gauge className="size-3.5" aria-hidden="true" /> },
  mobility: { label: "Mobility", icon: <Activity className="size-3.5" aria-hidden="true" /> }, // backward compatibility for older payloads
};

const BiophysicsDetails = ({ data }: BiophysicsDetailsProps) => {
  const { ireq, recommendation } = data;
  const { ensemble_properties, component_scores } = recommendation;

  const dleHours = ireq.dle_hours
    ?? ireq.chairlift?.dle_hours
    ?? ireq.downhill?.dle_hours
    ?? ireq.uphill?.dle_hours
    ?? ireq.skiing?.dle_hours;

  // Calculate delta: midpoint of target range vs actual
  const targetMidpoint = (ireq.target_range[0] + ireq.target_range[1]) / 2;
  const delta = ensemble_properties.total_clo - targetMidpoint;
  const displayedScores = Object.entries(component_scores).filter(([key]) => Boolean(scoreLabels[key]));

  return (
    <div className="text-foreground">
      <div className="flex flex-col gap-6 text-sm">
        {/* Analyzed Garments */}
        {recommendation.garments.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-2 font-semibold">
              <Shirt className="size-4" aria-hidden="true" />
              Garment thermal properties
            </h4>
            <p className="mb-2 text-xs text-muted-foreground">
              Rcl = thermal resistance (clo), Recl = evaporative resistance (m²Pa/W)
            </p>
            <div className="flex flex-col gap-3">
              {recommendation.garments.map((garment) => (
                <div key={garment.id} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{garment.name}</span>
                    <span className="text-xs text-muted-foreground first-letter:uppercase">
                      {garment.category.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-0.5 flex gap-4 font-mono text-muted-foreground">
                    <span>Rcl: {garment.rcl?.toFixed(2) ?? "—"} clo</span>
                    <span>Recl: {garment.recl?.toFixed(1) ?? "—"} m²Pa/W</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* IREQ Range */}
        <div>
          <h4 className="mb-1 font-semibold">Required insulation (IREQ)</h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Target clo range based on activity and conditions
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-12 text-xs text-muted-foreground">Target:</span>
              <span className="font-mono text-xs">
                {ireq.target_range[0].toFixed(2)} - {ireq.target_range[1].toFixed(2)} clo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-xs text-muted-foreground">Actual:</span>
              <span className="font-mono text-xs">
                {ensemble_properties.total_clo.toFixed(2)} clo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-xs text-muted-foreground">Delta:</span>
              <span className={`font-mono text-xs ${delta >= 0 ? "text-success" : "text-warning"}`}>
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(2)} clo
              </span>
            </div>
            {typeof dleHours === "number" && Number.isFinite(dleHours) && (
              <div className="flex items-center gap-2">
                <span className="w-12 text-xs text-muted-foreground">DLE*:</span>
                <span className="font-mono text-xs">
                  {dleHours.toFixed(2)} h
                </span>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            * DLE is currently a bounded exposure-planning heuristic.
          </p>
        </div>

        {/* Ensemble Properties */}
        <div>
          <h4 className="mb-1 font-semibold">Ensemble properties</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Total clo</span>
              <span className="font-mono text-xs">{ensemble_properties.total_clo.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Evap potential</span>
              <span className="font-mono text-xs">{ensemble_properties.evap_potential.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Permeability</span>
              <span className="font-mono text-xs">{ensemble_properties.permeability_index.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Component Scores */}
        {displayedScores.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold">Component scores</h4>
            <div className="flex flex-col gap-2">
              {displayedScores.map(([key, value]) => {
                const config = scoreLabels[key];
                if (!config) return null;
                return (
                  <div key={key} className="flex items-center gap-2">
                    {config.icon}
                    <span className="flex-1 text-xs">{config.label}</span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, value)}%` }}
                      />
                    </div>
                    <span className="w-6 text-right font-mono text-xs">{Math.round(value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BiophysicsDetails;
