"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Package, Settings, ShieldCheck, Users } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  MemberAvatar,
  SectionLabel,
  Spine,
  WeatherGlyph,
  daysBetween,
  formatDateRange,
} from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";
import type { TripDay, TripStop } from "@/types/trips";

const STOP_COLOR_CYCLE = ["cyan", "emerald", "amber"] as const;

export default function TripOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useTrip(id);

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <Link
            href="/trips"
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            All trips
          </Link>
          {data && (
            <Link
              href={`/trips/${id}/manage`}
              className="inline-flex items-center gap-1 rounded-full border border-white/14 bg-white/[0.06] px-3 py-1 text-xs text-white/80 hover:bg-white/10"
            >
              <Settings className="size-3.5" />
              Edit
            </Link>
          )}
        </div>

        {loading && (
          <>
            <Skeleton className="h-24 w-full rounded-2xl bg-white/12" />
            <Skeleton className="h-16 w-full rounded-2xl bg-white/12" />
            <Skeleton className="h-48 w-full rounded-2xl bg-white/12" />
          </>
        )}
        {error && (
          <div className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}

        {data && (
          <>
            <header>
              <SectionLabel>
                {data.stops[0]?.name ?? "no stop"} · {daysBetween(data.trip.start_date, data.trip.end_date)} days
              </SectionLabel>
              <h1 className="mt-1 text-[2.25rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
                {data.trip.name}
              </h1>
              <p className="mt-1 text-sm text-white/62">
                {formatDateRange(data.trip.start_date, data.trip.end_date)}
              </p>
            </header>

            <Card>
              <div className="flex flex-wrap items-center gap-2">
                {data.members
                  .filter((m) => m.status !== "left")
                  .map((m) => (
                    <MemberAvatar
                      key={m.id}
                      name={m.display_name}
                      state={m.role === "organizer" ? "self" : m.status === "guest" ? "guest" : m.status === "invited" ? "invited" : "default"}
                      size={32}
                    />
                  ))}
                <Link
                  href={`/trips/${id}/manage`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/14 bg-white/[0.06] px-2.5 py-1 text-xs text-white/80 hover:bg-white/10"
                >
                  + add
                </Link>
                <div className="ml-auto flex items-center gap-2">
                  <Link
                    href={`/trips/${id}/rollcall`}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-300/50 bg-cyan-300/22 px-2.5 py-1 text-xs text-white"
                  >
                    <ShieldCheck className="size-3.5" />
                    Roll call
                  </Link>
                </div>
              </div>
            </Card>

            <Card>
              <SectionLabel>
                {data.stops.length} {data.stops.length === 1 ? "stop" : "stops"}
              </SectionLabel>
              {data.stops.length === 0 ? (
                <p className="mt-2 text-sm text-white/55">No stops yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {data.stops.map((s, i) => (
                    <span key={s.id} className="flex items-center gap-1.5">
                      <span
                        className={
                          "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold " +
                          stopChipClass(i)
                        }
                      >
                        {s.name}
                      </span>
                      {i < data.stops.length - 1 && (
                        <span className="text-white/40">→</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <DayList trip={data.trip} days={data.days} stops={data.stops} />

            <Card>
              <SectionLabel>Crew tools</SectionLabel>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ToolLink href={`/trips/${id}/manage`} icon={Users} label="Manage crew" />
                <ToolLink href={`/trips/${id}/gear`} icon={Package} label="Group gear" />
                <ToolLink href={`/trips/${id}/pack`} icon={Package} label="My pack list" />
              </div>
            </Card>

            <div className="h-24" />
          </>
        )}
      </div>
    </PageLayout>
  );
}

function stopChipClass(i: number) {
  return [
    "border-cyan-300/55 bg-cyan-300/15 text-cyan-50",
    "border-emerald-300/55 bg-emerald-300/15 text-emerald-50",
    "border-amber-300/55 bg-amber-300/15 text-amber-50",
  ][i % 3];
}

function stopSpineColor(i: number): "cyan" | "emerald" | "amber" {
  return STOP_COLOR_CYCLE[i % STOP_COLOR_CYCLE.length];
}

function DayList({
  trip,
  days,
  stops,
}: {
  trip: { id: string };
  days: TripDay[];
  stops: TripStop[];
}) {
  const stopById = new Map(stops.map((s, i) => [s.id, { stop: s, index: i }]));
  const baseStop = stops[0];
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel className="mb-1">Daily plan</SectionLabel>
      {days.map((d, i) => {
        const prev = days[i - 1];
        const effectiveStopId = d.stop_id ?? baseStop?.id ?? null;
        const prevEffectiveStopId = prev ? prev.stop_id ?? baseStop?.id ?? null : null;
        const stopChange = !prev || prevEffectiveStopId !== effectiveStopId;
        const stopMeta = effectiveStopId ? stopById.get(effectiveStopId) : undefined;
        const colorIndex = stopMeta?.index ?? -1;
        const isBaseFallback = !d.stop_id && !!baseStop;
        return (
          <div key={d.id}>
            {stopChange && stopMeta && (
              <div className="mb-1.5 mt-2 flex items-center gap-2">
                <span
                  className={
                    "inline-block size-1.5 rounded-full " +
                    (colorIndex === 0
                      ? "bg-cyan-300"
                      : colorIndex === 1
                      ? "bg-emerald-300"
                      : "bg-amber-300")
                  }
                />
                <SectionLabel className="!text-white/60">
                  {stopMeta.stop.name}
                  {isBaseFallback && (
                    <span className="ml-1.5 text-[10px] tracking-wide text-white/40">
                      · base
                    </span>
                  )}
                </SectionLabel>
                <span className="h-px flex-1 bg-white/10" />
              </div>
            )}
            <Link href={`/trips/${trip.id}/days/${d.date}`}>
              <Card>
                <div className="flex items-center gap-3">
                  {colorIndex >= 0 && <Spine color={stopSpineColor(colorIndex)} />}
                  <div className="w-14 shrink-0">
                    <p className="text-xs text-white/55">
                      {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                      })}
                    </p>
                    <p className="text-base font-semibold text-white">
                      {new Date(`${d.date}T00:00:00`).getDate()}
                    </p>
                  </div>
                  <WeatherGlyph kind="cloud" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/85">
                      {d.activity ?? "no activity set"}
                    </p>
                    <p className="text-xs text-white/55">
                      {stopMeta
                        ? `${stopMeta.stop.name}${isBaseFallback ? " · base" : ""}`
                        : "Add a base location to enable forecasts"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-white/40" />
                </div>
              </Card>
            </Link>
          </div>
        );
      })}
      {days.length === 0 && (
        <p className="text-sm text-white/55">No days configured.</p>
      )}
    </div>
  );
}

function ToolLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Users;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2.5 text-sm text-white/85 hover:bg-white/[0.10]"
    >
      <Icon className="size-4 text-white/65" />
      {label}
      <ChevronRight className="ml-auto size-4 text-white/40" />
    </Link>
  );
}
