"use client";

import { useState } from "react";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const PlanAhead = () => {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [location, setLocation] = useState("");

  return (
    <PageLayout>
      <h2 className="text-2xl font-semibold">Plan Ahead</h2>
      <p className="text-gray-600">Select a date and location to see the weather forecast.</p>

      <div className="flex flex-col gap-4 w-[300px]">
        <div className="flex flex-col gap-2">
          <label htmlFor="location" className="text-sm font-medium">Location</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="location"
              placeholder="Enter city or zip code"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : "Pick a date"}
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
        </div>

        <Button disabled={!date || !location}>
          Get Forecast
        </Button>
      </div>
    </PageLayout>
  );
};

export default PlanAhead;
