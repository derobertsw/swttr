"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  Chip,
  GarmentGlyph,
  MemberAvatar,
  SectionLabel,
  WeatherGlyph,
  inferWeatherKind,
} from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import type { TripEffort, TripKitState, TripMember, TripMemberDayKit, TripStop } from "@/types/trips";

const KIT_SLOTS = ["shirt", "midlayer", "jacket", "shell", "pants", "gloves"] as const;
const EFFORT_OPTIONS: TripEffort[] = ["easy", "steady", "hard"];

export default function DayDetailPage({
  params,
}: {
  params: Promise<{ id: string; date: string }>;
}) {
  const { id, date } = use(params);
  const { data, loading, error, refresh } = useTrip(id);
  // tempF/wind in imperial units (matches /api/weather), precip is a 0–1 fraction
  // representing the day's peak precipitation probability.
  const [weather, setWeather] = useState<{ tempF: number; precip: number; wind: number } | null>(
    null
  );

  const day = data?.days.find((d) => d.date === date);
  const assignedStop = day?.stop_id ? data?.stops.find((s) => s.id === day.stop_id) : undefined;
  // Fall back to the trip's first stop (its "base location") when this day
  // doesn't have a stop of its own, so forecasts still work for solo trips
  // and travel days without a planned stop.
  const baseStop = data?.stops[0];
  const effectiveStop = assignedStop ?? baseStop;
  const usingBaseFallback = !assignedStop && !!baseStop;

  useEffect(() => {
    if (!effectiveStop?.latitude || !effectiveStop?.longitude) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/weather?lat=${effectiveStop.latitude}&lon=${effectiveStop.longitude}&startDate=${date}&days=1`
    )
      .then((r) => r.json())
      .then((body: { hourly?: Array<{ time: string; temperature: number; windSpeed: number; precipitationProbability: number }> }) => {
        if (cancelled) return;
        const hourly = Array.isArray(body?.hourly) ? body.hourly : [];
        // Average across the active daytime window (8am–6pm) for a representative
        // "what's the day going to feel like" reading, with peak-precip and
        // peak-wind so kit decisions don't miss a single bad hour.
        const daytime = hourly.filter((h) => {
          const hour = Number(h.time?.slice(11, 13));
          return hour >= 8 && hour <= 18;
        });
        const sample = daytime.length > 0 ? daytime : hourly;
        if (sample.length === 0) return;
        const avgTemp =
          sample.reduce((acc, h) => acc + (h.temperature ?? 0), 0) / sample.length;
        const peakWind = sample.reduce((acc, h) => Math.max(acc, h.windSpeed ?? 0), 0);
        const peakPrecip = sample.reduce(
          (acc, h) => Math.max(acc, h.precipitationProbability ?? 0),
          0
        );
        setWeather({
          tempF: avgTemp,
          wind: peakWind,
          precip: peakPrecip / 100, // /api/weather returns 0–100, normalize for inferWeatherKind
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectiveStop?.latitude, effectiveStop?.longitude, date]);

  const dateObj = new Date(`${date}T00:00:00`);
  const dateLabel = dateObj.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const activeMembers = useMemo(
    () => data?.members.filter((m) => m.status !== "left") ?? [],
    [data?.members]
  );

  // Find prev/next day for arrows.
  const dayIndex = data?.days.findIndex((d) => d.date === date) ?? -1;
  const prevDay = dayIndex > 0 ? data?.days[dayIndex - 1] : undefined;
  const nextDay =
    dayIndex >= 0 && data && dayIndex < data.days.length - 1 ? data.days[dayIndex + 1] : undefined;

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <Link
            href={`/trips/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Trip
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {prevDay && (
              <Link
                href={`/trips/${id}/days/${prevDay.date}`}
                className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="size-5" />
              </Link>
            )}
            {nextDay && (
              <Link
                href={`/trips/${id}/days/${nextDay.date}`}
                className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
              >
                <ChevronRight className="size-5" />
              </Link>
            )}
          </div>
        </div>

        {loading && <Skeleton className="h-32 w-full rounded-2xl bg-white/12" />}
        {error && (
          <div className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}

        {data && day && (
          <>
            <header>
              <SectionLabel>
                Day {dayIndex + 1} of {data.days.length} ·{" "}
                {day.activity ?? effectiveStop?.activities[0] ?? "no activity"}
              </SectionLabel>
              <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
                {dateLabel}
              </h1>
              {effectiveStop && (
                <p className="mt-1 text-sm text-white/65">
                  {effectiveStop.name}
                  {usingBaseFallback && (
                    <span className="ml-1.5 text-[11px] uppercase tracking-wide text-white/45">
                      · base location
                    </span>
                  )}
                </p>
              )}
            </header>

            <ActivityPicker
              tripId={id}
              date={date}
              current={day.activity ?? null}
              suggested={effectiveStop?.activities ?? []}
              onChange={() => refresh()}
            />

            <WeatherCard
              tripId={id}
              stop={effectiveStop ?? null}
              weather={weather}
              onLocationSaved={() => refresh()}
            />

            <section className="flex flex-col gap-2.5">
              <SectionLabel>Crew kits</SectionLabel>
              {activeMembers.map((m) => (
                <MemberKitRow
                  key={m.id}
                  tripId={id}
                  date={date}
                  member={m}
                  kit={data.kits.find(
                    (k) => k.trip_member_id === m.id && data.days.find((d) => d.id === k.trip_day_id)?.date === date
                  )}
                  onChange={() => refresh()}
                />
              ))}
            </section>

            <div className="h-24" />
          </>
        )}
      </div>
    </PageLayout>
  );
}

function WeatherCard({
  tripId,
  stop,
  weather,
  onLocationSaved,
}: {
  tripId: string;
  stop: TripStop | null;
  weather: { tempF: number; precip: number; wind: number } | null;
  onLocationSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const search = useLocationSearch();

  const hasCoords = !!stop?.latitude && !!stop?.longitude;

  const save = async () => {
    const selected = search.selectedLocation;
    if (!selected) return;
    setSaving(true);
    try {
      const name = selected.region
        ? `${selected.name}, ${selected.region}`
        : `${selected.name}, ${selected.country}`;
      if (stop) {
        await fetch(`/api/v1/trips/${tripId}/stops/${stop.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            latitude: selected.latitude,
            longitude: selected.longitude,
          }),
        });
      } else {
        await fetch(`/api/v1/trips/${tripId}/stops`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            latitude: selected.latitude,
            longitude: selected.longitude,
            activities: [],
          }),
        });
      }
      search.reset();
      setEditing(false);
      onLocationSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3">
        <WeatherGlyph
          kind={weather ? inferWeatherKind(weather.tempF, weather.precip) : "cloud"}
          className="size-8"
        />
        <div className="flex-1">
          {weather ? (
            <>
              <p className="text-base font-semibold text-white">
                {Math.round(weather.tempF)}°F · {Math.round(weather.wind)} mph
              </p>
              <p className="text-xs text-white/55">
                {weather.precip > 0.6
                  ? "wet day · plan a shell"
                  : weather.precip > 0.3
                  ? "showers possible"
                  : "dry"}
              </p>
            </>
          ) : hasCoords ? (
            <p className="text-sm text-white/60">Loading forecast…</p>
          ) : (
            <p className="text-sm text-white/60">
              {stop
                ? "This stop has no coordinates yet."
                : "Set a base location to fetch the forecast."}
            </p>
          )}
        </div>
        {hasCoords ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-white/12 px-2 py-1 text-[11px] text-white/65 hover:bg-white/[0.08]"
          >
            {editing ? "Cancel" : "Change"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-cyan-300/45 bg-cyan-300/15 px-2.5 py-1 text-[11px] font-medium text-cyan-50 hover:bg-cyan-300/25"
          >
            Set location
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-3 border-t border-white/8 pt-3">
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
          <button
            type="button"
            onClick={save}
            disabled={!search.selectedLocation || saving}
            className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/14 bg-cyan-300/22 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save location
          </button>
          <p className="mt-1.5 text-xs text-white/45">
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
  onChange,
}: {
  tripId: string;
  date: string;
  current: string | null;
  suggested: string[];
  onChange: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string | null>(current);

  useEffect(() => {
    setValue(current);
  }, [current]);

  const merged = useMemo(() => {
    const set = new Set<string>(TRIP_ACTIVITY_OPTIONS);
    for (const a of suggested) set.add(a);
    if (current && !set.has(current)) set.add(current);
    return Array.from(set);
  }, [suggested, current]);

  const setActivity = async (next: string | null) => {
    setValue(next);
    setSaving(true);
    try {
      await fetch(`/api/v1/trips/${tripId}/days/${date}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity: next }),
      });
      onChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionLabel>Activity</SectionLabel>
        {saving && <Loader2 className="size-3.5 animate-spin text-white/45" />}
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
              className={
                "rounded-full border px-3 py-1 text-xs transition-colors " +
                (on
                  ? "border-cyan-300/55 bg-cyan-300/22 text-white"
                  : fromStop
                  ? "border-white/22 bg-white/[0.08] text-white/85"
                  : "border-white/14 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]")
              }
            >
              {a}
              {fromStop && !on && <span className="ml-1 text-white/40">·</span>}
            </button>
          );
        })}
      </div>
      {value === null && (
        <p className="mt-2 text-xs text-white/45">Tap a chip to set this day&apos;s activity.</p>
      )}
    </Card>
  );
}

