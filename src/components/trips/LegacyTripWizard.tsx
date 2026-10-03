"use client";

import { Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Calendar as CalIcon, CheckCircle2, GripVertical, Loader2, MapPin, Plus, UserPlus, X } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
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
import { errorMessage, fetchTripFull, tripRequest } from "@/lib/trip-requests";
import type { DateRange } from "react-day-picker";
import type { Trip, TripMember, TripStop } from "@/types/trips";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";

type Step = 1 | 2 | 3 | 4;

type TripBasics = Pick<Trip, "name" | "start_date" | "end_date">;

/** A picked calendar day as a trip date. The calendar picks local days, so this doesn't go through UTC. */
function toTripDate(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

/** A trip date as the local day the calendar shows. */
function fromTripDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

/** The step in a reopened trip's URL. A trip is created on step 1, so it defaults to step 2. */
function parseStep(value: string | null): Step {
  const step = Number(value);
  return step === 1 || step === 3 || step === 4 ? step : 2;
}

function draftBasics(name: string, range: DateRange | undefined): TripBasics | null {
  if (!name.trim() || !range?.from || !range?.to) return null;
  return { name: name.trim(), start_date: toTripDate(range.from), end_date: toTripDate(range.to) };
}

function changedBasics(trip: Trip, basics: TripBasics): Partial<TripBasics> {
  const changes: Partial<TripBasics> = {};
  for (const key of ["name", "start_date", "end_date"] as const) {
    if (basics[key] !== trip[key]) changes[key] = basics[key];
  }
  return changes;
}

export default function LegacyTripWizard() {
  return (
    <PageLayout chromeVariant="compact">
      {/* useSearchParams needs a Suspense boundary for the page to prerender. */}
      <Suspense fallback={<WizardSkeleton />}>
        <NewTripWizard />
      </Suspense>
    </PageLayout>
  );
}

function WizardSkeleton() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <Skeleton className="h-20 w-full rounded-2xl bg-white/12" />
      <Skeleton className="h-64 w-full rounded-2xl bg-white/12" />
    </div>
  );
}

function NewTripWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Once the trip is created, its id and the current step go in the URL, so a
  // refresh reopens that trip instead of starting a second one.
  const [resume] = useState(() => ({
    tripId: searchParams.get("trip"),
    step: parseStep(searchParams.get("step")),
  }));
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [reopening, setReopening] = useState(resume.tripId !== null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resume.tripId) return;
    let cancelled = false;
    fetchTripFull(resume.tripId)
      .then((full) => {
        if (cancelled) return;
        setTrip(full.trip);
        setName(full.trip.name);
        setRange({ from: fromTripDate(full.trip.start_date), to: fromTripDate(full.trip.end_date) });
        setStops(full.stops);
        setMembers(full.members);
        setStep(resume.step);
      })
      .catch((err) => {
        if (!cancelled) setError(`Couldn't reopen your trip: ${errorMessage(err)}`);
      })
      .finally(() => {
        if (!cancelled) setReopening(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resume]);

  const tripId = trip?.id;
  useEffect(() => {
    if (tripId) window.history.replaceState(null, "", `/trips/new?trip=${tripId}&step=${step}`);
  }, [tripId, step]);

  const draft = draftBasics(name, range);
  const hasUnsavedBasics = !trip || !draft || Object.keys(changedBasics(trip, draft)).length > 0;

  const saveBasics = async () => {
    if (!draft) {
      setError("Add a trip name and pick a date range.");
      return;
    }
    if (!hasUnsavedBasics) {
      setError(null);
      setStep(2);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (trip) {
        // Coming back to step 1 edits the trip that's already saved.
        const { trip: updated } = await tripRequest<{ trip: Trip }>(
          `/api/v1/trips/${trip.id}`,
          "PATCH",
          changedBasics(trip, draft)
        );
        setTrip(updated);
      } else {
        const { trip: created } = await tripRequest<{ trip: Trip }>("/api/v1/trips", "POST", draft);
        setTrip(created);
        // Creating a trip adds its organizer to the crew. The trip is saved
        // even if loading them fails, so that doesn't stop the flow.
        const full = await fetchTripFull(created.id).catch(() => null);
        if (full) setMembers(full.members);
      }
      setStep(2);
    } catch (err) {
      setError(
        `${trip ? "Couldn't save your changes" : "Couldn't create the trip"}: ${errorMessage(err)}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (reopening) return <WizardSkeleton />;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <StepHeader step={step} />
      {trip && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-white/62">
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-300" />
          Saved to your trips. Stops and crew save as you add them.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-orange-400/35 bg-orange-300/10 px-4 py-3 text-sm text-orange-100"
        >
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
          nextLabel={!trip ? "Create trip" : hasUnsavedBasics ? "Save changes" : "Next"}
          onNext={saveBasics}
          backLabel={trip ? "Exit" : "Cancel"}
          onBack={() => router.push(trip ? `/trips/${trip.id}` : "/trips")}
        />
      )}
      {step === 2 && trip && (
        <TripStopsEditor
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
  nextLabel,
  onNext,
  backLabel,
  onBack,
}: {
  name: string;
  onNameChange: (v: string) => void;
  range: DateRange | undefined;
  onRangeChange: (r: DateRange | undefined) => void;
  submitting: boolean;
  nextLabel: string;
  onNext: () => void;
  backLabel: string;
  onBack: () => void;
}) {
  const days =
    range?.from && range?.to ? daysBetween(toTripDate(range.from), toTripDate(range.to)) : 0;
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
        backDisabled={submitting}
        backLabel={backLabel}
        onNext={onNext}
        nextLabel={submitting ? "Saving…" : nextLabel}
        nextDisabled={submitting || !name.trim() || !range?.from || !range?.to}
        nextLoading={submitting}
      />
    </div>
  );
}

export function TripStopsEditor({
  trip,
  stops,
  onStopsChange,
  onNext,
  onBack,
  nextLabel = "Next",
  backLabel = "Back",
}: {
  trip: Trip;
  stops: TripStop[];
  onStopsChange: Dispatch<SetStateAction<TripStop[]>>;
  onNext: () => void;
  onBack: () => void;
  nextLabel?: string;
  backLabel?: string;
}) {
  const [editing, setEditing] = useState<TripStop | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const search = useLocationSearch();

  const addStop = async () => {
    const selected = search.selectedLocation;
    if (!selected) return;
    setAdding(true);
    try {
      const { stop } = await tripRequest<{ stop: TripStop }>(
        `/api/v1/trips/${trip.id}/stops`,
        "POST",
        {
          name: selected.region
            ? `${selected.name}, ${selected.region}`
            : `${selected.name}, ${selected.country}`,
          latitude: selected.latitude,
          longitude: selected.longitude,
          activities: [],
        }
      );
      onStopsChange((current) => [...current, stop]);
      search.reset();
    } catch (err) {
      // The chosen place stays in the field, so Add stop can be tried again.
      toast.error("Couldn't add the stop", { description: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  const removeStop = async (stopId: string) => {
    setRemovingId(stopId);
    try {
      await tripRequest(`/api/v1/trips/${trip.id}/stops/${stopId}`, "DELETE");
      onStopsChange((current) => current.filter((s) => s.id !== stopId));
    } catch (err) {
      toast.error("Couldn't remove the stop", { description: errorMessage(err) });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionLabel className="mb-2">Add a stop</SectionLabel>
        <LocationAutocomplete
          id="trip-stop-search"
          label="Destination"
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
                  onClick={(event) => { editButton.current = event.currentTarget; setEditing(stop); }}
                  className="min-h-11 min-w-11 rounded-md border border-white/14 px-2 py-1 text-xs text-white/75 hover:bg-white/10"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeStop(stop.id)}
                  disabled={removingId !== null}
                  aria-label={`Remove ${stop.name}`}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {removingId === stop.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        {stops.length === 0
          ? "Your first destination becomes the base for all days without an assigned stop."
          : "Adding a stop keeps your daily plan unchanged. Edit the stop to choose which days use it."}
      </p>
      {/* Leaving mid-save would lose the chosen place if that save failed. */}
      <NavBar
        onBack={onBack}
        backDisabled={adding || removingId !== null}
        backLabel={backLabel}
        onNext={onNext}
        nextLabel={nextLabel}
        nextDisabled={adding || removingId !== null || stops.length === 0}
      />

      {editing && (
        <StopDetailSheet
          tripId={trip.id}
          stop={editing}
          tripStart={trip.start_date}
          tripEnd={trip.end_date}
          onClose={() => setEditing(null)}
          returnFocus={() => editButton.current?.focus()}
          onSaved={(updated) => {
            onStopsChange((current) => current.map((s) => (s.id === updated.id ? updated : s)));
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
  returnFocus,
}: {
  tripId: string;
  stop: TripStop;
  tripStart: string;
  tripEnd: string;
  onClose: () => void;
  onSaved: (s: TripStop) => void;
  returnFocus: () => void;
}) {
  const [activities, setActivities] = useState<string[]>(stop.activities);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [assignedDates, setAssignedDates] = useState<string[] | null>(null);
  const [assignmentLoadError, setAssignmentLoadError] = useState<string | null>(null);
  const [assignmentLoadAttempt, setAssignmentLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  // Read the current assignments each time the editor opens, including after
  // a save or a date change in the legacy wizard.
  useEffect(() => {
    let cancelled = false;
    fetchTripFull(tripId)
      .then((full) => {
        if (!cancelled) setAssignedDates(full.days.filter((day) => day.stop_id === stop.id).map((day) => day.date));
      })
      .catch((err) => {
        if (!cancelled) setAssignmentLoadError(errorMessage(err));
      });
    return () => { cancelled = true; };
  }, [tripId, stop.id, assignmentLoadAttempt]);

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
    if (assignedDates === null) return;
    setSaving(true);
    try {
      const { stop: updated } = await tripRequest<{ stop: TripStop }>(
        `/api/v1/trips/${tripId}/stops/${stop.id}`,
        "PATCH",
        { activities, day_dates: selectedDates }
      );
      onSaved(updated);
    } catch (err) {
      // The sheet stays open with its picks, so Save stop can be tried again.
      toast.error("Couldn't save the stop", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }} showCloseButton={!saving} aria-label={`Edit stop ${stop.name}`} className="bg-slate-950 text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit stop {stop.name}</DialogTitle>
          <DialogDescription>Choose exactly which days to assign. Other days keep their destinations.</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <SectionLabel>Assign days to this stop</SectionLabel>
          {assignmentLoadError ? (
            <div role="alert" className="mt-2 text-sm text-orange-100">
              <p>Couldn&apos;t load saved day assignments: {assignmentLoadError}</p>
              <button type="button" className="mt-2 min-h-11 underline" onClick={() => { setAssignmentLoadError(null); setAssignmentLoadAttempt((attempt) => attempt + 1); }}>Retry loading days</button>
            </div>
          ) : assignedDates === null ? <p role="status" className="mt-2 text-sm text-white/75">Loading saved day assignments…</p> : null}
          {assignedDates && assignedDates.length > 0 && (
            <p className="mt-2 text-sm text-white/75">Already assigned to {stop.name}: {assignedDates.slice().sort().join(", ")}. To move these days, select them when editing another stop.</p>
          )}
          <p className="mt-2 text-sm text-white/75">
            {selectedDates.length === 0
              ? "No day assignments will change."
              : `These days will use ${stop.name}: ${selectedDates.slice().sort().join(", ")}. Other days stay unchanged.`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tripDates.map((iso) => {
              const date = new Date(`${iso}T00:00:00`);
              const dow = date.toLocaleDateString(undefined, { weekday: "short" });
              const day = date.getDate();
              const alreadyAssigned = assignedDates?.includes(iso) ?? false;
              const on = alreadyAssigned || selectedDates.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDate(iso)}
                  disabled={assignedDates === null || alreadyAssigned || saving}
                  aria-pressed={on}
                  aria-label={date.toLocaleDateString(undefined, { dateStyle: "full" })}
                  className={
                    "flex w-14 flex-col items-center rounded-lg border px-2 py-1.5 text-center text-xs transition-colors disabled:cursor-default " +
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
                  disabled={saving}
                  aria-pressed={on}
                  className={
                    "min-h-11 rounded-full border px-3 py-1 text-xs " +
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
          disabled={saving || assignedDates === null}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-cyan-300/22 text-sm font-semibold text-white"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save stop
        </button>
      </DialogContent>
    </Dialog>
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
  onMembersChange: Dispatch<SetStateAction<TripMember[]>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"invite" | "guest">("invite");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const add = async () => {
    const displayName = name.trim();
    if (!displayName) return;
    setAdding(true);
    try {
      const { member } = await tripRequest<{ member: TripMember }>(
        `/api/v1/trips/${trip.id}/members`,
        "POST",
        { display_name: displayName, kind }
      );
      onMembersChange((current) => [...current, member]);
      setName("");
    } catch (err) {
      toast.error(`Couldn't add ${displayName}`, { description: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (member: TripMember) => {
    setRemovingId(member.id);
    try {
      await tripRequest(`/api/v1/trips/${trip.id}/members/${member.id}`, "DELETE");
      onMembersChange((current) => current.filter((m) => m.id !== member.id));
    } catch (err) {
      toast.error(`Couldn't remove ${member.display_name}`, { description: errorMessage(err) });
    } finally {
      setRemovingId(null);
    }
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
              onRemove={m.role === "organizer" ? undefined : () => remove(m)}
              removeDisabled={removingId !== null}
              removing={removingId === m.id}
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

      {/* Leaving mid-save would lose the typed name if that save failed. */}
      <NavBar
        onBack={onBack}
        backDisabled={adding || removingId !== null}
        onNext={onNext}
        nextLabel="Next"
        nextDisabled={adding || removingId !== null}
      />
    </div>
  );
}

function MemberRow({
  member,
  onRemove,
  removeDisabled = false,
  removing = false,
  tripName,
}: {
  member: TripMember;
  onRemove?: () => void;
  removeDisabled?: boolean;
  removing?: boolean;
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
          disabled={removeDisabled}
          className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-50"
          aria-label={`Remove ${member.display_name}`}
        >
          {removing ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
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
  backDisabled = false,
  onNext,
  nextLabel,
  nextDisabled = false,
  nextLoading = false,
}: {
  onBack: () => void;
  backLabel?: string;
  backDisabled?: boolean;
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
        disabled={backDisabled}
        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/14 px-4 text-sm font-medium text-white/85 hover:bg-white/10 disabled:opacity-50"
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
