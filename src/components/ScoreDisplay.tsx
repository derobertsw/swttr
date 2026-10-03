"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  OVERHEAT_BUFFER_CLO,
  THERMAL_DISPLAY_CLO_EPSILON,
} from "@/lib/biophysics/comfort";
import type { ThermalDecision } from "@/types/biophysics";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover";

interface ScoreDisplayProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  totalClo?: number;
  targetRange?: [number, number];
  /** Comfort decision from the layer evaluation, when available. */
  decision?: ThermalDecision | null;
}

type ThermalStatus = "optimal" | "comfortable" | "cold_stress" | "overheating";

interface StatusConfig {
  label: string;
  description: string;
  pillClass: string;
  dotClass: string;
}

const STATUS_CONFIG: Record<ThermalStatus, StatusConfig> = {
  optimal: {
    label: "Optimal",
    description: "Your insulation is well-matched for these conditions",
    pillClass: "bg-success-soft text-success",
    dotClass: "bg-success",
  },
  comfortable: {
    label: "Comfortable",
    description: "Minor adjustments may improve thermal balance",
    pillClass: "bg-primary-soft text-foreground",
    dotClass: "bg-primary",
  },
  cold_stress: {
    label: "Cold Stress",
    description: "Insufficient insulation for these conditions",
    pillClass: "bg-warning-soft text-warning",
    dotClass: "bg-warning",
  },
  overheating: {
    label: "Overheating Risk",
    description: "Over-insulated for these conditions—reduce layers",
    pillClass: "bg-warning-soft text-warning",
    dotClass: "bg-warning",
  },
};

/**
 * Displays thermal comfort as an integrated status pill with explanatory popover.
 * Uses meteorological language and Nordic-inspired colors for visual cohesion.
 */
const ScoreDisplay = ({
  score,
  size = "md",
  className,
  totalClo,
  targetRange,
  decision,
}: ScoreDisplayProps) => {
  const roundedScore = Math.round(score);

  const getStatus = (): ThermalStatus => {

    if (decision?.riskType === "cold") return "cold_stress";
    if (decision?.riskType === "overheat") return "overheating";

    if (decision?.riskType === "comfortable") {
      if (roundedScore >= 85) return "optimal";
      return "comfortable";
    }

    if (roundedScore >= 80) return "optimal";
    if (roundedScore >= 60) return "comfortable";
    return "cold_stress";
  };

  const status = getStatus();
  const config = STATUS_CONFIG[status];

  const sizeClasses = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-3.5 py-2 gap-2",
    lg: "text-sm px-4 py-2 gap-2",
  };

  const dotSizeClasses = {
    sm: "size-1.5",
    md: "size-2",
    lg: "size-2",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-help items-center whitespace-nowrap rounded-full font-semibold max-md:min-h-11 pointer-coarse:min-h-11",
            config.pillClass,
            sizeClasses[size],
            className
          )}
        >
          <span className={cn("rounded-full", config.dotClass, dotSizeClasses[size])} aria-hidden="true" />
          <span>{config.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverHeader>
          <PopoverTitle>Thermal comfort status</PopoverTitle>
          <PopoverDescription>
            Thermal comfort score: {roundedScore}/100
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-foreground">
            {config.description}
          </p>
          <p className="text-muted-foreground">
            Cold warnings show when total insulation falls more than {THERMAL_DISPLAY_CLO_EPSILON.toFixed(2)} clo
            below the target band or a body part falls more than {THERMAL_DISPLAY_CLO_EPSILON.toFixed(2)} clo
            below its minimum. A cold outfit scores up to 85, in proportion to the share of its needed
            insulation the worst-covered part has. Overheating only triggers above target max + {OVERHEAT_BUFFER_CLO.toFixed(1)} clo.
          </p>
          {totalClo !== undefined && targetRange && (
            <p className="text-muted-foreground">
              Current insulation: {totalClo.toFixed(2)} clo, target range: {targetRange[0].toFixed(2)}-{targetRange[1].toFixed(2)} clo.
            </p>
          )}
          <div className="space-y-1.5 border-t border-border pt-2">
            <div className="flex items-center gap-2 text-foreground">
              <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
              <span>Optimal: in range + score 85+</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <span>Comfortable: in range below 85</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
              <span>Cold stress: below the target band or a body part is below its minimum</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
              <span>Overheating: clo above target max + {OVERHEAT_BUFFER_CLO.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ScoreDisplay;
