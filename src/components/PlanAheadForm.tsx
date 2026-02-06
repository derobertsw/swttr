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
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationSuggestion } from "@/types/recommendations";
import { RefObject } from "react";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { FROSTED_INPUT, SUGGESTIONS_DROPDOWN } from "@/lib/styling";

interface PlanAheadFormProps {
  date: Date | undefined;
  time: string;
  location: string;
  locationQuery: string;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
  selectedLocation: LocationSuggestion | null;
  suggestionRef: RefObject<HTMLDivElement | null>;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  onLocationInputChange: (value: string) => void;
  onLocationFocus: () => void;
  onSelectLocation: (suggestion: LocationSuggestion) => void;
  onDismiss?: () => void;
}

export function PlanAheadForm({
  date,
  time,
  location,
  locationQuery,
  suggestions,
  showSuggestions,
  selectedLocation,
  suggestionRef,
  onDateChange,
  onTimeChange,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
  onDismiss,
}: PlanAheadFormProps) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <LocationAutocomplete
        label="Location"
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
        <label className="text-sm font-medium text-white/80">Date & Time</label>
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
                {date ? format(date, "MMM d, yyyy") : "Pick a date"}
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
          <Input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className={`h-12 w-28 sm:w-32 ${FROSTED_INPUT}`}
          />
        </div>
      </div>

    </div>
  );
}