function MemberKitRow({
  tripId,
  date,
  member,
  kit,
  onChange,
}: {
  tripId: string;
  date: string;
  member: TripMember;
  kit: TripMemberDayKit | undefined;
  onChange: () => void;
}) {
  const [effort, setEffort] = useState<TripEffort>(kit?.effort ?? "steady");
  const [items, setItems] = useState<string[]>(kit?.items ?? []);
  const [state, setState] = useState<TripKitState>(kit?.state ?? "ok");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEffort(kit?.effort ?? "steady");
    setItems(kit?.items ?? []);
    setState(kit?.state ?? "ok");
  }, [kit?.id, kit?.effort, kit?.items, kit?.state]);

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
      await fetch(`/api/v1/trips/${tripId}/days/${date}/kits/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onChange();
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
    <Card highlighted={state === "warn"}>
      <div className="flex flex-wrap items-center gap-3">
        <MemberAvatar
          name={member.display_name}
          size={28}
          state={member.role === "organizer" ? "self" : "default"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{member.display_name}</p>
          <p className="text-xs text-white/55">
            {state === "warn"
              ? "thin — borrow a layer?"
              : items.length === 0
              ? "no kit set"
              : `${items.length} layers picked`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {EFFORT_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setEffort(opt);
                persist({ effort: opt });
              }}
              className={
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide " +
                (effort === opt
                  ? "border-cyan-300/55 bg-cyan-300/22 text-white"
                  : "border-white/14 bg-white/[0.05] text-white/65")
              }
            >
              {opt}
            </button>
          ))}
        </div>
        {saving && <Loader2 className="size-3.5 animate-spin text-white/45" />}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {KIT_SLOTS.map((slot) => {
          const on = items.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              onClick={() => toggleItem(slot)}
              className={
                "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wide " +
                (on
                  ? "border-cyan-300/55 bg-cyan-300/15 text-white"
                  : "border-white/12 bg-transparent text-white/55")
              }
            >
              <GarmentGlyph kind={slot} className="size-3.5" />
              {slot}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {state === "warn" ? (
          <Chip variant="warn">needs help</Chip>
        ) : (
          <Chip>{state}</Chip>
        )}
        <button
          type="button"
          onClick={() => {
            const next: TripKitState = state === "warn" ? "ok" : "warn";
            setState(next);
            persist({ state: next });
          }}
          className="rounded-full border border-white/14 px-2.5 py-0.5 text-[10px] text-white/65 hover:text-white"
        >
          flag {state === "warn" ? "ok" : "warn"}
        </button>
      </div>
    </Card>
  );
}
