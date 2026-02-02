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
}

/**
 * Circular badge showing ensemble thermal score with explanatory popover
 * Color coded: green (80+), yellow (60-79), red (<60)
 */
const ScoreDisplay = ({ score, size = "md", className }: ScoreDisplayProps) => {
  const roundedScore = Math.round(score);

  const getScoreColor = () => {
    if (roundedScore >= 80) return "bg-green-100 text-green-800 border-green-300";
    if (roundedScore >= 60) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    return "bg-red-100 text-red-800 border-red-300";
  };

  const getScoreLabel = () => {
    if (roundedScore >= 80) return "Excellent";
    if (roundedScore >= 60) return "Good";
    return "Needs adjustment";
  };

  const sizeClasses = {
    sm: "size-8 text-xs",
    md: "size-10 text-sm",
    lg: "size-12 text-base",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded-full border-2 flex items-center justify-center font-semibold cursor-help transition-transform hover:scale-105",
            getScoreColor(),
            sizeClasses[size],
            className
          )}
        >
          {roundedScore}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverHeader>
          <PopoverTitle>Thermal Comfort Score</PopoverTitle>
          <PopoverDescription>
            {roundedScore}/100 — {getScoreLabel()}
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 space-y-2 text-xs">
          <p>
            This score estimates how well your layers match the conditions based on
            biophysics research (ISO 11079, USARIEM).
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-green-500" />
              <span>80+ Excellent thermal balance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-yellow-500" />
              <span>60-79 Good, minor adjustments</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-red-500" />
              <span>&lt;60 Review layer recommendations</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ScoreDisplay;
