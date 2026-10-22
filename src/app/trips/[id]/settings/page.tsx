"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DateChangeSheet, type TripDateChangeRequest } from "@/components/trips/DateChangeSheet";
import { SectionLabel, TripError } from "@/components/trips/trip-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { useTrip } from "@/hooks/useTrip";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type { Trip } from "@/types/trips";

const FIELD_IDS: Record<string, string> = { name: "trip-name", start_date: "trip-start", end_date: "trip-end" };

export default function TripSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, reload } = useTrip(id);
  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <header>
        <SectionLabel>Trip settings</SectionLabel>
        <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">Name and dates</h1>
      </header>
      {loading && <Skeleton className="h-64 w-full rounded-card" />}
      {error && <TripError>{error}</TripError>}
      {data && <SettingsForm key={data.trip.id} trip={data.trip} onSaved={reload} />}
    </div>
  );
}

function SettingsForm({ trip, onSaved }: { trip: Trip; onSaved: () => Promise<boolean> }) {
  const router = useRouter();
  const [name, setName] = useState(trip.name);
  const [start, setStart] = useState(trip.start_date);
  const [end, setEnd] = useState(trip.end_date);
  // The trip the fields started from. The form can open on shared data that a
  // background check then replaces: fields left as they were follow the newer
  // trip, and fields being edited keep what was typed.
  const [shown, setShown] = useState(trip);
  if (trip !== shown) {
    setShown(trip);
    if (name === shown.name) setName(trip.name);
    if (start === shown.start_date) setStart(trip.start_date);
    if (end === shown.end_date) setEnd(trip.end_date);
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; field: string | null } | null>(null);
  const [review, setReview] = useState<TripDateChangeRequest | null>(null);
  // A save that went through when reloading the trip afterwards didn't.
  const [unreloaded, setUnreloaded] = useState<{ trip: Trip; message: string } | null>(null);
  const reviewFocus = useReturnFocus();
  const nameChanged = name.trim() !== trip.name;
  const datesChanged = start !== trip.start_date || end !== trip.end_date;
  const dirty = nameChanged || datesChanged;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (error?.field) document.getElementById(FIELD_IDS[error.field] ?? "")?.focus();
  }, [error]);

  // Leaves only once the trip has reloaded, so its pages never show the old
  // name or dates as current. Otherwise it stays here and offers a reload.
  const saved = async (updated: Trip, message: string) => {
    if (!(await onSaved())) {
      setUnreloaded({ trip: updated, message });
      return;
    }
    setUnreloaded(null);
    toast.success(message);
    router.push(`/trips/${updated.id}`);
  };
  const reload = async () => {
    if (!unreloaded || saving) return;
    setSaving(true);
    try { await saved(unreloaded.trip, unreloaded.message); }
    finally { setSaving(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) return setError({ message: "Enter a trip name.", field: "name" });
    if (!start) return setError({ message: "Choose a start date.", field: "start_date" });
    if (!end || end < start) return setError({ message: "The end date must be on or after the start date.", field: "end_date" });
    setError(null);
    if (datesChanged) {
      // Nothing is saved until the review is confirmed.
      reviewFocus.remember(() => document.getElementById("trip-settings-submit"));
      setReview({ ...(nameChanged ? { name: name.trim() } : {}), start_date: start, end_date: end });
      return;
    }
    if (!nameChanged) return;
    setSaving(true);
    try {
      const { trip: updated } = await timedTripRequest<{ trip: Trip }>(`/api/v1/trips/${trip.id}`, "PATCH", { name: name.trim() });
      await saved(updated, "Trip renamed.");
    } catch (err) {
      const field = err instanceof TripRequestError && typeof err.details?.field === "string" ? err.details.field : null;
      setError({ message: `Couldn't save the trip: ${errorMessage(err)}`, field });
    } finally {
      setSaving(false);
    }
  };

  const invalid = (field: string) => error?.field === field || undefined;
  return (
    <>
      <form onSubmit={(event) => void submit(event)} noValidate aria-busy={saving}>
        <Card className="flex flex-col gap-4">
          <label htmlFor="trip-name" className="flex flex-col gap-2 text-sm font-medium text-foreground">
            Trip name
            <Input id="trip-name" type="text" maxLength={200} required value={name} disabled={saving}
              onChange={(event) => setName(event.target.value)} aria-invalid={invalid("name")}
              aria-describedby={invalid("name") && "trip-settings-error"} />
          </label>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label htmlFor="trip-start" className="flex min-w-0 flex-col gap-2 text-sm font-medium text-foreground">
              Start date
              <Input id="trip-start" className="min-w-0" type="date" required value={start} disabled={saving}
                onChange={(event) => setStart(event.target.value)} aria-invalid={invalid("start_date")}
                aria-describedby={invalid("start_date") && "trip-settings-error"} />
            </label>
            <label htmlFor="trip-end" className="flex min-w-0 flex-col gap-2 text-sm font-medium text-foreground">
              End date
              <Input id="trip-end" className="min-w-0" type="date" required min={start || undefined} value={end} disabled={saving}
                onChange={(event) => setEnd(event.target.value)} aria-invalid={invalid("end_date")}
                aria-describedby={invalid("end_date") && "trip-settings-error"} />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            Before new dates are saved, you&apos;ll see what happens to each day&apos;s plan and kits.
          </p>
          {error && <p id="trip-settings-error" role="alert" className="text-sm font-medium text-destructive">{error.message}</p>}
          {unreloaded && <div role="alert" className="flex flex-col gap-2 text-sm text-foreground">
            <p>{unreloaded.message} The trip couldn&apos;t be reloaded, so its pages may still show the old name and dates.</p>
            <Button type="button" variant="outline" className="w-fit" loading={saving} onClick={() => void reload()}>Reload trip</Button>
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button id="trip-settings-submit" type="submit" loading={saving} disabled={!dirty}>
              {datesChanged ? "Review date change" : "Save"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => router.push(`/trips/${trip.id}`)}>
              Cancel
            </Button>
          </div>
        </Card>
      </form>
      {review && (
        <DateChangeSheet
          tripId={trip.id}
          change={review}
          onSaved={(updated) => saved(updated, "Trip dates changed.")}
          onClose={() => setReview(null)}
          onCloseAutoFocus={reviewFocus.restore}
        />
      )}
    </>
  );
}
