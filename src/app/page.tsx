"use client";

import { useState, useCallback } from "react";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout";
import ActivitySelection from "@/components/ActivitySelection";
import WeatherSelection from "@/components/WeatherSelection";
import LayerDisplay from "@/components/LayerDisplay";
import { PlanAheadForm } from "@/components/PlanAheadForm";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import layerRecommendations from "@/data/layerRecommendations.json";
import { Recommendation } from "@/types/recommendations";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { useItemMappings } from "@/hooks/useItemMappings";
import { fetchCurrentWeather } from "@/hooks/useCurrentWeather";
import { useTemperatureSensitivity } from "@/hooks/useTemperatureSensitivity";
import { useBackpack } from "@/hooks/useBackpack";
import { BACKPACK_ACTIVITY_IDS } from "@/data/backpackConstants";

type InputMode = "manual" | "planAhead";

const Home = () => {
  const [activity, setActivity] = useState("alpine-skiing");
  const [temperature, setTemperature] = useState(50);
  const [windspeed, setWindspeed] = useState(10);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showSliders, setShowSliders] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("12:00");
  const [loading, setLoading] = useState(false);

  const locationSearch = useLocationSearch();
  const { itemMappings } = useItemMappings();
  const { sensitivity } = useTemperatureSensitivity();

  const tempRangeForBackpack = getAdjustedTempRange(temperature, sensitivity);
  const backpack = useBackpack(activity, tempRangeForBackpack);

  const getRecommendation = (temp: number) => {
    const tempRange = getAdjustedTempRange(temp, sensitivity);
    const activityData =
      layerRecommendations[activity as keyof typeof layerRecommendations];

    if (activityData) {
      return activityData[tempRange as keyof typeof activityData] as Recommendation;
    }
    return null;
  };

  const resetToInitialState = useCallback(() => {
    setActivity("alpine-skiing");
    setTemperature(50);
    setWindspeed(10);
    setRecommendation(null);
    setShowResults(false);
    setShowSliders(false);
    setInputMode("manual");
    setDate(undefined);
    setTime("12:00");
    locationSearch.reset();
  }, [locationSearch]);

  const handleSubmit = async () => {
    if (!activity) {
      toast.error("Please select an activity");
      return;
    }

    if (inputMode === "planAhead") {
      if (!locationSearch.selectedLocation) {
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
        const { selectedLocation } = locationSearch;

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
    } else if (showSliders) {
      const layers = getRecommendation(temperature);
      setRecommendation(layers);
      setShowResults(true);
    } else {
      setLoading(true);
      const weather = await fetchCurrentWeather();

      if (weather) {
        setTemperature(weather.temperature);
        setWindspeed(weather.windSpeed);
        const layers = getRecommendation(weather.temperature);
        setRecommendation(layers);
        setShowResults(true);
        toast.success(`Current: ${weather.temperature}°F, ${weather.windSpeed} mph wind`);
      } else {
        toast.error("Could not get current weather. Please set manually.");
        setShowSliders(true);
      }
      setLoading(false);
    }
  };

  return (
    <PageLayout onLogoClick={resetToInitialState}>
      {!showResults ? (
        <>
          <ActivitySelection value={activity} onChange={setActivity} />
          {inputMode === "manual" && showSliders ? (
            <WeatherSelection
              temperature={temperature}
              windspeed={windspeed}
              onTemperatureChange={setTemperature}
              onWindspeedChange={setWindspeed}
              onPlanAhead={() => setInputMode("planAhead")}
            />
          ) : inputMode === "planAhead" ? (
            <PlanAheadForm
              date={date}
              time={time}
              location={locationSearch.location}
              locationQuery={locationSearch.locationQuery}
              suggestions={locationSearch.suggestions}
              showSuggestions={locationSearch.showSuggestions}
              selectedLocation={locationSearch.selectedLocation}
              suggestionRef={locationSearch.suggestionRef}
              onDateChange={setDate}
              onTimeChange={setTime}
              onLocationInputChange={locationSearch.handleLocationInputChange}
              onLocationFocus={() => locationSearch.suggestions.length > 0 && locationSearch.setShowSuggestions(true)}
              onSelectLocation={locationSearch.handleSelectLocation}
              onSwitchToManual={() => setInputMode("manual")}
            />
          ) : null}
          <div className="flex gap-3">
            <Button size="lg" onClick={handleSubmit} disabled={loading}>
              {loading ? "Loading..." : "Gear Up"}
            </Button>
            {inputMode === "manual" && !showSliders && (
              <Button size="lg" variant="outline" onClick={() => setInputMode("planAhead")}>
                Plan Ahead
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <LayerDisplay
            recommendation={recommendation}
            temperature={temperature}
            windspeed={windspeed}
            itemMappings={itemMappings}
            backpackItems={BACKPACK_ACTIVITY_IDS.includes(activity) ? backpack.items : undefined}
            onRemoveBackpackItem={BACKPACK_ACTIVITY_IDS.includes(activity) ? backpack.removeItem : undefined}
            onHideBackpackDefault={BACKPACK_ACTIVITY_IDS.includes(activity) ? backpack.hideDefault : undefined}
          />
          <Button size="lg" variant="outline" onClick={() => setShowResults(false)}>
            Back
          </Button>
        </>
      )}
    </PageLayout>
  );
};

export default Home;
