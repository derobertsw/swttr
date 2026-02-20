"use client";

import { Suspense } from "react";
import PageLayout from "@/components/PageLayout";
import ActivitySelection from "@/components/ActivitySelection";
import LayerDisplay from "@/components/LayerDisplay";
import { PlanAheadForm } from "@/components/PlanAheadForm";
import MultiDayPlanDisplay from "@/components/MultiDayPlanDisplay";
import { LocationInput } from "@/components/LocationInput";
import { useItemMappings } from "@/hooks/useItemMappings";
import { useGearUp } from "@/hooks/useGearUp";
import { ACTIVITIES } from "@/data/activities";
import { Skeleton } from "@/components/ui/skeleton";

const HomeContent = () => {
  const {
    activity,
    setActivity,
    activityInitializing,
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
    durationDays,
    setDurationDays,
    loading,
    locationDenied,
    biophysicsData,
    multiDayPlan,
    locationSearch,
    handleGoNow,
    handleWeatherChange,
    handleActivityChange,
    resetToInitialState,
  } = useGearUp();

  const { itemMappings } = useItemMappings();

  return (
    <PageLayout onLogoClick={resetToInitialState}>
      <div
        key={showResults ? "results" : "form"}
        className="flex w-full flex-col items-center gap-6 animate-in fade-in duration-300 sm:gap-7"
      >
        {!showResults ? (
          <>
            <p className="mb-1 text-center text-[12px] font-semibold uppercase tracking-[0.2em] text-white/70">
              1. Activity
            </p>
            <p className="mb-3 text-center text-[1.95rem] font-semibold leading-tight text-white/95 tracking-[-0.01em]">
              Choose your trip activity
            </p>
            {activityInitializing ? (
              <div className="mx-auto w-full max-w-md">
                <div className="mb-2 flex items-center justify-between px-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
                  <span>Loading activity</span>
                  <span>{ACTIVITIES.length} options</span>
                </div>
                <div className="grid grid-cols-3 gap-3 py-6">
                  <Skeleton className="h-36 rounded-xl bg-white/15" />
                  <Skeleton className="h-44 rounded-xl bg-white/20" />
                  <Skeleton className="h-36 rounded-xl bg-white/15" />
                </div>
              </div>
            ) : (
              <ActivitySelection
                value={activity}
                onChange={setActivity}
                exertion={exertion}
                onExertionChange={setExertion}
              />
            )}
            {inputMode === "manual" && locationDenied ? (
              <LocationInput
                activityName={ACTIVITIES.find(a => a.value === activity)?.name.toLowerCase() || ""}
                location={locationSearch.location}
                locationQuery={locationSearch.locationQuery}
                suggestions={locationSearch.suggestions}
                showSuggestions={locationSearch.showSuggestions}
                selectedLocation={locationSearch.selectedLocation}
                isSearching={locationSearch.isSearching}
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
                durationDays={durationDays}
                loading={loading}
                location={locationSearch.location}
                locationQuery={locationSearch.locationQuery}
                suggestions={locationSearch.suggestions}
                showSuggestions={locationSearch.showSuggestions}
                selectedLocation={locationSearch.selectedLocation}
                isSearching={locationSearch.isSearching}
                suggestionRef={locationSearch.suggestionRef}
                onDateChange={setDate}
                onTimeChange={setTime}
                onDurationDaysChange={setDurationDays}
                onGoNow={handleGoNow}
                onLocationInputChange={locationSearch.handleLocationInputChange}
                onLocationFocus={() => locationSearch.suggestions.length > 0 && locationSearch.setShowSuggestions(true)}
                onSelectLocation={locationSearch.handleSelectLocation}
                onDismiss={locationSearch.dismiss}
              />
            ) : null}
            <p className="mt-4 text-center text-base text-white/80 sm:text-lg">
              Recommendations update from your activity, exertion, and start time.
            </p>
            <p className="mb-4 text-center text-sm text-white/55">
              Built on thermal science
            </p>
          </>
        ) : inputMode === "planAhead" && multiDayPlan ? (
          <MultiDayPlanDisplay
            plan={multiDayPlan}
            itemMappings={itemMappings}
            onReset={resetToInitialState}
          />
        ) : (
          <LayerDisplay
            activity={activity}
            recommendation={recommendation}
            temperature={temperature}
            windspeed={windspeed}
            itemMappings={itemMappings}
            biophysicsData={biophysicsData}
            onReset={resetToInitialState}
            onWeatherChange={handleWeatherChange}
            onActivityChange={handleActivityChange}
            weatherLoading={loading}
          />
        )}
      </div>
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
