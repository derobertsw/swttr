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
  EXERTION_LABELS,
  EXERTION_DESCRIPTIONS,
  EXERTION_LEVELS,
} from "@/lib/biophysics/exertion";

interface ActivitySelectionProps {
  value: string;
  onChange: (value: string) => void;
  exertion: ExertionLevel;
  onExertionChange: (value: ExertionLevel) => void;
}

const ActivitySelection = ({
  value,
  onChange,
  exertion,
  onExertionChange,
}: ActivitySelectionProps) => {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [hideDots, setHideDots] = React.useState(false);
  const isPointerDownRef = React.useRef(false);
  const didScrollRef = React.useRef(false);

  // Find initial index based on value prop (only used for initial render)
  const [initialIndex] = React.useState(() =>
    ACTIVITIES.findIndex((a) => a.value === value)
  );

  React.useEffect(() => {
    if (!api) return;

    // Set initial position
    if (initialIndex >= 0) {
      api.scrollTo(initialIndex, true);
    }

    setCurrent(api.selectedScrollSnap());

    const onPointerDown = () => {
      isPointerDownRef.current = true;
      didScrollRef.current = false;
    };

    const onPointerUp = () => {
      if (didScrollRef.current) {
        setHideDots(true);
      }
      isPointerDownRef.current = false;
      didScrollRef.current = false;
    };

    const onScroll = () => {
      if (isPointerDownRef.current) {
        didScrollRef.current = true;
      }
    };

    const onSelect = () => {
      const index = api.selectedScrollSnap();
      setCurrent(index);
      onChange(ACTIVITIES[index].value);
    };

    api.on("pointerDown", onPointerDown);
    api.on("pointerUp", onPointerUp);
    api.on("scroll", onScroll);
    api.on("select", onSelect);
    return () => {
      api.off("pointerDown", onPointerDown);
      api.off("pointerUp", onPointerUp);
      api.off("scroll", onScroll);
      api.off("select", onSelect);
    };
  }, [api, initialIndex, onChange]);

  React.useEffect(() => {
    if (!api) return;
    const onFocus = () => {
      api.scrollTo(current);
    };
    window.addEventListener("focusActivityCarousel", onFocus);
    return () => window.removeEventListener("focusActivityCarousel", onFocus);
  }, [api, current]);

  return (
    <div className="mx-auto w-full max-w-[420px]" role="radiogroup" aria-label="Activity">
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] uppercase tracking-[0.18em] text-white/62">
        <span>Swipe or tap to select</span>
        <span>{current + 1} / {ACTIVITIES.length}</span>
      </div>
      <Carousel
        className="w-full"
        opts={{ loop: true, startIndex: initialIndex >= 0 ? initialIndex : 0 }}
        setApi={setApi}
      >
        <CarouselContent className="py-5">
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
                  className={cn(
                    "w-full cursor-pointer rounded-[1.35rem] border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800",
                    isSelected
                      ? "scale-110 border-white/55 bg-[linear-gradient(180deg,#ffffff_0%,#f4f7fc_100%)] text-slate-900 shadow-[0_18px_30px_rgba(7,13,22,0.28)]"
                      : "scale-[0.92] border-white/22 bg-white/[0.12] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] backdrop-blur-xl"
                  )}
                  onClick={() => {
                    if (isSelected) return;
                    setCurrent(index);
                    onChange(ACTIVITIES[index].value);
                    api?.scrollTo(index);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      api?.scrollNext();
                    }
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      api?.scrollPrev();
                    }
                  }}
                >
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-3",
                      isSelected ? "h-44 px-6" : "h-36 px-6"
                    )}
                  >
                    <activity.icon
                      className={cn(
                        "transition-all duration-200",
                        isSelected
                          ? "size-12 text-slate-900"
                          : "size-9 text-white/72"
                      )}
                    />
                    <span
                      className={cn(
                        "text-center font-medium transition-all duration-200",
                        isSelected ? "text-base text-slate-900" : "text-sm text-white/78"
                      )}
                    >
                      {activity.name}
                    </span>
                  </div>
                </button>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>
      {/* Pagination dots */}
      <div className={cn("mt-1 flex justify-center gap-2 opacity-75 transition-opacity", hideDots && "opacity-0")}>
        {ACTIVITIES.map((activity, index) => (
          <button
            key={activity.value}
            onClick={() => api?.scrollTo(index)}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all duration-300",
              index === current
                ? "bg-white"
                : "bg-white/35"
            )}
            aria-label={`Select ${activity.name}`}
          />
        ))}
      </div>
      <div className="mt-7 rounded-[1.6rem] border border-white/25 bg-white/[0.1] p-4 shadow-[0_12px_30px_rgba(8,16,34,0.18)] backdrop-blur-xl">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/74">
          <span>2. Exertion</span>
          <span className="rounded-full border border-white/30 bg-white/[0.16] px-2.5 py-0.5 text-[11px] text-white/90">
            {EXERTION_LABELS[exertion]}
          </span>
        </div>
        <p className="mt-1 text-xs text-white/68">{EXERTION_DESCRIPTIONS[exertion]}</p>
        <div className="mt-3 rounded-2xl border border-white/30 bg-white/[0.06] p-1.5">
          <div
            className="grid grid-cols-3 gap-1.5"
            role="radiogroup"
            aria-label="Exertion level"
          >
            {EXERTION_LEVELS.map((level) => {
              const isSelected = level === exertion;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => onExertionChange(level)}
                  role="radio"
                  aria-checked={isSelected}
                  className={cn(
                    "rounded-xl px-2 py-2 text-sm font-semibold transition-all",
                    isSelected
                      ? "bg-white text-slate-900 shadow-[0_4px_10px_rgba(12,23,39,0.2)]"
                      : "text-white/74 hover:bg-white/[0.1]"
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
