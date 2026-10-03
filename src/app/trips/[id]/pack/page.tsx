"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, Chip, SectionLabel } from "@/components/trips/trip-primitives";
import { cn } from "@/lib/utils";
import type { TripDayCoverage, TripPackResponse } from "@/types/trip-coverage";

const BODY_PART_LABEL: Record<string, string> = {
  torso: "Torso",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head & neck",
};

const LAYER_LABEL: Record<string, string> = {
  base: "Base",
  mid: "Mid",
  outer: "Outer",
};

const COVERAGE_ACTION_LABEL: Record<TripDayCoverage["action"], string> = {
  set_location: "Choose location", set_activity: "Choose activity", plan_manually: "Plan kit manually",
  retry_weather: "Retry weather", check_later: "Review day", review_day: "Review day",
};

function coverageActionLabel(day: TripDayCoverage) {
  return day.advice === "manual" ? "Review manual kit" : COVERAGE_ACTION_LABEL[day.action];
}

async function fetchPackList(tripId: string): Promise<TripPackResponse> {
  const res = await fetch(`/api/v1/trips/${tripId}/pack`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Failed (${res.status})`);
  }
  return (await res.json()) as TripPackResponse;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load pack list";
}

export default function PackListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TripPackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPackList(id)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(toErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      setData(await fetchPackList(id));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const sections = useMemo(() => {
    if (!data) return [];
    const list = data.packingList;
    const result: { name: string; items: { label: string; sub?: string; auto?: boolean }[] }[] = [];
    for (const bodyPart of ["torso", "legs", "hands", "headNeck"]) {
      const layers = list.byBodyPart[bodyPart as keyof typeof list.byBodyPart];
      if (!layers) continue;
      const items: { label: string; sub?: string; auto?: boolean }[] = [];
      for (const layer of ["base", "mid", "outer"] as const) {
        for (const entry of layers[layer]) {
          items.push({
            label: entry.specificItem,
            sub: `${LAYER_LABEL[layer]} · ${entry.standardOption}`,
            auto: entry.source === "auto",
          });
        }
      }
      if (items.length > 0) result.push({ name: BODY_PART_LABEL[bodyPart] ?? bodyPart, items });
    }
    return result;
  }, [data]);

  const gaps = data?.packingList.gaps ?? [];
  const extras = data?.packingList.extras ?? [];
  const groupGear = data?.groupGear ?? [];
  const needsReview = data?.coverage.filter((day) => day.advice !== "available" || day.forecast.status !== "available" || day.approximation) ?? [];

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <Link
          href={`/trips/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Trip
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-52">
            <SectionLabel>Your bag</SectionLabel>
            <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
              What to pack
            </h1>
            {data && (
              <p className="mt-1 text-sm text-white/75">
                General clothing guidance for {data.coveredDays} of {data.totalDays}{" "}
                {data.totalDays === 1 ? "day" : "days"} · activity + weather.
                Saved manual kits are reviewed separately.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            disabled={loading || refreshing}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.06] px-3 text-xs font-medium text-white/85 hover:bg-white/[0.10] disabled:opacity-50"
            aria-label="Regenerate pack list"
            aria-busy={refreshing}
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Regenerate
          </button>
        </header>

        {loading && <Skeleton className="h-48 w-full rounded-2xl bg-white/12" />}
        {error && (
          <div role="alert" className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}

        {data && needsReview.length > 0 && (
          <Card>
            <h2 className="text-base font-semibold text-white">Days to review</h2>
            <p className="mt-1 text-sm text-white/65">
              Weather availability and clothing guidance are separate. Partial forecasts and manual kits need your review.
            </p>
            <ul className="mt-3 divide-y divide-white/10">
              {needsReview.map((day) => (
                <li key={day.date} className="py-3 text-sm">
                  <p className="font-medium text-white/90">
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "short", month: "short", day: "numeric",
                    })} · {day.activity ?? "Activity not set"}
                  </p>
                  {day.stopName && <p className="break-words text-xs text-white/65">{day.stopName}</p>}
                  <p className="mt-1 text-white/75">{day.message}</p>
                  {day.message !== day.forecast.message && <p className="mt-1 text-xs text-white/65">{day.forecast.message}</p>}
                  {day.approximation && <p className="mt-1 text-xs text-white/75">{day.approximation}</p>}
                  <Link href={`/trips/${id}/days/${day.date}`}
                    className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-cyan-200 underline underline-offset-4"
                    aria-label={`${coverageActionLabel(day)} for ${day.date}`}>
                    {coverageActionLabel(day)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data && data.packingList.totalRequiredSlots === 0 && (
          <Card>
            <p className="text-sm text-white/75">
              No automatic clothing list is available. Review the days above for missing inputs,
              forecast availability or manual planning. Group gear is listed separately when assigned.
            </p>
          </Card>
        )}

        {sections.map((s) => (
          <Card key={s.name}>
            <h3 className="text-base font-semibold text-white">{s.name}</h3>
            <ul className="mt-2 space-y-1.5">
              {s.items.map((it, i) => (
                <li
                  key={`${s.name}-${i}`}
                  className="flex items-start gap-2 text-sm text-white/85"
                >
                  <ListMarker className="mt-2" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {it.label}
                      {it.auto && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-cyan-300/85">
                          from your closet
                        </span>
                      )}
                    </p>
                    {it.sub && <p className="text-xs text-white/45">{it.sub}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {gaps.length > 0 && (
          <Card>
            <SectionLabel className="mb-1">Gaps you don&apos;t own yet</SectionLabel>
            <p className="text-xs text-white/55">
              Clothing slots the general guidance called for that nothing in your wardrobe
              maps to. Add an item in the Wardrobe tab to fill these in.
            </p>
            <ul className="mt-2 space-y-1.5">
              {gaps.map((gap) => (
                <li key={gap.mappingKey} className="flex items-center gap-2 text-sm text-white/85">
                  <AlertTriangle className="size-3.5 text-orange-300" />
                  <span className="flex-1">
                    {gap.standardOption}{" "}
                    <span className="text-xs text-white/50">
                      · {BODY_PART_LABEL[gap.bodyPart] ?? gap.bodyPart} / {LAYER_LABEL[gap.layerType] ?? gap.layerType}
                    </span>
                  </span>
                  <Chip variant={gap.priorityLabel === "high" ? "warn" : "outline"}>
                    {gap.priorityLabel}
                  </Chip>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {extras.length > 0 && (
          <Card>
            <h3 className="text-base font-semibold text-white">Carry items</h3>
            <ul className="mt-2 space-y-1.5">
              {extras.map((x) => (
                <li key={x} className="flex items-center gap-2 text-sm text-white/85">
                  <ListMarker />
                  {x}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {groupGear.length > 0 && (
          <Card>
            <h3 className="text-base font-semibold text-white">Group gear (yours)</h3>
            <ul className="mt-2 space-y-1.5">
              {groupGear.map((g) => (
                <li key={g} className="flex items-center gap-2 text-sm text-white/85">
                  <ListMarker />
                  {g}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="h-24" />
      </div>
    </PageLayout>
  );
}

/** A plain bullet, not a checkbox: nothing records what's been packed yet. */
function ListMarker({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 shrink-0 rounded-full bg-white/45", className)}
    />
  );
}
