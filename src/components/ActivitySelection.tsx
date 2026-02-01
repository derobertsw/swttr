"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
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
          {ACTIVITIES.map((activity, index) => (
            <CarouselItem className="basis-1/3" key={activity.value}>
              <Card
                className={cn(
                  "cursor-pointer transition-all duration-300 border-2",
                  index === current
                    ? "scale-100 border-primary shadow-lg"
                    : "scale-75 opacity-60 border-transparent"
                )}
                onClick={() => api?.scrollTo(index)}
              >
                <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
                  <activity.icon
                    className={cn(
                      "transition-all duration-300",
                      index === current ? "size-10" : "size-7"
                    )}
                  />
                  <span
                    className={cn(
                      "text-center font-medium transition-all duration-300",
                      index === current ? "text-base" : "text-xs"
                    )}
                  >
                    {activity.name}
                  </span>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
};

export default ActivitySelection;
