"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock3, Loader2, MapPin } from "lucide-react";
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
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { cn } from "@/lib/utils";

interface WeatherEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (lat: number, lon: number, datetime?: string) => Promise<void>;
  loading?: boolean;
}

function getDefaultTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  return `${hours}:00`;
}

function formatSelectedLocationName(
  location: { name: string; region?: string | null; country: string } | null
): string {
  if (!location) return "No location selected yet";
  return location.region
    ? `${location.name}, ${location.region}, ${location.country}`
    : `${location.name}, ${location.country}`;
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
  const selectedLocationLabel = formatSelectedLocationName(locationSearch.selectedLocation);
  const selectedTimeLabel = useMemo(() => {
    if (!useScheduledTime) return "Using current conditions (now)";
    if (!date) return "Choose a date and time";
    const timeSuffix = time ? ` at ${time}` : "";
    return `${format(date, "EEE, MMM d")}${timeSuffix}`;
  }, [date, time, useScheduledTime]);

  const canSubmit = locationSearch.selectedLocation !== null && !loading && (!useScheduledTime || !!date);

  const handleSubmit = async () => {
    if (!locationSearch.selectedLocation) return;

    const { latitude, longitude } = locationSearch.selectedLocation;

    let datetime: string | undefined;
    if (useScheduledTime && date) {
      const dateStr = format(date, "yyyy-MM-dd");
      datetime = `${dateStr}T${time}`;
    }

    await onSubmit(latitude, longitude, datetime);
    onOpenChange(false);
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
      <DrawerContent className="max-h-[84vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Update Weather</DrawerTitle>
          <DrawerDescription>
            Change location and optionally set forecast date/time.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selection Preview</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
              <MapPin className="size-3.5 text-slate-500" />
              {selectedLocationLabel}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-600">
              <Clock3 className="size-3.5 text-slate-500" />
              {selectedTimeLabel}
            </p>
          </div>

          <LocationAutocomplete
            id="weather-edit-location"
            label="Location"
            placeholder="Search for a city..."
            variant="default"
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
            <p className="-mt-1 text-xs text-slate-500">
              Select a city to enable weather update.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Forecast timing
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={resetToNow}
                className={cn(
                  "rounded-md px-2 py-2 text-xs font-medium transition-colors",
                  !useScheduledTime
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:bg-white/70"
                )}
              >
                Use now
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseScheduledTime(true);
                  setDate((prev) => prev ?? new Date());
                }}
                className={cn(
                  "rounded-md px-2 py-2 text-xs font-medium transition-colors",
                  useScheduledTime
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:bg-white/70"
                )}
              >
                Pick date & time
              </button>
            </div>
            {useScheduledTime && (
              <div className="mt-1 space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Date & Time
                </label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-10",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
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
                  <div className="w-28">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="h-10 tabular-nums"
                      aria-label="Time"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setQuickDate(0)}
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setQuickDate(1)}
                  >
                    Tomorrow
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={resetToNow}
                  >
                    Use now instead
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DrawerFooter className="border-t border-slate-200 bg-white/95">
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
              disabled={!canSubmit}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Apply Weather"
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
