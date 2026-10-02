"use client";

import { type FormEvent, type Ref, type RefObject, useEffect, useRef, useSyncExternalStore } from "react";
import { format } from "date-fns";
import { CalendarIcon, Minus, Plus } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { fieldClassName, Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import ActivitySelection from "@/components/ActivitySelection";
import { DeviceLocationButton } from "@/components/DeviceLocationButton";
import { FieldError } from "@/components/FieldError";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { SegmentedChoice } from "@/components/SegmentedChoice";
import { ACTIVITIES } from "@/data/activities";
import type { DeviceLocationStatus } from "@/hooks/useDeviceLocation";
import type { ExertionLevel } from "@/lib/biophysics/exertion";
import type { InputMode } from "@/lib/gearUp";
import { toPickerDate, zonedNow } from "@/lib/timeZones";
import { cn } from "@/lib/utils";
import type { LocationSuggestion } from "@/types/recommendations";

const WHEN_OPTIONS = [
  { value: "now", label: "Now" },
  { value: "later", label: "Later" },
] as const;

const LENGTH_OPTIONS = [
  { value: "one", label: "One day" },
  { value: "several", label: "Several days" },
] as const;

const MIN_PLAN_DAYS = 2;
const MAX_PLAN_DAYS = 7;

interface GearUpFormProps {
  formRef: Ref<HTMLFormElement>;
  activity: string;
  onActivityChange: (activity: string) => void;
  /** Hides the activity choices until the saved default activity is known. */
  activityInitializing: boolean;
  exertion: ExertionLevel;
  onExertionChange: (exertion: ExertionLevel) => void;
  location: string;
  locationQuery: string;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
  selectedLocation: LocationSuggestion | null;
  isSearching: boolean;
  suggestionRef: RefObject<HTMLDivElement | null>;
  onLocationInputChange: (value: string) => void;
  onLocationFocus: () => void;
  onSelectLocation: (suggestion: LocationSuggestion) => void;
  onDismissSuggestions: () => void;
  /** Where the request for the device's location stands. */
  locationStatus: DeviceLocationStatus;
  onUseMyLocation: () => void;
  onCancelLocating: () => void;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  time: string;
  onTimeChange: (time: string) => void;
  durationDays: number;
  onDurationDaysChange: (days: number) => void;
  /** Set once the form was submitted with fields left empty; each empty field then says it's needed. */
  showFieldErrors: boolean;
  /** Why the chosen start date can't be used, from the last request, like dates past the end of the forecast. */
  startDateError?: string | null;
  loading: boolean;
  /** Requests advice for the outing. The page checks the fields first. */
  onSubmit: () => void;
}

// Platform detection never changes during a session, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};

function shouldUseNativeIOSDatePicker(): boolean {
  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  const isIOSBrowser = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  return isNativeIOS || isIOSBrowser;
}

function parseDateInputValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return undefined;

  const date = new Date();
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

/**
 * The Gear up form: activity, effort, where and when, and one button that
 * asks for layers now, layers for a later day, or a plan for several days.
 * Later shows the date, start time and number of days, all on the place's
 * clock.
 */
export function GearUpForm({
  formRef,
  activity,
  onActivityChange,
  activityInitializing,
  exertion,
  onExertionChange,
  location,
  locationQuery,
  suggestions,
  showSuggestions,
  selectedLocation,
  isSearching,
  suggestionRef,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
  onDismissSuggestions,
  locationStatus,
  onUseMyLocation,
  onCancelLocating,
  inputMode,
  onInputModeChange,
  date,
  onDateChange,
  time,
  onTimeChange,
  durationDays,
  onDurationDaysChange,
  showFieldErrors,
  startDateError,
  loading,
  onSubmit,
}: GearUpFormProps) {
  const useNativeIOSDatePicker = useSyncExternalStore(
    subscribeToNothing,
    shouldUseNativeIOSDatePicker,
    () => false
  );
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const later = inputMode === "later";
  const severalDays = later && durationDays > 1;

  const placeError = showFieldErrors && !selectedLocation ? "Search for a place, or use your location." : undefined;
  const dateError = (showFieldErrors && !date ? "Choose a start date." : undefined) ?? startDateError ?? undefined;
  const timeError = showFieldErrors && !time ? "Enter a start time." : undefined;

  // A start date the request turned down takes focus, so its error is announced.
  useEffect(() => {
    if (startDateError) (dateInputRef.current ?? dateButtonRef.current)?.focus();
  }, [startDateError]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const submitLabel = severalDays
    ? loading ? "Building your plan…" : "Build my plan"
    : loading ? "Getting your layers…" : "See my layers";

  return (
    <form
      ref={formRef}
      noValidate
      aria-label="Outing"
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-6"
    >
      {activityInitializing ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <p className="text-sm font-medium text-foreground">Activity</p>
          <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
            {ACTIVITIES.map((item) => (
              <Skeleton key={item.value} className="h-18 rounded-control" />
            ))}
          </div>
        </div>
      ) : (
        <ActivitySelection
          value={activity}
          onChange={onActivityChange}
          exertion={exertion}
          onExertionChange={onExertionChange}
        />
      )}

      <div className="flex flex-col gap-3">
        <LocationAutocomplete
          label="Where?"
          placeholder="Search for a town or mountain"
          location={location}
          locationQuery={locationQuery}
          suggestions={suggestions}
          showSuggestions={showSuggestions}
          selectedLocation={selectedLocation}
          isSearching={isSearching}
          error={placeError}
          suggestionRef={suggestionRef}
          onLocationInputChange={onLocationInputChange}
          onLocationFocus={onLocationFocus}
          onSelectLocation={onSelectLocation}
          onDismiss={onDismissSuggestions}
        />
        <DeviceLocationButton
          label="Use my location"
          status={locationStatus}
          disabled={loading}
          onLocate={onUseMyLocation}
          onCancel={onCancelLocating}
        />
      </div>

      <div className="flex flex-col gap-4">
        <SegmentedChoice label="When?" options={WHEN_OPTIONS} value={inputMode} onChange={onInputModeChange} />

        {later && (
          <>
            <div className="flex flex-col gap-3 min-[375px]:flex-row">
              <div className="flex flex-col gap-2 min-[375px]:flex-1">
                {useNativeIOSDatePicker ? (
                  <>
                    <label htmlFor="start-date" className="text-sm font-medium text-foreground">
                      Start date
                    </label>
                    <div className="relative">
                      <CalendarIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={dateInputRef}
                        id="start-date"
                        type="date"
                        value={date ? format(date, "yyyy-MM-dd") : ""}
                        onChange={(event) => onDateChange(parseDateInputValue(event.target.value))}
                        className="pl-10"
                        aria-invalid={dateError ? true : undefined}
                        aria-describedby={dateError ? "start-date-error" : undefined}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p id="start-date-label" className="text-sm font-medium text-foreground">
                      Start date
                    </p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          ref={dateButtonRef}
                          id="start-date"
                          type="button"
                          variant="outline"
                          // Read as "Start date, Oct 8, 2026", or "Start date, Pick a date".
                          aria-labelledby="start-date-label start-date"
                          aria-invalid={dateError ? true : undefined}
                          aria-describedby={dateError ? "start-date-error" : undefined}
                          className={cn(fieldClassName, "justify-start text-left font-normal", !date && "text-muted-foreground")}
                        >
                          <CalendarIcon aria-hidden="true" className="text-muted-foreground" />
                          {date ? format(date, "MMM d, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={onDateChange}
                          // Today at the place, which may not be the device's today.
                          today={toPickerDate(zonedNow(selectedLocation?.timeZone).slice(0, 10))}
                          autoFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2 min-[375px]:w-40">
                <label htmlFor="start-time" className="text-sm font-medium text-foreground">
                  Start time
                </label>
                <Input
                  id="start-time"
                  type="time"
                  value={time}
                  onChange={(event) => onTimeChange(event.target.value)}
                  className="tabular-nums"
                  aria-invalid={timeError ? true : undefined}
                  aria-describedby={timeError ? "start-time-error" : undefined}
                />
              </div>
            </div>
            {dateError && <FieldError id="start-date-error">{dateError}</FieldError>}
            {timeError && <FieldError id="start-time-error">{timeError}</FieldError>}

            <SegmentedChoice
              label="How long?"
              options={LENGTH_OPTIONS}
              value={severalDays ? "several" : "one"}
              onChange={(length) => onDurationDaysChange(length === "one" ? 1 : 3)}
            />

            {severalDays && (
              <DaysStepper days={durationDays} onChange={onDurationDaysChange} />
            )}

            <p className="text-sm text-muted-foreground">
              {severalDays
                ? "Each day's layers use the forecast from 6 am to 9 pm. The first day starts at your start time."
                : "Layers use the forecast for the hour you start."}{" "}
              Dates and times are local to the place.
            </p>
          </>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={loading}
        // Waits for a requested location, which becomes the place.
        disabled={locationStatus === "locating"}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

/** How many days a plan covers, from two to seven. */
function DaysStepper({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const atMin = days <= MIN_PLAN_DAYS;
  const atMax = days >= MAX_PLAN_DAYS;
  // At a limit the button stays focusable and does nothing, so focus isn't lost.
  const limitClassName = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2">
      <p id="plan-days-label" className="text-sm font-medium text-foreground">
        Number of days
      </p>
      <div role="group" aria-labelledby="plan-days-label" className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Fewer days"
          aria-disabled={atMin || undefined}
          className={limitClassName}
          onClick={() => !atMin && onChange(days - 1)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <output aria-live="polite" className="min-w-16 text-center text-base font-semibold tabular-nums text-foreground">
          {days} days
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="More days"
          aria-disabled={atMax || undefined}
          className={limitClassName}
          onClick={() => !atMax && onChange(days + 1)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
