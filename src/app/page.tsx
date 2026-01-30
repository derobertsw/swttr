"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout";
import ActivitySelection from "@/components/ActivitySelection";
import WeatherSelection from "@/components/WeatherSelection";
import LayerDisplay from "@/components/LayerDisplay";
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
import { toast } from "sonner";
import layerRecommendations from "@/data/layerRecommendations.json";
import { UserItemMapping } from "@/types/wardrobe";

interface LayerSet {
  base: string[];
  mid?: string[];
  outer: string[];
}

interface Recommendation {
  torso: LayerSet;
  legs: LayerSet;
  hands: LayerSet;
  headNeck: LayerSet;
}

const getTempRange = (temp: number): string => {
  if (temp < -15) return "-20--15";
  if (temp < -10) return "-15--10";
  if (temp < -5) return "-10--5";
  if (temp < 0) return "-5-0";
  if (temp < 5) return "0-5";
  if (temp < 10) return "5-10";
  if (temp < 15) return "10-15";
  if (temp < 20) return "15-20";
  if (temp < 25) return "20-25";
  if (temp < 30) return "25-30";
  if (temp < 35) return "30-35";
  if (temp < 40) return "35-40";
  return "40+";
};

type InputMode = "manual" | "planAhead";

interface LocationSuggestion {
  id: number;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
}

const Home = () => {
  const [activity, setActivity] = useState("");
  const [temperature, setTemperature] = useState(50);
  const [windspeed, setWindspeed] = useState(10);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null,
  );
  const [showResults, setShowResults] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("12:00");
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [itemMappings, setItemMappings] = useState<Map<string, string>>(new Map());

  const loadItemMappingsFromLocalStorage = (): Map<string, string> => {
    try {
      const stored = localStorage.getItem("swttr-item-mappings");
      if (stored) {
        const data = JSON.parse(stored) as Array<{
          bodyPart: string;
          layerType: string;
          standardOption: string;
          customName: string;
        }>;
        const map = new Map<string, string>();
        for (const m of data) {
          const key = `${m.bodyPart}:${m.layerType}:${m.standardOption}`;
          map.set(key, m.customName);
        }
        return map;
      }
    } catch (err) {
      console.error("Failed to load from localStorage:", err);
    }
    return new Map();
  };

  // Load user ID and item mappings on mount
  useEffect(() => {
    const storedUserId = localStorage.getItem("swttr-user-id");
    if (storedUserId) {
      setUserId(storedUserId);
    }
    // Load item mappings immediately from localStorage
    setItemMappings(loadItemMappingsFromLocalStorage());
  }, []);

  // Refetch item mappings when window regains focus (user might have updated on wardrobe page)
  useEffect(() => {
    const handleFocus = () => {
      setItemMappings(loadItemMappingsFromLocalStorage());
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (locationQuery.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(locationQuery)}`);
        const data = await response.json();
        setSuggestions(data.results || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [locationQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [loading, setLoading] = useState(false);

  const handleSelectLocation = (suggestion: LocationSuggestion) => {
    setSelectedLocation(suggestion);
    setLocation(suggestion.region
      ? `${suggestion.name}, ${suggestion.region}, ${suggestion.country}`
      : `${suggestion.name}, ${suggestion.country}`
    );
    setLocationQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const getRecommendation = (temp: number) => {
    const tempRange = getTempRange(temp);
    const activityData =
      layerRecommendations[activity as keyof typeof layerRecommendations];

    if (activityData) {
      return activityData[tempRange as keyof typeof activityData] as Recommendation;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!activity) {
      toast.error("Please select an activity");
      return;
    }

    if (inputMode === "planAhead") {
      if (!selectedLocation) {
        toast.error("Please select a location");
        return;
      }
      if (!date) {
        toast.error("Please select a date");
        return;
      }

      setLoading(true);
      try {
        const dateStr = format(date, "yyyy-MM-dd");
        const dateTime = `${dateStr}T${time}`;

        const response = await fetch(
          `/api/weather?lat=${selectedLocation.latitude}&lon=${selectedLocation.longitude}&datetime=${dateTime}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch forecast");
        }

        const data = await response.json();
        const layers = getRecommendation(data.temperature);

        setTemperature(data.temperature);
        setWindspeed(data.windSpeed);
        setRecommendation(layers);
        setShowResults(true);
        toast.success(`Forecast: ${data.temperature}°F, ${data.windSpeed} mph wind`);
      } catch (error) {
        toast.error("Failed to fetch weather forecast");
        console.error(error);
      } finally {
        setLoading(false);
      }
    } else {
      const layers = getRecommendation(temperature);
      setRecommendation(layers);
      setShowResults(true);
    }
  };

  return (
    <PageLayout>
      {!showResults ? (
        <>
          <ActivitySelection value={activity} onChange={setActivity} />
          {inputMode === "manual" ? (
            <WeatherSelection
              temperature={temperature}
              windspeed={windspeed}
              onTemperatureChange={setTemperature}
              onWindspeedChange={setWindspeed}
              onPlanAhead={() => setInputMode("planAhead")}
            />
          ) : (
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
                    onChange={(e) => {
                      if (selectedLocation) {
                        setSelectedLocation(null);
                        setLocation("");
                      }
                      setLocationQuery(e.target.value);
                    }}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
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
                          onClick={() => handleSelectLocation(suggestion)}
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
                        onSelect={setDate}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-[110px]"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setInputMode("manual")}
                >
                  Manual Input
                </Button>
              </div>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Loading..." : "Gear Up"}
          </Button>
        </>
      ) : (
        <>
          <LayerDisplay recommendation={recommendation} temperature={temperature} windspeed={windspeed} itemMappings={itemMappings} />
          <Button variant="outline" onClick={() => setShowResults(false)}>
            Back
          </Button>
        </>
      )}
    </PageLayout>
  );
};

export default Home;
