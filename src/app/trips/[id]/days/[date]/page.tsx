"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CloudOff, Loader2, MapPin } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { chipClassName } from "@/components/ui/chip";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BackLink,
  GarmentGlyph,
  MemberAvatar,
  SectionLabel,
  TripError,
  WeatherGlyph,
  inferWeatherKind,
  sentenceCase,
} from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import { useTrip } from "@/hooks/useTrip";
import { useUserId } from "@/hooks/useUserId";
import { SavedKitView } from "@/components/trips/SavedKitView";
import { canEditMemberKit } from "@/lib/trip-permissions";
import { DayLodging } from "@/components/trips/TripStays";
import { useTemperatureUnit } from "@/components/TemperatureUnitProvider";
import { formatTemperature } from "@/lib/temperature";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";
import { errorMessage, tripRequest } from "@/lib/trip-requests";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import type { TripDayForecastResponse } from "@/types/trip-coverage";
import type { TripEffort, TripKitState, TripMember, TripMemberDayKit, TripStop } from "@/types/trips";

const KIT_SLOTS = ["shirt", "midlayer", "jacket", "shell", "pants", "gloves"] as const;
const EFFORT_OPTIONS: TripEffort[] = ["easy", "steady", "hard"];
const KIT_STATE_LABEL: Record<TripKitState, string> = { ok: "OK", warn: "Needs help", missing: "Missing" };

