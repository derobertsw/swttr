"use client";

import React from "react";
import { cn } from "@/lib/utils";
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
  isOverInsulated?: boolean;
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
    pillClass: "bg-teal-50 text-teal-700 border-teal-200",
    dotClass: "bg-teal-500",
  },
  comfortable: {
    label: "Comfortable",
    description: "Minor adjustments may improve thermal balance",
    pillClass: "bg-green-50 text-green-700 border-green-200",
    dotClass: "bg-green-500",
  },
  cold_stress: {
    label: "Cold Stress Likely",
    description: "Insufficient insulation for these conditions",
    pillClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
  },
  overheating: {
    label: "Overheating Risk",
    description: "Over-insulated for these conditions—reduce layers",
    pillClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
  },
};

/**
 * Displays thermal comfort as an integrated status pill with explanatory popover.
 * Uses meteorological language and Nordic-inspired colors for visual cohesion.
 */
const ScoreDisplay = ({ score, size = "md", className, isOverInsulated = false }: ScoreDisplayProps) => {
  const roundedScore = Math.round(score);

  const getStatus = (): ThermalStatus => {
    // Check for overheating first (over-insulated condition)
    if (isOverInsulated && roundedScore < 80) return "overheating";
    if (roundedScore >= 80) return "optimal";
    if (roundedScore >= 60) return "comfortable";
    return "cold_stress";
  };

  const status = getStatus();
  const config = STATUS_CONFIG[status];

  const sizeClasses = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-3.5 py-2 gap-2",
    lg: "text-sm px-4.5 py-2.5 gap-2",
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
          className={cn(
            "inline-flex items-center rounded-full border font-medium cursor-help transition-colors hover:bg-slate-50",
            config.pillClass,
            sizeClasses[size],
            className
          )}
        >
          <span className={cn("rounded-full", config.dotClass, dotSizeClasses[size])} />
          <span>{config.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverHeader>
          <PopoverTitle>Thermal Comfort</PopoverTitle>
          <PopoverDescription>
            Score: {roundedScore}/100
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 space-y-3 text-xs">
          <p className="text-slate-600">
            {config.description}
          </p>
          <p className="text-slate-500">
            Based on biophysics research (ISO 11079, USARIEM), this estimates how
            well your layers match the conditions.
          </p>
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-teal-500" />
              <span>80+ Optimal</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-green-500" />
              <span>60-79 Comfortable</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-blue-500" />
              <span>&lt;60 Cold Stress Likely</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-amber-500" />
              <span>Overheating Risk</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ScoreDisplay;
