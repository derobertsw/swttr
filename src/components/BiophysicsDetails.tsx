import React, { useState } from "react";
import { BiophysicsRecommendation } from "@/types/biophysics";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FlaskConical, ThermometerSnowflake, Droplets, Shield, Gauge, Activity, Shirt, ChevronDown } from "lucide-react";

interface BiophysicsDetailsProps {
  data: BiophysicsRecommendation;
}

const scoreLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  thermal: { label: "Thermal", icon: <ThermometerSnowflake className="size-3" /> },
  moisture: { label: "Moisture", icon: <Droplets className="size-3" /> },
  protection: { label: "Protection", icon: <Shield className="size-3" /> },
  weight: { label: "Weight", icon: <Gauge className="size-3" /> },
  mobility: { label: "Mobility", icon: <Activity className="size-3" /> },
};

/**
 * Collapsible accordion section showing detailed biophysics analysis
 */
const BiophysicsDetails = ({ data }: BiophysicsDetailsProps) => {
  const { ireq, recommendation } = data;
  const { ensemble_properties, component_scores } = recommendation;
  const [showDetailedScores, setShowDetailedScores] = useState(false);

  // Calculate delta: midpoint of target range vs actual
  const targetMidpoint = (ireq.target_range[0] + ireq.target_range[1]) / 2;
  const delta = ensemble_properties.total_clo - targetMidpoint;

  return (
    <Accordion type="single" collapsible className="mt-4">
      <AccordionItem value="science" className="border-0">
        <AccordionTrigger className="py-3 px-4 text-sm bg-slate-100/80 hover:bg-slate-200/80 rounded-lg transition-colors [&[data-state=open]]:rounded-b-none">
          <span className="flex items-center gap-2 text-slate-700 font-medium">
            <FlaskConical className="size-4" />
            Science (Advanced)
            <span className="text-xs font-normal text-slate-500 ml-1">Tap to expand</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="bg-slate-100/80 rounded-b-lg px-4 pb-4">
          <div className="flex flex-col gap-6 text-sm pt-2">
            {/* Analyzed Garments */}
            {recommendation.garments.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Shirt className="size-4" />
                  Garment Thermal Properties
                </h4>
                <p className="text-muted-foreground text-xs mb-2">
                  Rcl = thermal resistance (clo), Recl = evaporative resistance (m²Pa/W)
                </p>
                <div className="flex flex-col gap-3">
                  {recommendation.garments.map((garment) => (
                    <div key={garment.id} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{garment.name}</span>
                        <span className="text-muted-foreground text-[10px] capitalize">
                          {garment.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-0.5 font-mono text-muted-foreground">
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
              <h4 className="font-medium mb-1">Required Insulation (IREQ)</h4>
              <p className="text-muted-foreground text-xs mb-2">
                Target clo range based on activity and conditions
              </p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12">Target:</span>
                  <span className="font-mono text-xs">
                    {ireq.target_range[0].toFixed(2)} - {ireq.target_range[1].toFixed(2)} clo
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12">Actual:</span>
                  <span className="font-mono text-xs">
                    {ensemble_properties.total_clo.toFixed(2)} clo
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12">Delta:</span>
                  <span className={`font-mono text-xs ${delta >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)} clo
                  </span>
                </div>
              </div>
            </div>

            {/* Ensemble Properties */}
            <div>
              <h4 className="font-medium mb-1">Ensemble Properties</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Total Clo</span>
                  <span className="font-mono text-xs">{ensemble_properties.total_clo.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Evap Potential</span>
                  <span className="font-mono text-xs">{ensemble_properties.evap_potential.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Permeability</span>
                  <span className="font-mono text-xs">{ensemble_properties.permeability_index.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Component Scores - Hidden by default */}
            <div>
              <button
                onClick={() => setShowDetailedScores(!showDetailedScores)}
                className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800 transition-colors"
              >
                <ChevronDown
                  className={`size-3 transition-transform ${showDetailedScores ? 'rotate-180' : ''}`}
                />
                <span>{showDetailedScores ? 'Hide' : 'Show'} detailed scores</span>
              </button>
              {showDetailedScores && (
                <div className="mt-3">
                  <h4 className="font-medium mb-2">Component Scores</h4>
                  <div className="flex flex-col gap-2">
                    {Object.entries(component_scores).map(([key, value]) => {
                      const config = scoreLabels[key];
                      if (!config) return null;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          {config.icon}
                          <span className="text-xs flex-1">{config.label}</span>
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(100, value)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs w-6 text-right">{Math.round(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default BiophysicsDetails;