export default function DayDetailPage({
  params,
}: {
  params: Promise<{ id: string; date: string }>;
}) {
  const { id, date } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  const userId = useUserId();
  const [weatherAttempt, setWeatherAttempt] = useState(0);
  const [weatherResult, setWeatherResult] = useState<{
    key: string;
    result: TripDayForecastResponse;
  } | null>(null);

  const day = data?.days.find((d) => d.date === date);
  const assignedStop = day?.stop_id ? data?.stops.find((s) => s.id === day.stop_id) : undefined;
  // Fall back to the trip's first stop (its "base location") when this day
  // doesn't have a stop of its own, so forecasts still work for solo trips
  // and travel days without a planned stop.
  const baseStop = data?.stops[0];
  const effectiveStop = assignedStop ?? baseStop;
  const usingBaseFallback = !assignedStop && !!baseStop;
  // Forecasts are stored with the stop/date they were fetched for, so one never
  // shows against a different stop.
  const hasCoords = typeof effectiveStop?.latitude === "number" && Number.isFinite(effectiveStop.latitude)
    && typeof effectiveStop.longitude === "number" && Number.isFinite(effectiveStop.longitude);
  const weatherKey = hasCoords
    ? `${id}:${effectiveStop?.latitude},${effectiveStop?.longitude},${date}:${weatherAttempt}`
    : null;
  const forecast = weatherKey && weatherResult?.key === weatherKey ? weatherResult.result : null;

  useEffect(() => {
    if (!weatherKey) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    fetch(`/api/v1/trips/${id}/days/${date}/weather`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Forecast request failed");
        const body = await response.json() as TripDayForecastResponse;
        if (!body?.forecast || !["not_requested", "available", "partial", "unavailable", "error"].includes(body.forecast.status)) {
          throw new Error("Invalid forecast response");
        }
        if (["available", "partial"].includes(body.forecast.status) &&
          (!body.weather || ![body.weather.tempF, body.weather.wind, body.weather.precip].every((value) => typeof value === "number" && Number.isFinite(value)))) {
          throw new Error("Invalid weather values");
        }
        if (!cancelled) setWeatherResult({ key: weatherKey, result: body });
      })
      .catch(() => {
        if (!cancelled) setWeatherResult({ key: weatherKey, result: {
          forecast: { status: "error", availableHours: 0, expectedHours: 16, reason: "service_error",
            message: "Couldn't load the forecast. Retry weather or plan your kit manually." },
          weather: null,
        } });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [weatherKey, id, date]);

  const dateObj = new Date(`${date}T00:00:00`);
  const canCreateDay = !!data && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(dateObj.getTime())
    && dateObj.getFullYear() === Number(date.slice(0, 4))
    && dateObj.getMonth() + 1 === Number(date.slice(5, 7))
    && dateObj.getDate() === Number(date.slice(8, 10))
    && date >= data.trip.start_date && date <= data.trip.end_date;
  const dateLabel = dateObj.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const activeMembers = useMemo(
    () => data?.members.filter((m) => m.status !== "left") ?? [],
    [data?.members]
  );
  const me = activeMembers.find((m) => m.user_id !== null && m.user_id === userId);
  const crew = activeMembers.filter((m) => m !== me);
  const kitFor = (member: TripMember) => data?.kits.find((k) => k.trip_member_id === member.id && k.trip_day_id === day?.id);
  const myKit = me ? kitFor(me) : undefined;

  // Find prev/next day for arrows.
  const dayIndex = data?.days.findIndex((d) => d.date === date) ?? -1;
  const prevDay = dayIndex > 0 ? data?.days[dayIndex - 1] : undefined;
  const nextDay =
    dayIndex >= 0 && data && dayIndex < data.days.length - 1 ? data.days[dayIndex + 1] : undefined;

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <BackLink href={`/trips/${id}`}>Trip</BackLink>
          <div className="ml-auto flex items-center gap-1">
            {prevDay && (
              <Button asChild variant="ghost" size="icon-sm">
                <Link href={`/trips/${id}/days/${prevDay.date}`} aria-label="Previous day">
                  <ChevronLeft className="size-5" />
                </Link>
              </Button>
            )}
            {nextDay && (
              <Button asChild variant="ghost" size="icon-sm">
                <Link href={`/trips/${id}/days/${nextDay.date}`} aria-label="Next day">
                  <ChevronRight className="size-5" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {loading && <Skeleton className="h-32 w-full rounded-card" />}
        {error && <TripError>{error}</TripError>}

        {data && !day && (
          <MissingDayPlan tripId={id} date={date} dateLabel={dateLabel} canCreate={canCreateDay} onSaved={refresh} />
        )}
        {data && day && (
          <>
            <header>
              <SectionLabel>
                Day {dayIndex + 1} of {data.days.length} ·{" "}
                {day.activity ?? effectiveStop?.activities[0] ?? "no activity"}
              </SectionLabel>
              <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
                {dateLabel}
              </h1>
              {effectiveStop && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {effectiveStop.name}
                  {usingBaseFallback && <span className="ml-1.5">· base location</span>}
                </p>
              )}
            </header>

            <DayLodging data={data} date={date} />

            <ActivityPicker
              tripId={id}
              date={date}
              current={day.activity ?? null}
              suggested={effectiveStop?.activities ?? []}
              onSaved={refresh}
            />

            <WeatherCard
              tripId={id}
              stop={effectiveStop ?? null}
              result={forecast}
              onRetry={() => setWeatherAttempt((attempt) => attempt + 1)}
              onLocationSaved={() => refresh()}
            />

            {me && (myKit?.outfit ? (
              <SavedKitView outfit={myKit.outfit} savedAt={myKit.outfit_saved_at} stop={effectiveStop ?? null} />
            ) : (
              <section aria-labelledby="my-kit-heading" className="flex flex-col gap-2.5">
                <h2 id="my-kit-heading" className="text-title font-semibold text-foreground">My kit</h2>
                <p className="text-sm text-muted-foreground">
                  No outfit saved for this day.{" "}
                  <Link href="/" className="font-medium text-foreground underline underline-offset-2">Get layers in Gear up</Link>
                  {" "}and use Save to trip, or mark what you&apos;ll bring below.
                </p>
                <MemberKitRow tripId={id} date={date} member={me} kit={myKit} editable onSaved={refresh} />
              </section>
            ))}

            {crew.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <SectionLabel>{me ? "Crew kits" : "Kits"}</SectionLabel>
                {crew.map((m) => (
                  <MemberKitRow
                    key={m.id}
                    tripId={id}
                    date={date}
                    member={m}
                    kit={kitFor(m)}
                    editable={canEditMemberKit(data.trip, m, userId)}
                    onSaved={refresh}
                  />
                ))}
              </section>
            )}

            <div className="h-24" />
          </>
        )}
      </div>
    </PageLayout>
  );
}

function MissingDayPlan({ tripId, date, dateLabel, canCreate, onSaved }: {
  tripId: string; date: string; dateLabel: string; canCreate: boolean; onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await tripRequest(`/api/v1/trips/${tripId}/days/${date}`, "POST");
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <h1 className="text-xl font-semibold text-foreground">{dateLabel}</h1>
      <p className="mt-2 text-sm text-foreground">{canCreate
        ? "This date has no saved day plan. Create one to choose an activity and plan your kit."
        : "This date is outside the trip. Return to the trip overview to review its dates."}</p>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-destructive">Couldn&apos;t create the day plan: {error}</p>}
      {canCreate && <Button type="button" onClick={() => void create()} disabled={saving} aria-busy={saving} className="mt-3">
        {saving ? "Creating day plan…" : "Create day plan"}
      </Button>}
    </Card>
  );
}

function WeatherCard({
  tripId,
  stop,
  result,
  onRetry,
  onLocationSaved,
}: {
  tripId: string;
  stop: TripStop | null;
  result: TripDayForecastResponse | null;
  onRetry: () => void;
  onLocationSaved: () => void;
}) {
  const { temperatureUnit } = useTemperatureUnit();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const search = useLocationSearch();

  const hasCoords = typeof stop?.latitude === "number" && Number.isFinite(stop.latitude)
    && typeof stop.longitude === "number" && Number.isFinite(stop.longitude);
  const weather = result?.weather;
  const canRetry = result?.forecast.status === "error" || result?.forecast.status === "partial"
    || result?.forecast.reason === "no_daytime_hours";

  const save = async () => {
    const selected = search.selectedLocation;
    if (!selected) return;
    setSaving(true);
    try {
      const name = selected.region
        ? `${selected.name}, ${selected.region}`
        : `${selected.name}, ${selected.country}`;
      if (stop) {
        await tripRequest(`/api/v1/trips/${tripId}/stops/${stop.id}`, "PATCH", {
          name,
          latitude: selected.latitude,
          longitude: selected.longitude,
        });
      } else {
        await tripRequest(`/api/v1/trips/${tripId}/stops`, "POST", {
          name,
          latitude: selected.latitude,
          longitude: selected.longitude,
          activities: [],
        });
      }
      search.reset();
      setEditing(false);
      onLocationSaved();
    } catch (err) {
      // The picked place stays in the editor, so Save location can be tried again.
      toast.error("Couldn't save the location", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        {weather ? (
          <WeatherGlyph kind={inferWeatherKind(weather.tempF, weather.precip)} className="size-8 shrink-0" />
        ) : !hasCoords ? (
          <MapPin className="size-8 shrink-0 text-muted-foreground" aria-hidden />
        ) : result ? (
          <CloudOff className="size-8 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <Loader2 className="size-8 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          {weather ? (
            <>
              <p className="text-base font-semibold text-foreground">
                {formatTemperature(weather.tempF, temperatureUnit)} · {weather.wind} mph
              </p>
              <p className="text-sm text-muted-foreground">
                {weather.precip > 0.6
                  ? "wet day · plan a shell"
                  : weather.precip > 0.3
                  ? "showers possible"
                  : "dry"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{result?.forecast.message}</p>
            </>
          ) : hasCoords ? (
            <p className="text-sm text-muted-foreground">
              {result ? result.forecast.message : "Loading forecast…"}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {stop
                ? "This stop has no coordinates yet."
                : "Set a base location to fetch the forecast."}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-11">
        {hasCoords && canRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry weather
          </Button>
        )}
        {hasCoords ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Change"}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            Set location
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-3 border-t border-border pt-3">
          <LocationAutocomplete
            id="day-stop-location"
            placeholder="Search a city or place…"
            location={search.location}
            locationQuery={search.locationQuery}
            suggestions={search.suggestions}
            showSuggestions={search.showSuggestions}
            selectedLocation={search.selectedLocation}
            isSearching={search.isSearching}
            suggestionRef={search.suggestionRef}
            onLocationInputChange={search.handleLocationInputChange}
            onLocationFocus={() =>
              search.suggestions.length > 0 && search.setShowSuggestions(true)
            }
            onSelectLocation={search.handleSelectLocation}
            onDismiss={search.dismiss}
          />
          <Button
            type="button"
            onClick={save}
            disabled={!search.selectedLocation || saving}
            className="mt-3"
          >
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save location
          </Button>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {stop
              ? "Updates this stop for every day at it."
              : "Adds a base location to the trip."}
          </p>
        </div>
      )}
    </Card>
  );
}

function ActivityPicker({
  tripId,
  date,
  current,
  suggested,
  onSaved,
}: {
  tripId: string;
  date: string;
  current: string | null;
  suggested: string[];
  /** Reloads the trip; the chips stay disabled until it finishes. */
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string | null>(current);
  // Re-sync the optimistic selection whenever the saved activity changes.
  const [prevCurrent, setPrevCurrent] = useState(current);
  if (current !== prevCurrent) {
    setPrevCurrent(current);
    setValue(current);
  }

  const merged = useMemo(() => {
    const set = new Set<string>(TRIP_ACTIVITY_OPTIONS);
    for (const a of suggested) set.add(a);
    if (current && !set.has(current)) set.add(current);
    return Array.from(set);
  }, [suggested, current]);

  // The chips are disabled from a tap until the save and the reload after it
  // finish. Saves never overlap, so `current` is still the saved activity if
  // this one fails.
  const setActivity = async (next: string | null) => {
    setValue(next);
    setSaving(true);
    try {
      await tripRequest(`/api/v1/trips/${tripId}/days/${date}`, "PATCH", { activity: next });
      await onSaved();
    } catch (err) {
      setValue(current);
      toast.error("Couldn't save the activity", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionLabel>Activity</SectionLabel>
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {merged.map((a) => {
          const on = value === a;
          const fromStop = suggested.includes(a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => setActivity(on ? null : a)}
              disabled={saving}
              aria-pressed={on}
              className={chipClassName}
            >
              {a}
              {fromStop && !on && <span className="text-muted-foreground">·</span>}
            </button>
          );
        })}
      </div>
      {value === null && (
        <p className="mt-2 text-sm text-muted-foreground">Tap a chip to set this day&apos;s activity.</p>
      )}
    </Card>
  );
}

/**
 * One person's kit for the day. Its controls show only to whoever may change
 * it, as the kit API allows: the member, or the organizer for a guest.
 */
function MemberKitRow({
  tripId,
  date,
  member,
  kit,
  editable,
  onSaved,
}: {
  tripId: string;
  date: string;
  member: TripMember;
  kit: TripMemberDayKit | undefined;
  editable: boolean;
  /** Reloads the trip; the row's controls stay disabled until it finishes. */
  onSaved: () => Promise<void>;
}) {
  if (kit?.outfit || !editable) return <MemberKitSummary member={member} kit={kit} />;
  return <EditableMemberKitRow tripId={tripId} date={date} member={member} kit={kit} onSaved={onSaved} />;
}

/** Someone else's kit, read-only: their saved outfit, or their checklist. */
function MemberKitSummary({ member, kit }: { member: TripMember; kit: TripMemberDayKit | undefined }) {
  const outfit = kit?.outfit;
  const worn = outfit
    ? Object.values(outfit.phases[0].wear).reduce((count, layers) => count + layers.base.length + (layers.mid?.length ?? 0) + layers.outer.length, 0)
    : 0;
  return (
    <Card className={cn(kit?.state === "warn" && !outfit && "border-warning")}>
      <div className="flex flex-wrap items-center gap-3">
        <MemberAvatar name={member.display_name} size={28} state={member.role === "organizer" ? "self" : "default"} />
        <div className="min-w-32 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{member.display_name}</p>
          <p className="text-sm text-muted-foreground">
            {outfit
              ? `Outfit saved · ${outfit.advice.kind === "personalized" ? "Personalized" : "General guide"} · ${worn} ${worn === 1 ? "item" : "items"}`
              : !kit || kit.items.length === 0
              ? "no kit set"
              : `${sentenceCase(kit.effort)} · ${kit.items.map(sentenceCase).join(", ")}`}
          </p>
        </div>
        {kit && !outfit && kit.state !== "ok" && (
          <Badge size="sm" variant="warning">{KIT_STATE_LABEL[kit.state]}</Badge>
        )}
      </div>
    </Card>
  );
}

function EditableMemberKitRow({
  tripId,
  date,
  member,
  kit,
  onSaved,
}: {
  tripId: string;
  date: string;
  member: TripMember;
  kit: TripMemberDayKit | undefined;
  onSaved: () => Promise<void>;
}) {
  const [effort, setEffort] = useState<TripEffort>(kit?.effort ?? "steady");
  const [items, setItems] = useState<string[]>(kit?.items ?? []);
  const [state, setState] = useState<TripKitState>(kit?.state ?? "ok");
  const [saving, setSaving] = useState(false);
  // Re-sync the optimistic edits whenever the saved kit changes.
  const [prevKit, setPrevKit] = useState(kit);
  if (kit !== prevKit) {
    setPrevKit(kit);
    setEffort(kit?.effort ?? "steady");
    setItems(kit?.items ?? []);
    setState(kit?.state ?? "ok");
  }

  // The row's controls are disabled from a tap until the save and the reload
  // after it finish. Saves never overlap, so `kit` is still the saved kit if
  // this one fails.
  const persist = async (next: {
    effort?: TripEffort;
    items?: string[];
    state?: TripKitState;
  }) => {
    setSaving(true);
    try {
      const body = {
        effort: next.effort ?? effort,
        items: next.items ?? items,
        state: next.state ?? state,
        note: kit?.note ?? null,
      };
      await tripRequest(`/api/v1/trips/${tripId}/days/${date}/kits/${member.id}`, "PUT", body);
      await onSaved();
    } catch (err) {
      // Show the saved kit again rather than an edit that didn't stick.
      setEffort(kit?.effort ?? "steady");
      setItems(kit?.items ?? []);
      setState(kit?.state ?? "ok");
      // Not "<name>'s kit": the organizer's display name is "You".
      toast.error("Couldn't save the kit change", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (slot: string) => {
    const next = items.includes(slot) ? items.filter((x) => x !== slot) : [...items, slot];
    setItems(next);
    persist({ items: next });
  };

  return (
    <Card className={cn(state === "warn" && "border-warning")}>
      <div className="flex flex-wrap items-center gap-3">
        <MemberAvatar
          name={member.display_name}
          size={28}
          state={member.role === "organizer" ? "self" : "default"}
        />
        <div className="min-w-32 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{member.display_name}</p>
          <p className="text-sm text-muted-foreground">
            {state === "warn"
              ? "thin — borrow a layer?"
              : items.length === 0
              ? "no kit set"
              : `${items.length} layers picked`}
          </p>
        </div>
        <div
          role="group"
          aria-label={`Effort for ${member.display_name}`}
          className={cn(segmentedGroupClassName, "grid-cols-3")}
        >
          {EFFORT_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setEffort(opt);
                persist({ effort: opt });
              }}
              disabled={saving}
              aria-pressed={effort === opt}
              className={segmentedItemClassName}
            >
              {sentenceCase(opt)}
            </button>
          ))}
        </div>
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {KIT_SLOTS.map((slot) => {
          const on = items.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              onClick={() => toggleItem(slot)}
              disabled={saving}
              aria-pressed={on}
              className={chipClassName}
            >
              <GarmentGlyph kind={slot} />
              {sentenceCase(slot)}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge size="sm" variant={state === "ok" ? "neutral" : "warning"}>
          {KIT_STATE_LABEL[state]}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const next: TripKitState = state === "warn" ? "ok" : "warn";
            setState(next);
            persist({ state: next });
          }}
          disabled={saving}
        >
          Flag {state === "warn" ? "ok" : "warn"}
        </Button>
      </div>
    </Card>
  );
}
