"use client";

import { Suspense } from "react";
import PageLayout from "@/components/PageLayout";
import ActivitySelection from "@/components/ActivitySelection";
import LayerDisplay from "@/components/LayerDisplay";
import { PlanAheadForm } from "@/components/PlanAheadForm";
import { LocationInput } from "@/components/LocationInput";
import { useItemMappings } from "@/hooks/useItemMappings";
import { useGearUp } from "@/hooks/useGearUp";
import { ACTIVITIES } from "@/data/activities";
import { Skeleton } from "@/components/ui/skeleton";

const HomeContent = () => {
  const {
    activity,
    setActivity,
    exertion,
    setExertion,
    temperature,
    windspeed,
    recommendation,
    showResults,
    inputMode,
    date,
    setDate,
    time,
    setTime,
    locationDenied,
    biophysicsData,
    locationSearch,
    resetToInitialState,
  } = useGearUp();

  const { itemMappings } = useItemMappings();

  return (
    <PageLayout onLogoClick={resetToInitialState}>
      {!showResults ? (
        <>
          <p className="text-sm font-semibold text-white/75 text-center mb-2 uppercase tracking-wide">
            1. Activity
          </p>
          <p className="text-base font-medium text-white/90 text-center mb-3">
            Choose your trip activity
          </p>
          <ActivitySelection
            value={activity}
            onChange={setActivity}
            exertion={exertion}
            onExertionChange={setExertion}
          />
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
              onDismiss={locationSearch.dismiss}
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
              onDismiss={locationSearch.dismiss}
            />
          ) : null}
          <p className="text-sm text-white/75 text-center mt-4 mb-1">
            Recommendations update from your activity, exertion, and start time.
          </p>
          <p className="text-xs text-white/55 text-center mb-4">
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
