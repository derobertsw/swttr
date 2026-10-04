"use client";

import { Suspense, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import LegacyTripWizard from "@/components/trips/LegacyTripWizard";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";
import { errorMessage, TripRequestError, tripRequest } from "@/lib/trip-requests";
import { STORAGE_KEYS } from "@/lib/storage";
import type { TripCreationInput } from "@/lib/trip-creation";
import type { LocationSuggestion } from "@/types/recommendations";
import type { Trip } from "@/types/trips";

interface Draft {
  id: string;
  name: string;
  nameEdited: boolean;
  start: string;
  end: string;
  activity: string;
  place: LocationSuggestion | null;
  submitted?: TripCreationInput;
  savedId?: string;
}

const emptyDraft = (): Draft => ({ id: crypto.randomUUID(), name: "", nameEdited: false, start: "", end: "", activity: "", place: null });

function CreationSkeleton() {
  return <PageLayout chromeVariant="compact"><Skeleton className="h-96 w-full max-w-2xl" /></PageLayout>;
}

export default function NewTripPage() {
  return <Suspense fallback={<CreationSkeleton />}><TripEntry /></Suspense>;
}

function TripEntry() {
  const params = useSearchParams();
  // These URLs point at already-saved trips from the former wizard.
  return params.has("trip") ? <LegacyTripWizard /> : <TripCreator />;
}

function TripCreator() {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded) return <CreationSkeleton />;
  if (!userId) return <PageLayout chromeVariant="compact"><p>Sign in to save a trip.</p></PageLayout>;
  // Account changes remount the form, hiding private input immediately and
  // retiring any earlier request, including an A → B → A account change.
  return <TripDraftForm key={userId} userId={userId} />;
}

type CreationState = { draft: Draft | null; storageError: boolean };

function TripDraftForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [{ draft, storageError }, dispatch] = useReducer(
    (state: CreationState, update: Partial<CreationState>) => ({ ...state, ...update }),
    { draft: null, storageError: false }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const account = useRef(0);
  const request = useRef<AbortController | null>(null);
  const search = useLocationSearch();

  useEffect(() => {
    let draft = emptyDraft();
    let storageError = false;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.TRIP_CREATION_DRAFT);
      let stored = null;
      try { stored = raw ? JSON.parse(raw) : null; } catch { sessionStorage.removeItem(STORAGE_KEYS.TRIP_CREATION_DRAFT); }
      if (stored?.owner === userId && stored.draft && typeof stored.draft.id === "string" && typeof stored.draft.name === "string" && typeof stored.draft.start === "string" && typeof stored.draft.end === "string") {
        draft = stored.draft;
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.TRIP_CREATION_DRAFT);
      }
    } catch {
      storageError = true;
    }
    dispatch({ draft, storageError });
    return () => { account.current += 1; request.current?.abort(); };
  }, [userId]);

  const persist = (next: Draft): boolean => {
    if (!userId) return false;
    dispatch({ draft: next });
    try {
      sessionStorage.setItem(STORAGE_KEYS.TRIP_CREATION_DRAFT, JSON.stringify({ owner: userId, draft: next }));
      dispatch({ storageError: false });
      return true;
    } catch {
      dispatch({ storageError: true });
      return false;
    }
  };
  const edit = (update: Partial<Draft>) => { if (draft) persist({ ...draft, ...update }); };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || inFlight.current) return;
    const place = draft.place;
    if (!draft.submitted && (!place || !draft.name.trim() || !draft.start || !draft.end || draft.start > draft.end)) {
      setError("Pick a destination, add a trip name and choose a valid date range.");
      return;
    }
    const input = draft.submitted ?? {
      creation_id: draft.id, name: draft.name.trim(), start_date: draft.start, end_date: draft.end,
      destination: { name: [place!.name, place!.region || place!.country].filter(Boolean).join(", "), latitude: place!.latitude, longitude: place!.longitude },
      activity: draft.activity || null,
    };
    const submittedDraft = { ...draft, submitted: input };
    // Record the identity and exact submitted fields BEFORE the request. An
    // uncertain response can then be retried across a reload without new work.
    if (!persist(submittedDraft)) return;
    const generation = account.current;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const { trip } = await tripRequest<{ trip: Trip }>("/api/v1/trips", "POST", input, { signal: controller.signal });
      if (account.current !== generation) return;
      persist({ ...submittedDraft, savedId: trip.id });
      router.replace(`/trips/${encodeURIComponent(trip.id)}`);
    } catch (err) {
      if (account.current === generation) {
        const status = err instanceof TripRequestError ? err.status : undefined;
        // Validation runs before creation. A collision cannot succeed for this
        // account, so retire that identity while keeping the editable input.
        if (status === 400) persist({ ...draft, submitted: undefined });
        else if (status === 409) persist({ ...draft, id: crypto.randomUUID(), submitted: undefined });
        const hint = status === 400 ? " Edit the details and try again." : status === 409 ? " A fresh draft is ready. Try creating the trip again." : " Retry checks the same draft.";
        setError(`Couldn't create the trip: ${errorMessage(err)}${hint}`);
      }
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) request.current = null;
      if (account.current === generation) { inFlight.current = false; setSaving(false); }
    }
  };

  if (!draft) return <CreationSkeleton />;

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-2xl flex-col gap-6 pb-24">
        <Link href="/trips" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />All trips</Link>
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan a trip</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dates and a destination</h1>
          <p className="mt-2 text-sm text-muted-foreground">Start with one place. Add stops, crew and shared gear from your saved trip.</p>
        </header>
        {draft.savedId ? (
          <Card className="flex flex-col gap-4">
            <p role="status" className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" />Your trip is saved.</p>
            <p className="break-words font-semibold">{draft.name}</p>
            <Button asChild><Link href={`/trips/${encodeURIComponent(draft.savedId)}`}>Open saved trip</Link></Button>
            <Button variant="outline" onClick={() => { search.reset(); persist(emptyDraft()); setError(null); }}>Start another trip</Button>
          </Card>
        ) : (
          <form onSubmit={create} className="flex flex-col gap-5">
            <Card>
              <fieldset disabled={saving || !!draft.submitted} className="flex min-w-0 flex-col gap-5">
                <LocationAutocomplete id="trip-destination" label="First destination" placeholder="Search a city or place…"
                  location={draft.place ? [draft.place.name, draft.place.region, draft.place.country].filter(Boolean).join(", ") : search.location}
                  locationQuery={search.locationQuery} selectedLocation={draft.place} suggestions={search.suggestions}
                  showSuggestions={search.showSuggestions} isSearching={search.isSearching} suggestionRef={search.suggestionRef}
                  onLocationInputChange={(value) => { search.handleLocationInputChange(value); edit({ place: null }); }}
                  onLocationFocus={() => search.suggestions.length > 0 && search.setShowSuggestions(true)}
                  onSelectLocation={(place) => { search.handleSelectLocation(place); edit({ place, ...(!draft.nameEdited ? { name: `${place.name} trip`.slice(0, 200) } : {}) }); }} onDismiss={search.dismiss} />
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">Start date<Input className="min-w-0" type="date" required value={draft.start} onChange={(event) => edit({ start: event.target.value })} /></label>
                  <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">End date<Input className="min-w-0" type="date" required min={draft.start || undefined} value={draft.end} onChange={(event) => edit({ end: event.target.value })} /></label>
                </div>
                <label className="flex flex-col gap-2 text-sm font-medium">Trip name<Input required maxLength={200} value={draft.name} placeholder="Your trip name" onChange={(event) => edit({ name: event.target.value, nameEdited: true })} /></label>
                <label className="flex flex-col gap-2 text-sm font-medium">Default activity (optional)
                  <select value={draft.activity} onChange={(event) => edit({ activity: event.target.value })} className="h-12 w-full rounded-control border border-input bg-card px-3 text-base">
                    <option value="">Choose later</option>{TRIP_ACTIVITY_OPTIONS.map((activity) => <option key={activity}>{activity}</option>)}
                  </select>
                </label>
                <p className="text-sm text-muted-foreground">The first destination is assigned to every trip day. You can choose different stops later.</p>
              </fieldset>
            </Card>
            {storageError && <p role="alert" className="text-sm text-destructive">Browser storage is unavailable. Enable session storage to keep this draft safe across retries and reloads.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {!!draft.submitted && !saving && <div className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>Retry to open the saved trip or finish creating it. An earlier attempt may already have saved a trip. <Link href="/trips" className="underline">Check your trips</Link> before discarding this draft.</p>
              <Button type="button" variant="outline" onClick={() => { search.reset(); persist(emptyDraft()); setError(null); }}>Discard and start over</Button>
            </div>}
            <p role="status" className="sr-only">{saving ? "Saving your trip…" : ""}</p>
            <Button type="submit" size="lg" loading={saving} disabled={storageError || (!draft.submitted && (!draft.place || !draft.name.trim() || !draft.start || !draft.end))}>{saving ? "Creating trip…" : draft.submitted ? "Retry create trip" : "Create trip"}</Button>
          </form>
        )}
      </div>
    </PageLayout>
  );
}
