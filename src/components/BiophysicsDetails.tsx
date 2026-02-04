import React from "react";
import { BiophysicsRecommendation } from "@/types/biophysics";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FlaskConical, ThermometerSnowflake, Droplets, Shield, Gauge, Activity, Shirt } from "lucide-react";

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

  return (
    <Accordion type="single" collapsible className="border-t">
      <AccordionItem value="science" className="border-b-0">
        <AccordionTrigger className="py-3 text-sm">
          <span className="flex items-center gap-2">
            <FlaskConical className="size-4" />
            Science Details
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-4 text-sm">
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
                <div className="flex flex-col gap-2">
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Target:</span>
                <span className="font-mono text-xs">
                  {ireq.target_range[0].toFixed(2)} - {ireq.target_range[1].toFixed(2)} clo
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Actual:</span>
                <span className="font-mono text-xs">
                  {ensemble_properties.total_clo.toFixed(2)} clo
                </span>
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

            {/* Component Scores */}
            <div>
              <h4 className="font-medium mb-2">Component Scores</h4>
              <div className="flex flex-col gap-1">
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
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default BiophysicsDetails;
