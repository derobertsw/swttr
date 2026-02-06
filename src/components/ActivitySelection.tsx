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

interface ActivitySelectionProps {
  value: string;
  onChange: (value: string) => void;
}

const ActivitySelection = ({ value, onChange }: ActivitySelectionProps) => {
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
    <div className="mx-auto w-full max-w-md" role="radiogroup" aria-label="Activity">
      <Carousel
        className="w-full"
        opts={{ loop: true, startIndex: initialIndex >= 0 ? initialIndex : 0 }}
        setApi={setApi}
      >
        <CarouselContent className="py-6">
          {ACTIVITIES.map((activity, index) => {
            const isSelected = index === current;
            return (
              <CarouselItem className="basis-1/3" key={activity.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={activity.name}
                  tabIndex={isSelected ? 0 : -1}
                  className={cn(
                    "w-full rounded-xl border-2 bg-card text-card-foreground cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/85 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800",
                    isSelected
                      ? "scale-110 border-gray-300/60 shadow-[0_5px_14px_rgba(0,0,0,0.17)] bg-white"
                      : "scale-[0.92] opacity-80 border-transparent shadow-none"
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
                          ? "size-12 text-primary"
                          : "size-9 text-muted-foreground/60"
                      )}
                    />
                    <span
                      className={cn(
                        "text-center font-medium transition-all duration-200",
                        isSelected ? "text-base" : "text-sm text-muted-foreground"
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
      <div className={cn("flex justify-center gap-2 mt-1 opacity-75 transition-opacity", hideDots && "opacity-0")}>
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
    </div>
  );
};

export default ActivitySelection;
