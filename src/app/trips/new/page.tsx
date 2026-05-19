"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Calendar as CalIcon, GripVertical, Loader2, MapPin, Plus, UserPlus, X } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Calendar } from "@/components/ui/calendar";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import {
  Card,
  Chip,
  InviteLinkButton,
  MemberAvatar,
  SectionLabel,
  daysBetween,
  formatDateRange,
} from "@/components/trips/trip-primitives";
import type { DateRange } from "react-day-picker";
import type { Trip, TripMember, TripStop } from "@/types/trips";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";

type Step = 1 | 2 | 3 | 4;

export default function NewTripPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After we create the trip on step-2 enter, refresh the auto-seeded organizer.
  useEffect(() => {
    if (!trip) return;
    fetch(`/api/v1/trips/${trip.id}`)
      .then((r) => r.json())
      .then((data: { members: TripMember[]; stops: TripStop[] }) => {
        if (data.members) setMembers(data.members);
        if (data.stops) setStops(data.stops);
      })
      .catch(() => {});
  }, [trip]);

  const createTrip = async () => {
    if (!range?.from || !range?.to || !name.trim()) {
      setError("Add a trip name and pick a date range.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          start_date: range.from.toISOString().slice(0, 10),
          end_date: range.to.toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as { trip: Trip };
      setTrip(data.trip);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <StepHeader step={step} />
        {error && (
          <div className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100">
            {error}
          </div>
        )}
        {step === 1 && (
          <Step1Dates
            name={name}
            onNameChange={setName}
            range={range}
            onRangeChange={setRange}
            submitting={submitting}
            onNext={createTrip}
            onBack={() => router.push("/trips")}
          />
        )}
        {step === 2 && trip && (
          <Step2Stops
            trip={trip}
            stops={stops}
            onStopsChange={setStops}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && trip && (
          <Step3Members
            trip={trip}
            members={members}
            onMembersChange={setMembers}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && trip && (
          <Step4Review
            trip={trip}
            stops={stops}
            members={members}
            onBack={() => setStep(3)}
            onDone={() => router.push(`/trips/${trip.id}`)}
          />
        )}
        <div className="h-24" />
      </div>
    </PageLayout>
  );
}

function StepHeader({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    1: "Step 1 of 4 · pick dates",
    2: "Step 2 of 4 · add stops",
    3: "Step 3 of 4 · invite crew",
    4: "Step 4 of 4 · review",
  };
  const titles: Record<Step, string> = {
    1: "When?",
    2: "Where?",
    3: "Your crew",
    4: "All set?",
  };
  return (
    <header>
      <SectionLabel>{labels[step]}</SectionLabel>
      <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
        {titles[step]}
      </h1>
      <div className="mt-3 flex items-center gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={
              "h-1 flex-1 rounded-full " +
              (i <= step ? "bg-cyan-300/70" : "bg-white/10")
            }
          />
        ))}
      </div>
    </header>
  );
}

