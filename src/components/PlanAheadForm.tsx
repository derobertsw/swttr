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
import { CalendarIcon, CalendarDays, Route, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationSuggestion } from "@/types/recommendations";
import { RefObject } from "react";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { FROSTED_INPUT, SUGGESTIONS_DROPDOWN } from "@/lib/styling";

interface PlanAheadFormProps {
  date: Date | undefined;
  time: string;
  durationDays: number;
  location: string;
  locationQuery: string;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
  selectedLocation: LocationSuggestion | null;
  suggestionRef: RefObject<HTMLDivElement | null>;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  onDurationDaysChange: (days: number) => void;
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

export function PlanAheadForm({
  date,
  time,
  durationDays,
  location,
  locationQuery,
  suggestions,
  showSuggestions,
  selectedLocation,
  suggestionRef,
  onDateChange,
  onTimeChange,
  onDurationDaysChange,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
  onDismiss,
}: PlanAheadFormProps) {
  const timeLabel = formatStartTimeLabel(time);
  const isMultiDay = durationDays > 1;
  const durationLabel = durationDays === 1 ? "1 day" : `${durationDays} days`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5 pb-28">
      <section className="rounded-xl border border-white/30 bg-white/10 p-3 backdrop-blur-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Trip Mode</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onDurationDaysChange(1)}
            className={cn(
              "rounded-lg px-3 py-2 text-left transition",
              !isMultiDay
                ? "border border-white/45 bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                : "border border-white/20 bg-white/5"
            )}
          >
            <p className="text-sm font-semibold text-white">Single Day</p>
            <p className="text-[11px] text-white/70">Focused one-day setup</p>
          </button>
          <button
            type="button"
            onClick={() => onDurationDaysChange(durationDays > 1 ? durationDays : 3)}
            className={cn(
              "rounded-lg px-3 py-2 text-left transition",
              isMultiDay
                ? "border border-white/45 bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                : "border border-white/20 bg-white/5"
            )}
          >
            <p className="text-sm font-semibold text-white">Multi Day</p>
            <p className="text-[11px] text-white/70">Daypart weather-aware</p>
          </button>
        </div>
      </section>

      <LocationAutocomplete
        label="2. Location"
        location={location}
        locationQuery={locationQuery}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        selectedLocation={selectedLocation}
        suggestionRef={suggestionRef}
        onLocationInputChange={onLocationInputChange}
        onLocationFocus={onLocationFocus}
        onSelectLocation={onSelectLocation}
        onDismiss={onDismiss}
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-white/80">3. Start</label>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  `flex-1 justify-start text-left font-normal h-12 ${FROSTED_INPUT} hover:bg-white/25 hover:text-white`,
                  !date && "text-white/50"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "MMM d, yyyy") : "Pick start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className={`w-auto p-0 rounded-xl ${SUGGESTIONS_DROPDOWN}`}>
              <Calendar
                mode="single"
                selected={date}
                onSelect={onDateChange}
                autoFocus
              />
            </PopoverContent>
          </Popover>
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
      </div>

      <section className="rounded-xl border border-white/30 bg-white/10 p-3.5 backdrop-blur-lg">
        <p className="text-sm font-medium text-white/80">4. Duration</p>
        <div className="mt-2 rounded-lg border border-white/25 bg-white/5 px-3 py-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onDurationDaysChange(Math.max(1, durationDays - 1))}
              className="size-8 rounded-md border border-white/25 text-white/85 transition hover:bg-white/10"
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
              className="size-8 rounded-md border border-white/25 text-white/85 transition hover:bg-white/10"
              aria-label="Increase duration"
            >
              +
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[1, 3, 5, 7].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onDurationDaysChange(days)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium transition",
                  durationDays === days
                    ? "border-white/60 bg-white/20 text-white"
                    : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                )}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      </section>

      <details className="rounded-xl border border-dashed border-white/30 bg-white/[0.06] p-3.5">
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
              className="rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-center"
            >
              <p className="text-xs font-semibold text-white/80">{label}</p>
              <p className="mt-1 text-[11px] text-white/60">Weather + layer delta</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
