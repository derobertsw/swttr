"use client";

import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, CalendarDays, Locate, Loader2, Route, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationSuggestion } from "@/types/recommendations";
import { RefObject, useEffect, useState } from "react";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { FROSTED_INPUT, SUGGESTIONS_DROPDOWN } from "@/lib/styling";
import { Capacitor } from "@capacitor/core";

interface PlanAheadFormProps {
  date: Date | undefined;
  time: string;
  durationDays: number;
  loading?: boolean;
  location: string;
  locationQuery: string;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
  selectedLocation: LocationSuggestion | null;
  isSearching?: boolean;
  suggestionRef: RefObject<HTMLDivElement | null>;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  onDurationDaysChange: (days: number) => void;
  onGoNow?: () => void;
  onLocationInputChange: (value: string) => void;
  onLocationFocus: () => void;
  onSelectLocation: (suggestion: LocationSuggestion) => void;
  onDismiss?: () => void;
}

function formatStartTimeLabel(time: string): string {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
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

export function PlanAheadForm({
  date,
  time,
  durationDays,
  loading = false,
  location,
  locationQuery,
  suggestions,
  showSuggestions,
  selectedLocation,
  isSearching,
  suggestionRef,
  onDateChange,
  onTimeChange,
  onDurationDaysChange,
  onGoNow,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
  onDismiss,
}: PlanAheadFormProps) {
  const [useNativeIOSDatePicker, setUseNativeIOSDatePicker] = useState(false);
  const timeLabel = formatStartTimeLabel(time);
  const isMultiDay = durationDays > 1;
  const durationLabel = durationDays === 1 ? "1 day" : `${durationDays} days`;
  const dateValue = date ? format(date, "yyyy-MM-dd") : "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
    const isIOSBrowser = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
    setUseNativeIOSDatePicker(isNativeIOS || isIOSBrowser);
  }, []);

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-5 pb-28">
      <section className="rounded-[1.6rem] border border-white/28 bg-white/[0.1] p-3.5 shadow-[0_12px_30px_rgba(8,16,34,0.16)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Trip Mode</p>
        <div className="mt-2.5 rounded-2xl border border-white/30 bg-white/[0.07] p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onDurationDaysChange(1)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-left transition-all",
                !isMultiDay
                  ? "bg-white text-slate-900 shadow-[0_4px_10px_rgba(12,23,39,0.22)]"
                  : "text-white/78 hover:bg-white/[0.08]"
              )}
            >
              <p className="text-sm font-semibold">Single Day</p>
              <p className={cn("text-[11px]", !isMultiDay ? "text-slate-600" : "text-white/64")}>Focused one-day setup</p>
            </button>
            <button
              type="button"
              onClick={() => onDurationDaysChange(durationDays > 1 ? durationDays : 3)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-left transition-all",
                isMultiDay
                  ? "bg-white text-slate-900 shadow-[0_4px_10px_rgba(12,23,39,0.22)]"
                  : "text-white/78 hover:bg-white/[0.08]"
              )}
            >
              <p className="text-sm font-semibold">Multi Day</p>
              <p className={cn("text-[11px]", isMultiDay ? "text-slate-600" : "text-white/64")}>Daypart weather-aware</p>
            </button>
          </div>
        </div>
      </section>

      {onGoNow && (
        <>
          <button
            type="button"
            disabled={loading}
            onClick={onGoNow}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/[0.14] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(8,16,34,0.12)] backdrop-blur-xl transition hover:bg-white/[0.22] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Locate className="size-4" />
            )}
            Go Now — Use Current Location
          </button>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/20" />
            <span className="text-xs font-medium text-white/50">or plan ahead</span>
            <div className="h-px flex-1 bg-white/20" />
          </div>
        </>
      )}

      <LocationAutocomplete
        label="2. Location"
        location={location}
        locationQuery={locationQuery}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        selectedLocation={selectedLocation}
        isSearching={isSearching}
        suggestionRef={suggestionRef}
        onLocationInputChange={onLocationInputChange}
        onLocationFocus={onLocationFocus}
        onSelectLocation={onSelectLocation}
        onDismiss={onDismiss}
      />

      <section className="flex flex-col gap-2 rounded-[1.6rem] border border-white/28 bg-white/[0.1] p-4 shadow-[0_12px_30px_rgba(8,16,34,0.14)] backdrop-blur-xl">
        <label className="text-sm font-medium text-white/80">3. Start</label>
        <div className="flex gap-2">
          {useNativeIOSDatePicker ? (
            <div className="relative flex-1">
              <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/75" />
              <Input
                type="date"
                value={dateValue}
                onChange={(event) => onDateChange(parseDateInputValue(event.target.value))}
                className={`h-12 pl-10 ${FROSTED_INPUT}`}
                aria-label="Start date"
              />
            </div>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    `h-12 flex-1 justify-start text-left font-normal ${FROSTED_INPUT} hover:bg-white/25 hover:text-white`,
                    !date && "text-white/50"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "MMM d, yyyy") : "Pick start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className={`w-auto rounded-xl p-0 ${SUGGESTIONS_DROPDOWN}`}>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={onDateChange}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          )}
          <div className="w-40 sm:w-44">
            <Input
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className={`h-12 tabular-nums ${FROSTED_INPUT}`}
              aria-label="Start time"
            />
          </div>
        </div>
        <p className="text-xs text-white/70">Start time: {timeLabel} (local)</p>
        <p className="text-xs text-white/65">
          Plan builder uses daytime forecast windows (6am-9pm) to avoid overnight bias.
        </p>
      </section>

      {isMultiDay && (
        <>
          <section className="rounded-[1.6rem] border border-white/28 bg-white/[0.1] p-3.5 shadow-[0_12px_30px_rgba(8,16,34,0.14)] backdrop-blur-xl">
            <p className="text-sm font-medium text-white/80">4. Duration</p>
            <div className="mt-2 rounded-xl border border-white/28 bg-white/[0.07] px-3 py-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onDurationDaysChange(Math.max(2, durationDays - 1))}
                  className="size-9 rounded-lg border border-white/30 text-white/90 transition hover:bg-white/[0.12]"
                  aria-label="Decrease duration"
                >
                  -
                </button>
                <div className="flex items-center gap-2 text-white/90">
                  <CalendarDays className="size-4" />
                  <span className="text-sm font-medium">{durationLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onDurationDaysChange(Math.min(7, durationDays + 1))}
                  className="size-9 rounded-lg border border-white/30 text-white/90 transition hover:bg-white/[0.12]"
                  aria-label="Increase duration"
                >
                  +
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[2, 3, 5, 7].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => onDurationDaysChange(days)}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-xs font-semibold transition",
                      durationDays === days
                        ? "border-white/65 bg-white/[0.22] text-white"
                        : "border-white/24 bg-white/[0.06] text-white/72 hover:bg-white/[0.11]"
                    )}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
          </section>

          <details className="rounded-[1.6rem] border border-dashed border-white/32 bg-white/[0.08] p-3.5 backdrop-blur-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between text-white/80">
              <span className="flex items-center gap-2">
                <Route className="size-4" />
                <span className="text-sm font-medium">5. Multi-day preview</span>
              </span>
              <ChevronDown className="size-4 opacity-70" />
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: Math.min(durationDays, 5) }, (_, index) => `Day ${index + 1}`).map((label) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/24 bg-white/[0.08] px-2 py-2 text-center"
                >
                  <p className="text-xs font-semibold text-white/80">{label}</p>
                  <p className="mt-1 text-[11px] text-white/60">Weather + layer delta</p>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
