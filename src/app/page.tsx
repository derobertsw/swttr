"use client";

import { Suspense } from "react";
import PageLayout from "@/components/PageLayout";
import ActivitySelection from "@/components/ActivitySelection";
import WeatherSelection from "@/components/WeatherSelection";
import LayerDisplay from "@/components/LayerDisplay";
import { PlanAheadForm } from "@/components/PlanAheadForm";
import { LocationInput } from "@/components/LocationInput";
import { useItemMappings } from "@/hooks/useItemMappings";
import { useBackpack } from "@/hooks/useBackpack";
import { useGearUp } from "@/hooks/useGearUp";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { BACKPACK_ACTIVITY_IDS } from "@/data/backpackConstants";
import { ACTIVITIES } from "@/data/activities";
import { Skeleton } from "@/components/ui/skeleton";

const HomeContent = () => {
  const {
    activity,
    setActivity,
    temperature,
    setTemperature,
    windspeed,
    setWindspeed,
    recommendation,
    showResults,
    showSliders,
    inputMode,
    setInputMode,
    date,
    setDate,
    time,
    setTime,
    locationDenied,
    biophysicsData,
    sensitivity,
    locationSearch,
    resetToInitialState,
  } = useGearUp();

  const { itemMappings } = useItemMappings();
  const tempRangeForBackpack = getAdjustedTempRange(temperature, sensitivity);
  const backpack = useBackpack(activity, tempRangeForBackpack);

  return (
    <PageLayout onLogoClick={resetToInitialState}>
      {!showResults ? (
        <>
          <p className="text-base font-medium text-white/80 text-center mb-3">
            Choose your activity
          </p>
          <ActivitySelection value={activity} onChange={setActivity} />
          {inputMode === "manual" && locationDenied ? (
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
          ) : inputMode === "manual" && showSliders ? (
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
            />
          ) : null}
          <p className="text-sm text-white/55 text-center mb-4">
            Built on thermal science
          </p>
          <div className="flex flex-col items-center" />
        </>
      ) : (
        <>
          <LayerDisplay
            activity={activity}
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
