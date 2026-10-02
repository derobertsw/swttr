"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock3, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { formatLocationName, useLocationSearch } from "@/hooks/useLocationSearch";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import type { LocationSuggestion } from "@/types/recommendations";

interface WeatherEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true once the weather is updated; the drawer stays open otherwise. */
  onSubmit: (location: LocationSuggestion, localDateTime?: string) => Promise<boolean>;
  loading?: boolean;
}

function getDefaultTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  return `${hours}:00`;
}

export function WeatherEditDrawer({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
}: WeatherEditDrawerProps) {
  const locationSearch = useLocationSearch();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState(getDefaultTime);
  const [useScheduledTime, setUseScheduledTime] = useState(false);
  const selectedLocationLabel = locationSearch.selectedLocation
    ? formatLocationName(locationSearch.selectedLocation)
    : "No location selected yet";
  const selectedTimeLabel = useMemo(() => {
    if (!useScheduledTime) return "Using current conditions (now)";
    if (!date) return "Choose a date and time";
    const timeSuffix = time ? ` at ${time}` : "";
    return `${format(date, "EEE, MMM d")}${timeSuffix}`;
  }, [date, time, useScheduledTime]);

  const canSubmit = locationSearch.selectedLocation !== null && !loading && (!useScheduledTime || !!date);

  const handleSubmit = async () => {
    if (!locationSearch.selectedLocation) return;

    // Local time at the location, wherever the device is.
    let localDateTime: string | undefined;
    if (useScheduledTime && date) {
      const dateStr = format(date, "yyyy-MM-dd");
      localDateTime = `${dateStr}T${time}`;
    }

    if (await onSubmit(locationSearch.selectedLocation, localDateTime)) {
      onOpenChange(false);
    }
  };

  const resetToNow = () => {
    setUseScheduledTime(false);
    setDate(undefined);
    setTime(getDefaultTime());
  };

  const setQuickDate = (offsetDays: number) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + offsetDays);
    setUseScheduledTime(true);
    setDate(nextDate);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="pb-2">
          <DrawerTitle>Update Weather</DrawerTitle>
          <DrawerDescription>
            Change location and optionally set forecast date/time.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-4 pb-4">
          <div className="rounded-control bg-muted px-3 py-2.5">
            <p className="text-sm font-medium text-muted-foreground">Selection Preview</p>
            <p className="mt-1 flex items-center gap-1.5 text-base font-medium text-foreground">
              <MapPin className="size-4 text-muted-foreground" />
              {selectedLocationLabel}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock3 className="size-4" />
              {selectedTimeLabel}
            </p>
          </div>

          <LocationAutocomplete
            id="weather-edit-location"
            label="Location"
            placeholder="Search for a city..."
            location={locationSearch.location}
            locationQuery={locationSearch.locationQuery}
            suggestions={locationSearch.suggestions}
            showSuggestions={locationSearch.showSuggestions}
            selectedLocation={locationSearch.selectedLocation}
            isSearching={locationSearch.isSearching}
            suggestionRef={locationSearch.suggestionRef}
            onLocationInputChange={locationSearch.handleLocationInputChange}
            onLocationFocus={() =>
              locationSearch.suggestions.length > 0 &&
              locationSearch.setShowSuggestions(true)
            }
            onSelectLocation={locationSearch.handleSelectLocation}
            onDismiss={locationSearch.dismiss}
          />
          {!locationSearch.selectedLocation && (
            <p className="-mt-2 text-sm text-muted-foreground">
              Select a city to enable weather update.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <p id="weather-edit-timing" className="text-sm font-medium text-foreground">
              Forecast timing
            </p>
            <div
              role="group"
              aria-labelledby="weather-edit-timing"
              className={cn(segmentedGroupClassName, "grid-cols-2")}
            >
              <button
                type="button"
                aria-pressed={!useScheduledTime}
                onClick={resetToNow}
                className={segmentedItemClassName}
              >
                Use now
              </button>
              <button
                type="button"
                aria-pressed={useScheduledTime}
                onClick={() => {
                  setUseScheduledTime(true);
                  setDate((prev) => prev ?? new Date());
                }}
                className={segmentedItemClassName}
              >
                Pick date & time
              </button>
            </div>
            {useScheduledTime && (
              <div className="mt-1 space-y-2">
                <p className="text-sm font-medium text-foreground">Date & Time</p>
                <p className="text-sm text-muted-foreground">Local time at the location.</p>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left text-base font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="text-muted-foreground" />
                        {date ? format(date, "MMM d, yyyy") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <div className="w-36 shrink-0">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="tabular-nums"
                      aria-label="Time"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setQuickDate(0)}
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setQuickDate(1)}
                  >
                    Tomorrow
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={resetToNow}
                  >
                    Use now instead
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DrawerBody>

        <DrawerFooter>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit && !loading}
              loading={loading}
              className="flex-1"
            >
              {loading ? "Updating..." : "Apply Weather"}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
