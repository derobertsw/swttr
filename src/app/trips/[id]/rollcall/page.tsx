"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  Chip,
  GarmentGlyph,
  MemberAvatar,
  SectionLabel,
} from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";

const REQUIRED_SLOTS = ["shirt", "midlayer", "shell", "pants", "gloves"];

export default function RollCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useTrip(id);
  const [poked, setPoked] = useState<Set<string>>(new Set());

  // Use the first day's kits as roll-call snapshot (the "trailhead" moment).
  const rollCall = useMemo(() => {
    if (!data || data.days.length === 0) return [];
    const firstDay = data.days[0];
    return data.members
      .filter((m) => m.status !== "left")
      .map((m) => {
        const kit = data.kits.find(
          (k) => k.trip_day_id === firstDay.id && k.trip_member_id === m.id
        );
        const items = kit?.items ?? [];
        const missingRequired = REQUIRED_SLOTS.some((s) => !items.includes(s));
        const ready = items.length > 0 && !missingRequired && kit?.state !== "warn";
        return { member: m, items, ready };
      });
  }, [data]);

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
        <header>
          <SectionLabel>Departure day</SectionLabel>
          <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
            Roll call
          </h1>
          <p className="mt-1 text-sm text-white/62">Are we leaving? Visual readiness check.</p>
        </header>

        {loading && <Skeleton className="h-32 w-full rounded-2xl bg-white/12" />}
        {error && (
          <div className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}

        {data && rollCall.length === 0 && (
          <Card>
            <p className="text-sm text-white/65">No crew on this trip yet.</p>
          </Card>
        )}

        {rollCall.map((row) => (
          <Card key={row.member.id} highlighted={!row.ready}>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={
                  "inline-block size-2.5 shrink-0 rounded-full " +
                  (row.ready ? "bg-emerald-300" : "bg-orange-300")
                }
                aria-hidden
              />
              <MemberAvatar name={row.member.display_name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {row.member.display_name}
                </p>
                <p className="text-xs text-white/55">
                  {row.ready ? "ready" : "kit incomplete"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {row.items.length === 0 ? (
                  <span className="text-xs text-white/45">no kit</span>
                ) : (
                  row.items.slice(0, 6).map((slot) => (
                    <GarmentGlyph key={slot} kind={slot} />
                  ))
                )}
              </div>
              <Chip variant={row.ready ? "default" : "warn"}>
                {row.ready ? "ready" : "missing"}
              </Chip>
              {!row.ready && row.member.role !== "organizer" && (
                <button
                  type="button"
                  onClick={() =>
                    setPoked((s) => {
                      const next = new Set(s);
                      next.add(row.member.id);
                      return next;
                    })
                  }
                  disabled={poked.has(row.member.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-300/50 bg-cyan-300/22 px-2.5 py-0.5 text-xs text-white disabled:opacity-60"
                >
                  <BellRing className="size-3" />
                  {poked.has(row.member.id) ? "poked" : "poke"}
                </button>
              )}
            </div>
          </Card>
        ))}

        <div className="h-24" />
      </div>
    </PageLayout>
  );
}
