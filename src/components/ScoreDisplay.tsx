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
  totalClo?: number;
  targetRange?: [number, number];
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
    label: "Cold Stress",
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
const ScoreDisplay = ({ score, size = "md", className, totalClo, targetRange }: ScoreDisplayProps) => {
  const roundedScore = Math.round(score);

  const getStatus = (): ThermalStatus => {
    if (totalClo !== undefined && targetRange) {
      const [targetMin, targetMax] = targetRange;
      if (totalClo < targetMin) return "cold_stress";
      // Allow a small buffer above target max before flagging overheating.
      if (totalClo > targetMax + 0.3) return "overheating";
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
          className={cn(
            "inline-flex items-center whitespace-nowrap rounded-full border font-medium cursor-help transition-colors hover:bg-slate-50",
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
          <PopoverTitle>Thermal Comfort Status</PopoverTitle>
          <PopoverDescription>
            Thermal comfort score: {roundedScore}/100
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 space-y-3 text-xs">
          <p className="text-slate-600">
            {config.description}
          </p>
          <p className="text-slate-500">
            Status logic: we first check your insulation against the IREQ target range.
            If clo is below target minimum, status is cold stress. If clo is above
            target maximum + 0.3 clo, status is overheating risk. Otherwise score bands apply.
          </p>
          {totalClo !== undefined && targetRange && (
            <p className="text-slate-500">
              Current insulation: {totalClo.toFixed(2)} clo, target range: {targetRange[0].toFixed(2)}-{targetRange[1].toFixed(2)} clo.
            </p>
          )}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-teal-500" />
              <span>Optimal: in range + score 80+</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-green-500" />
              <span>Comfortable: in range + score 60-79</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-blue-500" />
              <span>Cold stress: clo below target minimum</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="size-2 rounded-full bg-amber-500" />
              <span>Overheating: clo above target max + 0.3</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ScoreDisplay;
