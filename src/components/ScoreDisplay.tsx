"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { ThermalDecision } from "@/types/biophysics";
import { Popover, PopoverContent, PopoverTrigger, PopoverHeader, PopoverTitle, PopoverDescription } from "@/components/ui/popover";

interface ScoreDisplayProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  totalClo?: number;
  targetRange?: [number, number];
  decision?: ThermalDecision | null;
}

/** Displays the server judgment. A numerical score cannot establish comfort. */
const ScoreDisplay = ({ score, size = "md", className, totalClo, targetRange, decision }: ScoreDisplayProps) => {
  const label = decision?.summary ?? (decision?.riskType === "comfortable" ? "Likely comfortable"
    : decision?.riskType === "cold" ? "Cooler than recommended"
      : decision?.riskType === "overheat" ? "Warmer than recommended" : "Comfort unknown");
  const nearTarget = decision?.status === "near_target" || (!decision?.status && decision?.riskType === "comfortable");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(
          "inline-flex cursor-help items-center whitespace-nowrap rounded-full font-semibold max-md:min-h-11 pointer-coarse:min-h-11",
          nearTarget ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
          size === "sm" ? "text-xs px-3 py-1.5 gap-1.5" : "text-sm px-3.5 py-2 gap-2", className,
        )}>
          <span className={cn("size-2 rounded-full", nearTarget ? "bg-success" : "bg-warning")} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverHeader>
          <PopoverTitle>Estimated thermal comfort</PopoverTitle>
          <PopoverDescription>Heuristic fit score: {Math.round(score)}/100. This is not a confidence percentage.</PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 space-y-3 text-sm">
          <p>{label}</p>
          {decision?.reasons?.map(reason => <p key={reason} className="text-muted-foreground">{reason}</p>)}
          {totalClo !== undefined && targetRange && <p className="text-muted-foreground">
            Current insulation: {totalClo.toFixed(2)} clo. Estimated technical target: {targetRange[0].toFixed(2)}–{targetRange[1].toFixed(2)} clo.
          </p>}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ScoreDisplay;
