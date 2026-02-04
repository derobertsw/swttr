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
import { CalendarIcon, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocationSuggestion } from "@/types/recommendations";
import { RefObject } from "react";

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
}: PlanAheadFormProps) {
  return (
    <div className="flex flex-col gap-6 w-[300px]">
      <div className="flex flex-col gap-2">
        <label htmlFor="location" className="text-sm font-medium text-white/80">
          Location
        </label>
        <div className="relative" ref={suggestionRef}>
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
          <Input
            id="location"
            placeholder="Search for a city..."
            value={selectedLocation ? location : locationQuery}
            onChange={(e) => onLocationInputChange(e.target.value)}
            onFocus={onLocationFocus}
            className="pl-10 h-12 bg-white/15 backdrop-blur-sm border-white/40 text-white/70 placeholder:text-white/70"
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-background border rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)] z-50 max-h-60 overflow-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="w-full px-4 py-2.5 text-left hover:bg-muted/50 text-sm transition-colors"
                  onClick={() => onSelectLocation(suggestion)}
                >
                  <span className="font-medium">{suggestion.name}</span>
                  <span className="text-muted-foreground/65">
                    {suggestion.region ? `, ${suggestion.region}` : ""}, {suggestion.country}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-white/80">Date & Time</label>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "flex-1 justify-start text-left font-normal h-12 bg-white/15 backdrop-blur-sm border-white/40 text-white/70 hover:bg-white/25 hover:text-white",
                  !date && "text-white/50"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "MMM d, yyyy") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
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
            className="w-[120px] h-12 bg-white/15 backdrop-blur-sm border-white/40 text-white/70"
          />
        </div>
      </div>

    </div>
  );
}
