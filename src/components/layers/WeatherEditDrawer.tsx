"use client";

import { useState } from "react";
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
import { formatLocationName, useLocationSearch } from "@/hooks/useLocationSearch";
import { addDaysToDateString } from "@/lib/forecastRange";
import { toPickerDate, zonedNow } from "@/lib/timeZones";
import { cn } from "@/lib/utils";
import type { LocationSuggestion } from "@/types/recommendations";

interface WeatherEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true once the weather is updated; the drawer stays open otherwise. */
  onSubmit: (location: LocationSuggestion, localDateTime?: string) => Promise<boolean>;
  loading?: boolean;
}

/** A date picked on the calendar, or a shortcut's days from today at the place. */
type ForecastDay = { date: Date } | { daysFromToday: number };

export function WeatherEditDrawer({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
}: WeatherEditDrawerProps) {
  const locationSearch = useLocationSearch();
  const [day, setDay] = useState<ForecastDay | null>(null);
  // Null until a time is entered, which means the current hour at the place.
  const [chosenTime, setChosenTime] = useState<string | null>(null);
  const [useScheduledTime, setUseScheduledTime] = useState(false);

  // Shortcuts and the default time read the place's clock, even when the place
  // is picked after them. Until there's a place, they read the device's.
  const readClockThere = () => {
    const nowThere = zonedNow(locationSearch.selectedLocation?.timeZone);
    const todayThere = nowThere.slice(0, 10);
    return {
      todayThere,
      date: day
        ? "date" in day ? day.date : toPickerDate(addDaysToDateString(todayThere, day.daysFromToday))
        : undefined,
      time: chosenTime ?? `${nowThere.slice(11, 13)}:00`,
    };
  };
  const { todayThere, date, time } = readClockThere();

  const selectedLocationLabel = locationSearch.selectedLocation
    ? formatLocationName(locationSearch.selectedLocation)
    : "No location selected yet";
  const selectedTimeLabel = !useScheduledTime
    ? "Using current conditions (now)"
    : date
      ? `${format(date, "EEE, MMM d")}${time ? ` at ${time}` : ""}`
      : "Choose a date and time";

  const canSubmit = locationSearch.selectedLocation !== null && !loading && (!useScheduledTime || !!date);

  const handleSubmit = async () => {
    if (!locationSearch.selectedLocation) return;

    // Local time at the location, wherever the device is. The clock is read
    // again, since the drawer may have stayed open past the hour or midnight there.
    let localDateTime: string | undefined;
    const choice = readClockThere();
    if (useScheduledTime && choice.date) {
      localDateTime = `${format(choice.date, "yyyy-MM-dd")}T${choice.time}`;
    }

    if (await onSubmit(locationSearch.selectedLocation, localDateTime)) {
      onOpenChange(false);
    }
  };

  const resetToNow = () => {
    setUseScheduledTime(false);
    setDay(null);
    setChosenTime(null);
  };

  const setQuickDate = (daysFromToday: number) => {
    setUseScheduledTime(true);
    setDay({ daysFromToday });
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
                  setDay((prev) => prev ?? { daysFromToday: 0 });
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
                <p className="text-xs text-slate-500">Local time at the location.</p>
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
                        onSelect={(picked) => setDay(picked ? { date: picked } : null)}
                        today={toPickerDate(todayThere)}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <div className="w-28">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setChosenTime(e.target.value)}
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
