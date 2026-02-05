"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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

    const onSelect = () => {
      const index = api.selectedScrollSnap();
      setCurrent(index);
      onChange(ACTIVITIES[index].value);
    };

    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, initialIndex, onChange]);

  return (
    <div className="mx-auto w-full max-w-md">
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
                <Card
                  className={cn(
                    "cursor-pointer transition-all duration-200 border-2",
                    isSelected
                      ? "scale-110 border-gray-300/60 shadow-[0_5px_14px_rgba(0,0,0,0.17)] bg-white"
                      : "scale-[0.92] opacity-80 border-transparent shadow-none"
                  )}
                  onClick={() => api?.scrollTo(index)}
                >
                  <CardContent
                    className={cn(
                      "flex h-40 flex-col items-center justify-center gap-3",
                      isSelected ? "px-6" : "px-6"
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
                  </CardContent>
                </Card>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>
      {/* Pagination dots */}
      <div className="flex justify-center gap-2 mt-2">
        {ACTIVITIES.map((activity, index) => (
          <button
            key={activity.value}
            onClick={() => api?.scrollTo(index)}
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
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
