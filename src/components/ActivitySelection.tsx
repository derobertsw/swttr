"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { ACTIVITIES } from "@/data/activities";
import {
  type ExertionLevel,
  EXERTION_DESCRIPTIONS,
  EXERTION_LABELS,
  EXERTION_LEVELS,
} from "@/lib/biophysics/exertion";

interface ActivitySelectionProps {
  value: string;
  onChange: (value: string) => void;
  exertion: ExertionLevel;
  onExertionChange: (value: ExertionLevel) => void;
}

type ActivityFocusGroup = "activity" | "shortcut";

function getActivityIndex(value: string) {
  const index = ACTIVITIES.findIndex((activity) => activity.value === value);
  return index >= 0 ? index : 0;
}

function getWrappedIndex(index: number, delta: number, length: number) {
  return (index + delta + length) % length;
}

const ActivitySelection = ({
  value,
  onChange,
  exertion,
  onExertionChange,
}: ActivitySelectionProps) => {
  const [api, setApi] = React.useState<CarouselApi>();
  const selectedIndex = getActivityIndex(value);
  const [current, setCurrent] = React.useState(selectedIndex);
  const onChangeRef = React.useRef(onChange);
  const valueRef = React.useRef(value);
  const activityButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const shortcutButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const exertionButtonRefs = React.useRef<Record<ExertionLevel, HTMLButtonElement | null>>({
    easy: null,
    moderate: null,
    hard: null,
  });
  const pendingActivityFocusRef = React.useRef<{ group: ActivityFocusGroup; index: number } | null>(null);
  const pendingExertionFocusRef = React.useRef<ExertionLevel | null>(null);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  React.useEffect(() => {
    if (!api) return;

    const onSelect = () => {
      const index = api.selectedScrollSnap();
      const nextActivity = ACTIVITIES[index];
      if (!nextActivity) return;

      setCurrent(index);

      const pendingActivityFocus = pendingActivityFocusRef.current;
      if (pendingActivityFocus?.index === index) {
        const target =
          pendingActivityFocus.group === "activity"
            ? activityButtonRefs.current[index]
            : shortcutButtonRefs.current[index];
        target?.focus();
        pendingActivityFocusRef.current = null;
      }

      if (nextActivity.value !== valueRef.current) {
        onChangeRef.current(nextActivity.value);
      }
    };

    api.on("select", onSelect);

    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  React.useEffect(() => {
    setCurrent(selectedIndex);

    if (!api) return;
    if (api.selectedScrollSnap() === selectedIndex) return;

    api.scrollTo(selectedIndex, true);
  }, [api, selectedIndex]);

  React.useEffect(() => {
    const pendingExertionFocus = pendingExertionFocusRef.current;
    if (!pendingExertionFocus || pendingExertionFocus !== exertion) return;

    exertionButtonRefs.current[exertion]?.focus();
    pendingExertionFocusRef.current = null;
  }, [exertion]);

  const focusActivityControl = (group: ActivityFocusGroup, index: number) => {
    const target =
      group === "activity"
        ? activityButtonRefs.current[index]
        : shortcutButtonRefs.current[index];
    target?.focus();
  };

  const selectActivity = (index: number, focusGroup?: ActivityFocusGroup) => {
    const nextActivity = ACTIVITIES[index];
    if (!nextActivity) return;

    if (focusGroup) {
      pendingActivityFocusRef.current = { group: focusGroup, index };
    }

    if (!api) {
      setCurrent(index);
      if (focusGroup) {
        focusActivityControl(focusGroup, index);
        pendingActivityFocusRef.current = null;
      }
      if (nextActivity.value !== valueRef.current) {
        onChangeRef.current(nextActivity.value);
      }
      return;
    }

    if (api.selectedScrollSnap() === index) {
      setCurrent(index);
      if (focusGroup) {
        focusActivityControl(focusGroup, index);
        pendingActivityFocusRef.current = null;
      }
      return;
    }

    api.scrollTo(index);
  };

  const handleActivityKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    group: ActivityFocusGroup
  ) => {
    let delta = 0;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      delta = 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      delta = -1;
    } else {
      return;
    }

    event.preventDefault();
    selectActivity(getWrappedIndex(index, delta, ACTIVITIES.length), group);
  };

  const handleExertionKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let delta = 0;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      delta = 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      delta = -1;
    } else {
      return;
    }

    event.preventDefault();
    const nextLevel = EXERTION_LEVELS[getWrappedIndex(index, delta, EXERTION_LEVELS.length)];
    pendingExertionFocusRef.current = nextLevel;
    onExertionChange(nextLevel);
  };

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="mb-1 flex justify-end px-1">
        <span className="text-xs font-semibold tracking-[0.14em] text-white/52">
          {current + 1}/{ACTIVITIES.length}
        </span>
      </div>
      <div role="radiogroup" aria-label="Activity">
        <Carousel
          className="w-full"
          aria-label="Activity carousel"
          opts={{ loop: true, startIndex: selectedIndex }}
          setApi={setApi}
        >
          <CarouselContent className="py-3">
            {ACTIVITIES.map((activity, index) => {
              const isSelected = index === current;
              return (
                <CarouselItem className="basis-[37%] sm:basis-1/3" key={activity.value}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={activity.name}
                    tabIndex={isSelected ? 0 : -1}
                    ref={(element) => {
                      activityButtonRefs.current[index] = element;
                    }}
                    className={cn(
                      "w-full cursor-pointer rounded-[1.35rem] border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800",
                      isSelected
                        ? "scale-110 border-white/55 bg-[linear-gradient(180deg,#ffffff_0%,#f4f7fc_100%)] text-slate-900 shadow-[0_18px_30px_rgba(7,13,22,0.28)]"
                        : "scale-[0.92] border-white/22 bg-white/[0.12] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] backdrop-blur-xl"
                    )}
                    onClick={() => {
                      if (isSelected) return;
                      selectActivity(index);
                    }}
                    onKeyDown={(event) => handleActivityKeyDown(event, index, "activity")}
                  >
                    <div
                      className={cn(
                        "flex flex-col items-center justify-center gap-2.5",
                        isSelected ? "h-40 px-5" : "h-32 px-5"
                      )}
                    >
                      <activity.icon
                        className={cn(
                          "transition-all duration-200",
                          isSelected
                            ? "size-10 text-slate-900"
                            : "size-8 text-white/72"
                        )}
                      />
                      <span
                        className={cn(
                          "text-center font-medium leading-[1.05] transition-all duration-200",
                          isSelected
                            ? "text-base text-slate-900"
                            : "text-sm text-white/78"
                        )}
                      >
                        {activity.cardLines.map((line) => (
                          <span className="block" key={`${activity.value}-${line}`}>
                            {line}
                          </span>
                        ))}
                      </span>
                    </div>
                  </button>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      </div>
      <div
        className="mt-1.5 flex justify-center gap-2"
        role="radiogroup"
        aria-label="Activity shortcuts"
      >
        {ACTIVITIES.map((activity, index) => (
          <button
            key={activity.value}
            type="button"
            role="radio"
            aria-checked={index === current}
            tabIndex={index === current ? 0 : -1}
            ref={(element) => {
              shortcutButtonRefs.current[index] = element;
            }}
            onClick={() => selectActivity(index)}
            onKeyDown={(event) => handleActivityKeyDown(event, index, "shortcut")}
            aria-label={`Select ${activity.name}`}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              index === current
                ? "w-6 bg-white"
                : "w-2 bg-white/35 hover:bg-white/50"
            )}
          />
        ))}
      </div>
      <div className="mt-4 rounded-[1.6rem] border border-white/25 bg-white/[0.1] p-4 shadow-[0_12px_30px_rgba(8,16,34,0.18)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/74">
          <span>Effort</span>
          <span className="rounded-full border border-white/30 bg-white/[0.14] px-3 py-1 text-[11px] text-white/90">
            {EXERTION_LABELS[exertion]}
          </span>
        </div>
        <p className="mt-3 text-sm text-white/72">
          {EXERTION_DESCRIPTIONS[exertion]}
        </p>
        <div className="mt-4 rounded-2xl border border-white/30 bg-white/[0.06] p-1.5">
          <div
            className="grid grid-cols-3 gap-1.5"
            role="radiogroup"
            aria-label="Effort level"
          >
            {EXERTION_LEVELS.map((level, index) => {
              const isSelected = level === exertion;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => onExertionChange(level)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  ref={(element) => {
                    exertionButtonRefs.current[level] = element;
                  }}
                  onKeyDown={(event) => handleExertionKeyDown(event, index)}
                  className={cn(
                    "rounded-xl border px-2 py-3 text-base font-semibold transition-all",
                    isSelected
                      ? "border-white/80 bg-white text-slate-900 shadow-[0_4px_10px_rgba(12,23,39,0.2)]"
                      : "border-transparent text-white/74 hover:border-white/20 hover:bg-white/[0.1]"
                  )}
                >
                  {EXERTION_LABELS[level]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivitySelection;
