"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import PageLayout from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Card,
  Chip,
  GarmentGlyph,
  MemberAvatar,
  SectionLabel,
} from "@/components/trips/trip-primitives";
import { useTrip } from "@/hooks/useTrip";
import type { TripFull, TripMember, TripMemberDayKit } from "@/types/trips";

const REQUIRED_SLOTS = ["shirt", "midlayer", "shell", "pants", "gloves"];
const KIT_SLOT_LABEL: Record<string, string> = {
  shirt: "Base layer",
  midlayer: "Mid layer",
  jacket: "Insulation",
  shell: "Hard shell",
  pants: "Shell pants",
  gloves: "Gloves",
};

interface RollCallRow {
  member: TripMember;
  items: string[];
  ready: boolean;
  kit: TripMemberDayKit | undefined;
}

export default function RollCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useTrip(id);
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [selected, setSelected] = useState<TripMember | null>(null);

  const sendNudge = async (memberId: string, memberName: string) => {
    setSending(memberId);
    try {
      const res = await fetch(`/api/v1/trips/${id}/nudges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_member_id: memberId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed (${res.status})`);
      }
      setNudged((prev) => {
        const next = new Set(prev);
        next.add(memberId);
        return next;
      });
      toast.success(`Nudged ${memberName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to nudge");
    } finally {
      setSending(null);
    }
  };

  // Use the first day's kits as roll-call snapshot (the "trailhead" moment).
  const firstDay = data?.days[0];
  const rollCall: RollCallRow[] = useMemo(() => {
    if (!data || !firstDay) return [];
    return data.members
      .filter((m) => m.status !== "left")
      .map((m) => {
        const kit = data.kits.find(
          (k) => k.trip_day_id === firstDay.id && k.trip_member_id === m.id
        );
        const items = kit?.items ?? [];
        const missingRequired = REQUIRED_SLOTS.some((s) => !items.includes(s));
        const ready = items.length > 0 && !missingRequired && kit?.state !== "warn";
        return { member: m, items, ready, kit };
      });
  }, [data, firstDay]);

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
          <button
            type="button"
            key={row.member.id}
            onClick={() => setSelected(row.member)}
            aria-label={`View details for ${row.member.display_name}`}
            className="block w-full rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          >
            <Card highlighted={!row.ready}>
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
                  <span
                    role="button"
                    tabIndex={0}
                    aria-disabled={nudged.has(row.member.id) || sending === row.member.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (nudged.has(row.member.id) || sending === row.member.id) return;
                      sendNudge(row.member.id, row.member.display_name);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.stopPropagation();
                      e.preventDefault();
                      if (nudged.has(row.member.id) || sending === row.member.id) return;
                      sendNudge(row.member.id, row.member.display_name);
                    }}
                    className={
                      "inline-flex items-center gap-1 rounded-full border border-cyan-300/50 bg-cyan-300/22 px-2.5 py-0.5 text-xs text-white " +
                      (nudged.has(row.member.id) || sending === row.member.id
                        ? "opacity-60"
                        : "cursor-pointer")
                    }
                  >
                    {sending === row.member.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <BellRing className="size-3" />
                    )}
                    {nudged.has(row.member.id) ? "nudged" : "nudge"}
                  </span>
                )}
              </div>
            </Card>
          </button>
        ))}

        <div className="h-24" />
      </div>

      <MemberDetailDrawer
        member={selected}
        data={data}
        rollCall={rollCall}
        nudged={nudged}
        sending={sending}
        onClose={() => setSelected(null)}
        onNudge={sendNudge}
      />
    </PageLayout>
  );
}

function MemberDetailDrawer({
  member,
  data,
  rollCall,
  nudged,
  sending,
  onClose,
  onNudge,
}: {
  member: TripMember | null;
  data: TripFull | null;
  rollCall: RollCallRow[];
  nudged: Set<string>;
  sending: string | null;
  onClose: () => void;
  onNudge: (memberId: string, memberName: string) => void;
}) {
  const row = member ? rollCall.find((r) => r.member.id === member.id) : null;
  const assignedGear = useMemo(() => {
    if (!data || !member) return [];
    return data.gear
      .filter((g) => g.assignee_member_id === member.id)
      .map((g) => g.description);
  }, [data, member]);

  const missingSlots = useMemo(() => {
    if (!row) return [];
    return REQUIRED_SLOTS.filter((s) => !row.items.includes(s));
  }, [row]);

  return (
    <Drawer open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="border-t-white/12 bg-slate-950/96 text-white">
        {member && row && (
          <>
            <DrawerHeader className="px-5 text-left">
              <div className="flex items-center gap-3">
                <MemberAvatar
                  name={member.display_name}
                  size={44}
                  state={
                    member.role === "organizer"
                      ? "self"
                      : member.status === "guest"
                      ? "guest"
                      : member.status === "invited"
                      ? "invited"
                      : "default"
                  }
                />
                <div className="min-w-0 flex-1">
                  <DrawerTitle className="text-lg font-semibold text-white">
                    {member.display_name}
                  </DrawerTitle>
                  <DrawerDescription className="text-xs text-white/65">
                    {member.role} · {member.status}
                  </DrawerDescription>
                </div>
                <Chip variant={row.ready ? "default" : "warn"}>
                  {row.ready ? "ready" : "missing"}
                </Chip>
              </div>
            </DrawerHeader>

            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
              <section>
                <SectionLabel className="mb-2">Kit for departure day</SectionLabel>
                {row.items.length === 0 ? (
                  <p className="text-sm text-white/65">No kit picked yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {row.items.map((slot) => (
                      <li
                        key={slot}
                        className="flex items-center gap-2 text-sm text-white/85"
                      >
                        <GarmentGlyph kind={slot} className="size-4 text-white/80" />
                        {KIT_SLOT_LABEL[slot] ?? slot}
                      </li>
                    ))}
                  </ul>
                )}
                {row.kit?.effort && (
                  <div className="mt-2">
                    <Chip>{row.kit.effort} effort</Chip>
                  </div>
                )}
                {row.kit?.note && (
                  <p className="mt-2 text-xs italic text-white/55">{row.kit.note}</p>
                )}
              </section>

              {missingSlots.length > 0 && (
                <section>
                  <SectionLabel className="mb-2">Missing</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {missingSlots.map((slot) => (
                      <Chip key={slot} variant="warn">
                        {KIT_SLOT_LABEL[slot] ?? slot}
                      </Chip>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <SectionLabel className="mb-2">Group gear assigned</SectionLabel>
                {assignedGear.length === 0 ? (
                  <p className="text-sm text-white/55">None — pure-kit member.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {assignedGear.map((g) => (
                      <li
                        key={g}
                        className="flex items-center gap-2 text-sm text-white/85"
                      >
                        <Package className="size-4 text-white/72" />
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {!row.ready && member.role !== "organizer" && (
                <button
                  type="button"
                  onClick={() => onNudge(member.id, member.display_name)}
                  disabled={nudged.has(member.id) || sending === member.id}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/55 bg-cyan-300/22 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {sending === member.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <BellRing className="size-4" />
                  )}
                  {nudged.has(member.id) ? "Nudged" : `Nudge ${member.display_name}`}
                </button>
              )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
