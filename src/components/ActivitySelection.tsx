"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ACTIVITIES } from "@/data/activities";
import { arrowKeyTarget, SegmentedChoice } from "@/components/SegmentedChoice";
import {
  type ExertionLevel,
  EXERTION_DESCRIPTIONS,
  EXERTION_LABELS,
  EXERTION_LEVELS,
} from "@/lib/biophysics/exertion";

const EFFORT_OPTIONS = EXERTION_LEVELS.map((level) => ({ value: level, label: EXERTION_LABELS[level] }));

interface ActivitySelectionProps {
  value: string;
  onChange: (value: string) => void;
  exertion: ExertionLevel;
  onExertionChange: (value: ExertionLevel) => void;
}

/**
 * The activity and effort fields of the Gear up form. All six activities show
 * at once, as one radio group: Tab reaches the selected one, and the arrow
 * keys select and focus the next or previous one.
 */
const ActivitySelection = ({
  value,
  onChange,
  exertion,
  onExertionChange,
}: ActivitySelectionProps) => {
  const activityRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, ACTIVITIES.findIndex((activity) => activity.value === value));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = arrowKeyTarget(event.key, index, ACTIVITIES.length);
    if (target === null) return;
    event.preventDefault();
    activityRefs.current[target]?.focus();
    onChange(ACTIVITIES[target].value);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p id="activity-label" className="text-sm font-medium text-foreground">
          Activity
        </p>
        <div
          role="radiogroup"
          aria-labelledby="activity-label"
          // Two columns on phones, three where they fit.
          className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3"
        >
          {ACTIVITIES.map((activity, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={activity.value}
                ref={(element) => {
                  activityRefs.current[index] = element;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => {
                  if (!isSelected) onChange(activity.value);
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "flex min-h-18 flex-col items-center justify-center gap-1.5 rounded-control border border-input bg-card px-2 py-2.5 text-center text-sm font-medium leading-tight text-card-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  "aria-checked:border-primary aria-checked:bg-primary-soft aria-checked:font-semibold aria-checked:text-foreground aria-checked:inset-ring aria-checked:inset-ring-primary"
                )}
              >
                <activity.icon aria-hidden="true" className="size-7" />
                {activity.name}
              </button>
            );
          })}
        </div>
      </div>

      <SegmentedChoice
        label="Effort"
        options={EFFORT_OPTIONS}
        value={exertion}
        onChange={onExertionChange}
        description={EXERTION_DESCRIPTIONS[exertion]}
      />
    </div>
  );
};

export default ActivitySelection;