function Step1Dates({
  name,
  onNameChange,
  range,
  onRangeChange,
  submitting,
  onNext,
  onBack,
}: {
  name: string;
  onNameChange: (v: string) => void;
  range: DateRange | undefined;
  onRangeChange: (r: DateRange | undefined) => void;
  submitting: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const days =
    range?.from && range?.to
      ? daysBetween(range.from.toISOString().slice(0, 10), range.to.toISOString().slice(0, 10))
      : 0;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionLabel className="mb-2">Trip name</SectionLabel>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Whistler Powder"
          className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2.5 text-base text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
        />
      </Card>
      <Card>
        <SectionLabel className="mb-2">Dates</SectionLabel>
        <p className="mb-3 text-sm text-white/62">Drag across days to pick a range.</p>
        <div className="rounded-xl border border-white/10 bg-slate-950/30 p-2">
          <Calendar
            mode="range"
            selected={range}
            onSelect={onRangeChange}
            numberOfMonths={1}
            className="bg-transparent text-white"
          />
        </div>
        {range?.from && range?.to && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/12 bg-white/[0.05] px-3.5 py-2.5">
            <div>
              <SectionLabel>Start</SectionLabel>
              <p className="text-sm font-semibold text-white">
                {range.from.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </div>
            <ArrowRight className="size-4 text-white/55" />
            <div>
              <SectionLabel>End</SectionLabel>
              <p className="text-sm font-semibold text-white">
                {range.to.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </div>
            <Chip variant="accent">{days} day{days === 1 ? "" : "s"}</Chip>
          </div>
        )}
      </Card>
      <NavBar
        onBack={onBack}
        backLabel="Cancel"
        onNext={onNext}
        nextLabel={submitting ? "Saving…" : "Next"}
        nextDisabled={submitting || !name.trim() || !range?.from || !range?.to}
        nextLoading={submitting}
      />
    </div>
  );
}

function Step2Stops({
  trip,
  stops,
  onStopsChange,
  onNext,
  onBack,
}: {
  trip: Trip;
  stops: TripStop[];
  onStopsChange: (stops: TripStop[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<TripStop | null>(null);
  const [adding, setAdding] = useState(false);
  const search = useLocationSearch();

  const addStop = async () => {
    const selected = search.selectedLocation;
    if (!selected) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/v1/trips/${trip.id}/stops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selected.region
            ? `${selected.name}, ${selected.region}`
            : `${selected.name}, ${selected.country}`,
          latitude: selected.latitude,
          longitude: selected.longitude,
          activities: [],
        }),
      });
      const data = (await res.json()) as { stop?: TripStop };
      if (data.stop) onStopsChange([...stops, data.stop]);
      search.reset();
    } finally {
      setAdding(false);
    }
  };

  const removeStop = async (stopId: string) => {
    await fetch(`/api/v1/trips/${trip.id}/stops/${stopId}`, { method: "DELETE" });
    onStopsChange(stops.filter((s) => s.id !== stopId));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionLabel className="mb-2">Add a stop</SectionLabel>
        <LocationAutocomplete
          id="trip-stop-search"
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
          onClick={addStop}
          disabled={!search.selectedLocation || adding}
          className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.08] px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add stop
        </button>
      </Card>

      {stops.length > 0 && (
        <Card>
          <SectionLabel className="mb-2">Trip stops</SectionLabel>
          <div className="flex flex-col gap-2">
            {stops.map((stop, i) => (
              <div
                key={stop.id}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5"
              >
                <GripVertical className="size-4 text-white/40" />
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/22 text-[11px] font-semibold text-white">
                  {i + 1}
                </span>
                <MapPin className="size-4 text-white/65" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{stop.name}</p>
                  <p className="text-xs text-white/55">
                    {stop.activities.length === 0
                      ? "no activities yet"
                      : stop.activities.join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(stop)}
                  className="rounded-md border border-white/14 px-2 py-1 text-xs text-white/75 hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeStop(stop.id)}
                  aria-label="Remove stop"
                  className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <NavBar
        onBack={onBack}
        onNext={onNext}
        nextLabel="Next"
        nextDisabled={stops.length === 0}
      />

      {editing && (
        <StopDetailSheet
          tripId={trip.id}
          stop={editing}
          tripStart={trip.start_date}
          tripEnd={trip.end_date}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            onStopsChange(stops.map((s) => (s.id === updated.id ? updated : s)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function StopDetailSheet({
  tripId,
  stop,
  tripStart,
  tripEnd,
  onClose,
  onSaved,
}: {
  tripId: string;
  stop: TripStop;
  tripStart: string;
  tripEnd: string;
  onClose: () => void;
  onSaved: (s: TripStop) => void;
}) {
  const [activities, setActivities] = useState<string[]>(stop.activities);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Enumerate dates inline (avoids importing server lib into client bundle).
  const tripDates: string[] = (() => {
    const out: string[] = [];
    for (
      let d = new Date(`${tripStart}T00:00:00Z`);
      d <= new Date(`${tripEnd}T00:00:00Z`);
      d = new Date(d.getTime() + 86400000)
    ) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  })();

  const toggleActivity = (a: string) =>
    setActivities((curr) =>
      curr.includes(a) ? curr.filter((x) => x !== a) : [...curr, a]
    );
  const toggleDate = (iso: string) =>
    setSelectedDates((curr) =>
      curr.includes(iso) ? curr.filter((d) => d !== iso) : [...curr, iso]
    );

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/trips/${tripId}/stops/${stop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activities, day_dates: selectedDates }),
      });
      const data = (await res.json()) as { stop?: TripStop };
      if (data.stop) onSaved(data.stop);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit stop ${stop.name}`}
      onClick={() => !saving && onClose()}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/55 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-t-3xl border-t border-white/14 bg-slate-950/95 px-5 pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:rounded-3xl sm:pb-6"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/22" />
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel>Stop detail</SectionLabel>
            <p className="text-base font-semibold text-white">{stop.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-white/55 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4">
          <SectionLabel>Which days at this stop?</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {tripDates.map((iso) => {
              const date = new Date(`${iso}T00:00:00`);
              const dow = date.toLocaleDateString(undefined, { weekday: "short" });
              const day = date.getDate();
              const on = selectedDates.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDate(iso)}
                  className={
                    "flex w-14 flex-col items-center rounded-lg border px-2 py-1.5 text-center text-xs transition-colors " +
                    (on
                      ? "border-cyan-300/55 bg-cyan-300/15 text-white"
                      : "border-white/14 bg-white/[0.05] text-white/72")
                  }
                >
                  <span className="text-[10px] uppercase tracking-wide text-white/55">{dow}</span>
                  <span className="text-base font-semibold leading-none">{day}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <SectionLabel>Activities at this stop</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {TRIP_ACTIVITY_OPTIONS.map((a) => {
              const on = activities.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleActivity(a)}
                  className={
                    "rounded-full border px-3 py-1 text-xs " +
                    (on
                      ? "border-cyan-300/55 bg-cyan-300/22 text-white"
                      : "border-white/16 bg-white/[0.05] text-white/72")
                  }
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-cyan-300/22 text-sm font-semibold text-white"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save stop
        </button>
      </div>
    </div>
  );
}

function Step3Members({
  trip,
  members,
  onMembersChange,
  onNext,
  onBack,
}: {
  trip: Trip;
  members: TripMember[];
  onMembersChange: (m: TripMember[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"invite" | "guest">("invite");
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/v1/trips/${trip.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name.trim(), kind }),
      });
      const data = (await res.json()) as { member?: TripMember };
      if (data.member) onMembersChange([...members, data.member]);
      setName("");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (memberId: string) => {
    await fetch(`/api/v1/trips/${trip.id}/members/${memberId}`, { method: "DELETE" });
    onMembersChange(members.filter((m) => m.id !== memberId));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionLabel className="mb-2">On the trip</SectionLabel>
        <p className="text-xs text-white/55">Solo? You can skip this step.</p>
        <div className="mt-3 flex flex-col gap-2">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              tripName={trip.name}
              onRemove={m.role === "organizer" ? undefined : () => remove(m.id)}
            />
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel className="mb-2">Add someone</SectionLabel>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            className="h-10 flex-1 rounded-lg border border-white/12 bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={!name.trim() || adding}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.08] px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Add
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setKind("invite")}
            className={
              "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors " +
              (kind === "invite"
                ? "border-cyan-300/55 bg-cyan-300/15 text-white"
                : "border-white/14 bg-white/[0.05] text-white/72")
            }
          >
            Share link · they make an account
          </button>
          <button
            type="button"
            onClick={() => setKind("guest")}
            className={
              "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors " +
              (kind === "guest"
                ? "border-cyan-300/55 bg-cyan-300/15 text-white"
                : "border-white/14 bg-white/[0.05] text-white/72")
            }
          >
            Guest · no signup, uses generics
          </button>
        </div>
      </Card>

      <NavBar onBack={onBack} onNext={onNext} nextLabel="Next" nextDisabled={false} />
    </div>
  );
}

function MemberRow({
  member,
  onRemove,
  tripName,
}: {
  member: TripMember;
  onRemove?: () => void;
  tripName?: string;
}) {
  const state: "default" | "guest" | "invited" | "self" =
    member.role === "organizer"
      ? "self"
      : member.status === "guest"
      ? "guest"
      : member.status === "invited"
      ? "invited"
      : "default";
  const sub =
    member.role === "organizer"
      ? "organizer"
      : member.status === "guest"
      ? "guest · using generics"
      : member.status === "invited"
      ? "invited · pending"
      : "joined";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <MemberAvatar name={member.display_name} state={state} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{member.display_name}</p>
        <p className="text-xs text-white/55">{sub}</p>
      </div>
      {member.status === "invited" && member.invite_token && (
        <InviteLinkButton
          token={member.invite_token}
          recipientName={member.display_name}
          tripName={tripName}
        />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
          aria-label="Remove member"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function Step4Review({
  trip,
  stops,
  members,
  onBack,
  onDone,
}: {
  trip: Trip;
  stops: TripStop[];
  members: TripMember[];
  onBack: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionLabel>Trip</SectionLabel>
        <p className="mt-1 text-base font-semibold text-white">{trip.name}</p>
        <p className="mt-0.5 text-sm text-white/65">
          <CalIcon className="mr-1 inline size-3.5" />
          {formatDateRange(trip.start_date, trip.end_date)} ·{" "}
          {daysBetween(trip.start_date, trip.end_date)} days
        </p>
      </Card>
      <Card>
        <SectionLabel>Stops ({stops.length})</SectionLabel>
        {stops.length === 0 ? (
          <p className="mt-2 text-sm text-white/55">No stops yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {stops.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 text-sm text-white/85">
                <span className="text-xs text-white/45">{i + 1}.</span>
                <MapPin className="size-3.5 text-white/55" />
                {s.name}
                {s.activities.length > 0 && (
                  <span className="text-xs text-white/55">· {s.activities.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <SectionLabel>Crew ({members.length})</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <MemberAvatar
                name={m.display_name}
                state={m.role === "organizer" ? "self" : "default"}
                size={28}
              />
              <span className="text-sm text-white/80">{m.display_name}</span>
            </div>
          ))}
        </div>
      </Card>
      <NavBar onBack={onBack} onNext={onDone} nextLabel="Open trip" />
    </div>
  );
}

function NavBar({
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel,
  nextDisabled = false,
  nextLoading = false,
}: {
  onBack: () => void;
  backLabel?: string;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/14 px-4 text-sm font-medium text-white/85 hover:bg-white/10"
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="ml-auto inline-flex h-11 min-w-32 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-gradient-to-b from-cyan-300/22 to-cyan-300/10 px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(0,0,0,0.32)] disabled:opacity-50"
      >
        {nextLoading ? <Loader2 className="size-4 animate-spin" /> : null}
        {nextLabel}
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}
