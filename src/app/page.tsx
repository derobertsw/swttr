"use client";

import { Suspense } from "react";
import { Loader2, Zap } from "lucide-react";
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
    precipitation,
    precipitationType,
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
    handleSubmit,
    handleWeatherChange,
    handleActivityChange,
    resetToInitialState,
  } = useGearUp();

  const { itemMappings } = useItemMappings();

  const ActivityIcon = ACTIVITIES.find((item) => item.value === activity)?.icon ?? Zap;
  const showGearUpButton = !showResults && inputMode !== "planAhead";

  return (
    <PageLayout onLogoClick={resetToInitialState} chromeVariant="compact">
      <div
        key={showResults ? "results" : "form"}
        className="flex w-full flex-col items-center gap-6 animate-in fade-in duration-300 sm:gap-7"
      >
        {!showResults ? (
          <>
            <div className="mb-1 flex max-w-md flex-col items-center gap-2 text-center">
              <p className="text-[1.75rem] font-semibold leading-tight tracking-[-0.01em] text-white/95 sm:text-[1.95rem]">
                Pick your activity
              </p>
              <p className="max-w-[24rem] text-[0.95rem] leading-relaxed text-white/64">
                This sets your layering baseline.
              </p>
            </div>
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
            {showGearUpButton && (
              <button
                type="button"
                aria-label="Gear Up"
                onClick={() => void handleSubmit()}
                disabled={loading}
                className="inline-flex h-12 w-full max-w-[420px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[linear-gradient(180deg,#111827_0%,#020617_100%)] px-6 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(0,0,0,0.44)] transition-transform duration-200 hover:bg-[#030712] disabled:opacity-70"
              >
                {loading ? <Loader2 className="size-5 animate-spin" /> : <ActivityIcon className="size-5" />}
                <span className="tracking-wide">Gear Up</span>
              </button>
            )}
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
            precipitation={precipitation}
            precipitationType={precipitationType}
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
  <PageLayout chromeVariant="compact">
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
