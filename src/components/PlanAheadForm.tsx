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
  onSwitchToManual: () => void;
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
  onSwitchToManual,
}: PlanAheadFormProps) {
  return (
    <div className="flex flex-col gap-6 w-[300px]">
      <div className="flex flex-col gap-2">
        <label htmlFor="location" className="text-sm font-medium">
          Location
        </label>
        <div className="relative" ref={suggestionRef}>
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
          <Input
            id="location"
            placeholder="Search for a city..."
            value={selectedLocation ? location : locationQuery}
            onChange={(e) => onLocationInputChange(e.target.value)}
            onFocus={onLocationFocus}
            className="pl-10"
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-60 overflow-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm"
                  onClick={() => onSelectLocation(suggestion)}
                >
                  <span className="font-medium">{suggestion.name}</span>
                  <span className="text-gray-500">
                    {suggestion.region ? `, ${suggestion.region}` : ""}, {suggestion.country}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Date & Time</label>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "flex-1 justify-start text-left font-normal",
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
                onSelect={onDateChange}
                autoFocus
              />
            </PopoverContent>
          </Popover>
          <Input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-[110px]"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onSwitchToManual}>
          Manual Input
        </Button>
      </div>
    </div>
  );
}
