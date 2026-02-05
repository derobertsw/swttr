"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import PageLayout from "@/components/PageLayout";
import ActivitySelection from "@/components/ActivitySelection";
import WeatherSelection from "@/components/WeatherSelection";
import LayerDisplay from "@/components/LayerDisplay";
import { PlanAheadForm } from "@/components/PlanAheadForm";
import { LocationInput } from "@/components/LocationInput";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import layerRecommendations from "@/data/layerRecommendations.json";
import { Recommendation } from "@/types/recommendations";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation } from "@/lib/layers";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { useItemMappings } from "@/hooks/useItemMappings";
import { fetchCurrentWeather, fetchWeatherByCoords } from "@/hooks/useCurrentWeather";
import { usePreferences } from "@/hooks/usePreferences";
import { useBackpack } from "@/hooks/useBackpack";
import { useBiophysicsRecommendation } from "@/hooks/useBiophysicsRecommendation";
import { BiophysicsRecommendation } from "@/types/biophysics";
import { BACKPACK_ACTIVITY_IDS } from "@/data/backpackConstants";
import { ACTIVITIES, DEFAULT_ACTIVITY } from "@/data/activities";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

type InputMode = "manual" | "planAhead";

const HomeContent = () => {
  const searchParams = useSearchParams();
  const { sensitivity, defaultActivity } = usePreferences();
  const [activity, setActivity] = useState(DEFAULT_ACTIVITY);
  const [hasSetInitialActivity, setHasSetInitialActivity] = useState(false);
  const [temperature, setTemperature] = useState(50);
  const [windspeed, setWindspeed] = useState(10);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showSliders, setShowSliders] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>(() =>
    searchParams.get("mode") === "planAhead" ? "planAhead" : "manual"
  );
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("12:00");
  const [loading, setLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  const locationSearch = useLocationSearch();
  const { itemMappings } = useItemMappings();
  const biophysics = useBiophysicsRecommendation();
  const [biophysicsData, setBiophysicsData] = useState<BiophysicsRecommendation | null>(null);

  // Set initial activity from preferences when it loads
  useEffect(() => {
    if (!hasSetInitialActivity && defaultActivity) {
      setActivity(defaultActivity);
      setHasSetInitialActivity(true);
    }
  }, [defaultActivity, hasSetInitialActivity]);

  // Update input mode when URL param changes
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "planAhead") {
      setInputMode("planAhead");
    }
  }, [searchParams]);

  const tempRangeForBackpack = getAdjustedTempRange(temperature, sensitivity);
  const backpack = useBackpack(activity, tempRangeForBackpack);

  const getRecommendation = (temp: number): Recommendation | null => {
    const tempRange = getAdjustedTempRange(temp, sensitivity);
    const activityData =
      layerRecommendations[activity as keyof typeof layerRecommendations];

    if (activityData) {
      const legacyRec = activityData[tempRange as keyof typeof activityData];
      if (legacyRec) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return convertLegacyRecommendation(legacyRec as any);
      }
    }
    return null;
  };

  const resetToInitialState = useCallback(() => {
    setActivity(defaultActivity);
    setTemperature(50);
    setWindspeed(10);
    setRecommendation(null);
    setShowResults(false);
    setShowSliders(false);
    setInputMode("manual");
    setDate(undefined);
    setTime("12:00");
    setLocationDenied(false);
    locationSearch.reset();
    biophysics.reset();
    setBiophysicsData(null);
  }, [locationSearch, defaultActivity, biophysics]);

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

        // Fetch biophysics data before showing results
        const bioData = await biophysics.fetch(activity, { temperature: data.temperature, windSpeed: data.windSpeed });
        setBiophysicsData(bioData);
        setShowResults(true);
      } catch (error) {
        toast.error("Failed to fetch weather forecast");
        console.error(error);
      } finally {
        setLoading(false);
      }
    } else if (showSliders) {
      setLoading(true);
      const layers = getRecommendation(temperature);
      setRecommendation(layers);

      // Fetch biophysics data before showing results
      const bioData = await biophysics.fetch(activity, { temperature, windSpeed: windspeed });
      setBiophysicsData(bioData);
      setShowResults(true);
      setLoading(false);
    } else if (locationDenied) {
      // Location was previously denied, use manually entered location
      if (!locationSearch.selectedLocation) {
        toast.error("Please enter a location");
        return;
      }

      setLoading(true);
      const { selectedLocation } = locationSearch;
      const weather = await fetchWeatherByCoords(
        selectedLocation.latitude,
        selectedLocation.longitude
      );

      if (weather) {
        setTemperature(weather.temperature);
        setWindspeed(weather.windSpeed);
        const layers = getRecommendation(weather.temperature);
        setRecommendation(layers);

        // Fetch biophysics data before showing results
        const bioData = await biophysics.fetch(activity, { temperature: weather.temperature, windSpeed: weather.windSpeed });
        setBiophysicsData(bioData);
        setShowResults(true);
      } else {
        toast.error("Could not get weather for this location.");
      }
      setLoading(false);
    } else {
      setLoading(true);
      const result = await fetchCurrentWeather();

      if (result.data) {
        setTemperature(result.data.temperature);
        setWindspeed(result.data.windSpeed);
        const layers = getRecommendation(result.data.temperature);
        setRecommendation(layers);

        // Fetch biophysics data before showing results
        const bioData = await biophysics.fetch(activity, { temperature: result.data.temperature, windSpeed: result.data.windSpeed });
        setBiophysicsData(bioData);
        setShowResults(true);
      } else if (result.locationDenied) {
        toast.error("Location access denied. Please enter your location manually.");
        setLocationDenied(true);
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
          <p className="text-base font-medium text-white/80 text-center mb-6">
            Choose your activity
          </p>
          <ActivitySelection value={activity} onChange={setActivity} />
          {inputMode === "manual" && showSliders ? (
            <WeatherSelection
              temperature={temperature}
              windspeed={windspeed}
              onTemperatureChange={setTemperature}
              onWindspeedChange={setWindspeed}
              onPlanAhead={() => setInputMode("planAhead")}
            />
          ) : inputMode === "manual" && locationDenied ? (
            <LocationInput
              activityName={ACTIVITIES.find(a => a.value === activity)?.name.toLowerCase() || ""}
              location={locationSearch.location}
              locationQuery={locationSearch.locationQuery}
              suggestions={locationSearch.suggestions}
              showSuggestions={locationSearch.showSuggestions}
              selectedLocation={locationSearch.selectedLocation}
              suggestionRef={locationSearch.suggestionRef}
              onLocationInputChange={locationSearch.handleLocationInputChange}
              onLocationFocus={() => locationSearch.suggestions.length > 0 && locationSearch.setShowSuggestions(true)}
              onSelectLocation={locationSearch.handleSelectLocation}
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
            />
          ) : null}
          <p className="text-sm text-white/55 text-center mb-4">
            Built on thermal science
          </p>
          <div className="flex flex-col items-center">
            <Button
              size="xl"
              className="py-5 shadow-[0_5px_14px_rgba(0,0,0,0.3)]"
              onClick={handleSubmit}
              disabled={loading || (process.env.NODE_ENV === "production" && ["running", "biking"].includes(activity))}
            >
              {loading ? <><Loader2 className="animate-spin" /> Loading...</> : "Gear Up"}
            </Button>
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
            biophysicsData={biophysicsData}
          />
        </>
      )}
    </PageLayout>
  );
};

const HomeLoading = () => (
  <PageLayout>
    <div className="mx-auto w-full max-w-md">
      <div className="flex justify-center gap-4 py-6">
        <Skeleton className="h-24 w-24 rounded-xl" />
        <Skeleton className="h-28 w-28 rounded-xl" />
        <Skeleton className="h-24 w-24 rounded-xl" />
      </div>
    </div>
    <Skeleton className="h-12 w-32 rounded-lg" />
  </PageLayout>
);

const Home = () => {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
};

export default Home;
