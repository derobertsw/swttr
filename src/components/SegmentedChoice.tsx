"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";

/**
 * The index a radio group's arrow key moves to, wrapping at the ends, or null
 * for any other key. Right and Down go forward; Left and Up go back.
 */
export function arrowKeyTarget(key: string, index: number, length: number): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + length) % length;
  return null;
}

interface SegmentedChoiceProps<T extends string> {
  /** The visible label, which also names the group. */
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Shown under the choices and read with the group. */
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Classes for the row of choices, e.g. to wrap them into a grid on phones. */
  groupClassName?: string;
}

/**
 * A labeled row of mutually exclusive choices, as one radio group: Tab
 * reaches the selected choice, and the arrow keys select and focus the next
 * or previous one.
 */
export function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  description,
  disabled = false,
  className,
  groupClassName,
}: SegmentedChoiceProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const target = arrowKeyTarget(event.key, index, options.length);
    if (target === null) return;
    event.preventDefault();
    optionRefs.current[target]?.focus();
    onChange(options[target].value);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p id={labelId} className="text-sm font-medium text-foreground">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(segmentedGroupClassName, "auto-cols-fr grid-flow-col", groupClassName)}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => {
                if (!isSelected) onChange(option.value);
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={segmentedItemClassName}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
