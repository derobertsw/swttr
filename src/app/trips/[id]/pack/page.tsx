"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, Chip, SectionLabel } from "@/components/trips/trip-primitives";
import type { PackingListData } from "@/lib/packingList";

interface TripPackResponse {
  trip: { id: string; name: string; start_date: string; end_date: string };
  coveredDays: number;
  totalDays: number;
  skipped: { date: string; reason: string }[];
  packingList: PackingListData;
  groupGear: string[];
}

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

const SKIP_REASON_LABEL: Record<string, string> = {
  no_stop: "trip has no base location yet",
  no_coords: "base location missing coordinates",
  no_activity: "no activity set",
  activity_unsupported: "activity not yet supported by the engine",
};

export default function PackListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TripPackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/v1/trips/${id}/pack`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed (${res.status})`);
      }
      const body = (await res.json()) as TripPackResponse;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pack list");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
  const skipped = data?.skipped ?? [];

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
        <header className="flex items-start justify-between gap-3">
          <div>
            <SectionLabel>Your bag</SectionLabel>
            <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
              What to pack
            </h1>
            {data && (
              <p className="mt-1 text-sm text-white/62">
                Auto-generated from {data.coveredDays} of {data.totalDays}{" "}
                {data.totalDays === 1 ? "day" : "days"} · activity + weather.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              load();
            }}
            disabled={refreshing}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.06] px-3 text-xs font-medium text-white/85 hover:bg-white/[0.10] disabled:opacity-50"
            aria-label="Regenerate pack list"
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
          <div className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}

        {data && sections.length === 0 && (
          <Card>
            <p className="text-sm text-white/65">
              Nothing to pack yet — assign activities and a base location to your trip days and the
              list will populate.
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
                  <span className="mt-1 inline-block size-3 shrink-0 rounded-sm border border-white/22" />
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
              Standard slots the recommendation engine called for that nothing in your wardrobe
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
                  <span className="inline-block size-3 rounded-sm border border-white/22" />
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
                  <span className="inline-block size-3 rounded-sm border border-white/22" />
                  {g}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {skipped.length > 0 && (
          <Card>
            <SectionLabel className="mb-1">Days not covered</SectionLabel>
            <ul className="mt-2 space-y-1 text-xs text-white/55">
              {skipped.map((s) => (
                <li key={s.date}>
                  {new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {SKIP_REASON_LABEL[s.reason] ?? s.reason}
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
