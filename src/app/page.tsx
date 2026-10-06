"use client";

import { Suspense } from "react";
import PageLayout from "@/components/PageLayout";
import LayerDisplay from "@/components/LayerDisplay";
import { GearUpForm } from "@/components/GearUpForm";
import MultiDayPlanDisplay from "@/components/MultiDayPlanDisplay";
import { useItemMappings } from "@/hooks/useItemMappings";
import { formatLocationName } from "@/hooks/useLocationSearch";
import { useGearUp } from "@/hooks/useGearUp";
import { layerDisplayAdvice } from "@/lib/gearUp";
import { useUserId } from "@/hooks/useUserId";
import { useWebMCPTools } from "@/hooks/useWebMCPTools";
import { Skeleton } from "@/components/ui/skeleton";
import { OutingRequestNotice } from "@/components/OutingRequestNotice";

const HomeContent = () => {
  // #185/#186 supply the real tools once the shared outing action is ready.
  useWebMCPTools([], useUserId() ?? "signed-out");
  const {
    activity,
    setActivity,
    activityInitializing,
    exertion,
    setExertion,
    result,
    inputMode,
    setInputMode,
    date,
    setDate,
    time,
    setTime,
    durationDays,
    setDurationDays,
    loading,
    request,
    showFieldErrors,
    startDateError,
    locationStatus,
    formRef,
    locationSearch,
    handleUseMyLocation,
    cancelLocating,
    handleSubmit,
    handleWeatherChange,
    handleActivityChange,
    handleRetry,
    handleRetryUpdate,
    showPlanForm,
    editOuting,
    resetToInitialState,
    accountChanging,
  } = useGearUp();

  const { itemMappings } = useItemMappings();

  // For the moment the page starts over for another account, nothing of the last one's shows.
  if (accountChanging) return <HomeLoading />;

  return (
    <PageLayout onLogoClick={resetToInitialState} chromeVariant="compact">
      <div
        key={result ? "results" : "form"}
        className="flex w-full flex-col items-center gap-6 animate-in fade-in duration-300 sm:gap-7"
      >
        {result && <h1 id="outing-result-heading" tabIndex={-1} className="sr-only">Gear up</h1>}
        {(result || (request.status === "error" && !request.field)) && (
          <OutingRequestNotice request={request} shownOuting={result?.outing} onRetry={handleRetryUpdate} />
        )}
        {!result ? (
          <>
            <div className="flex w-full max-w-md flex-col gap-1">
              <h1 className="text-title font-semibold text-foreground md:text-title-lg">What should I wear?</h1>
              <p className="text-base text-muted-foreground">Layer advice for your activity and conditions.</p>
            </div>
            <GearUpForm
              formRef={formRef}
              activity={activity}
              onActivityChange={setActivity}
              activityInitializing={activityInitializing}
              exertion={exertion}
              onExertionChange={setExertion}
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
              onDismissSuggestions={locationSearch.dismiss}
              locationStatus={locationStatus}
              onUseMyLocation={() => void handleUseMyLocation()}
              onCancelLocating={cancelLocating}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              date={date}
              onDateChange={setDate}
              time={time}
              onTimeChange={setTime}
              durationDays={durationDays}
              onDurationDaysChange={setDurationDays}
              showFieldErrors={showFieldErrors}
              startDateError={startDateError}
              loading={loading}
              onSubmit={() => void handleSubmit()}
            />
          </>
        ) : result.kind === "plan" ? (
          <MultiDayPlanDisplay
            plan={result.plan}
            outing={result.outing}
            activity={result.outing.activity}
            place={formatLocationName(result.outing.place)}
            itemMappings={itemMappings}
            onReset={showPlanForm}
          />
        ) : (
          // Everything shown comes from the result, so it stays tied to the
          // outing it was requested for while a change loads or fails.
          <LayerDisplay
            outing={result.outing}
            activity={result.outing.activity}
            exertion={result.outing.exertion}
            {...layerDisplayAdvice(result.advice)}
            temperature={result.weather.temperature}
            windspeed={result.weather.windSpeed}
            precipitation={result.weather.precipitation}
            precipitationType={result.weather.precipitationType}
            weatherContext={result.weather.context}
            itemMappings={itemMappings}
            onReset={editOuting}
            onRetry={() => void handleRetry()}
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
    <div className="flex w-full max-w-md flex-col gap-6">
      <Skeleton className="h-9 w-3/4 rounded-control" />
      <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-18 rounded-control" />
        ))}
      </div>
    </div>
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
