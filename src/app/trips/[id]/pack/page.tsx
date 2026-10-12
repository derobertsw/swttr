"use client";

import { use, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink, SectionLabel, TripError } from "@/components/trips/trip-primitives";
import {
  ManualItems, OlderChecklists, PackingChanges, PackingItems, PackingSuggestions, packingDay,
} from "@/components/trips/TripPacking";
import { errorMessage, tripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripDayCoverage } from "@/types/trip-coverage";
import type { PackingChange, PackingChoices, PackingItem, PackingManualItem, TripPackResponse } from "@/types/trip-packing";

const COVERAGE_ACTION_LABEL: Record<TripDayCoverage["action"], string> = {
  set_location: "Choose location", set_activity: "Choose activity", plan_manually: "Plan kit manually",
  retry_weather: "Retry weather", check_later: "Review day", review_day: "Review day",
};

function coverageActionLabel(day: TripDayCoverage) {
  if (day.advice === "saved") return "Review saved outfit";
  if (day.advice === "manual") return "Review checklist";
  if (day.advice === "available") return "Plan this day";
  return COVERAGE_ACTION_LABEL[day.action];
}

/** A day to look at: no saved outfit, one that no longer fits, or weather the suggestions are missing. */
function needsReview(day: TripDayCoverage) {
  if (day.advice === "saved") return (day.notes?.length ?? 0) > 0;
  return true;
}

function fetchPackList(tripId: string): Promise<TripPackResponse> {
  return tripRequest<TripPackResponse>(`/api/v1/trips/${tripId}/pack`);
}

export default function PackListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TripPackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The items and hand-added items whose changes are saving.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const markBusy = (key: string, on: boolean) => setBusy((current) => {
    const next = new Set(current);
    if (on) next.add(key); else next.delete(key);
    return next;
  });
  const [acknowledging, setAcknowledging] = useState(false);
  const [status, setStatus] = useState("");
  // A hand-added item keeps its identity until it's saved, so a retry adds it once.
  const pendingAdd = useRef<{ id: string; name: string } | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPackList(id)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
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
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Saves one change and returns the saved choices, which the caller merges
   * for its own item only: responses to changes on other rows can arrive in
   * any order. A change the server says is out of date (an item removed
   * elsewhere, outfits changed) reloads the list.
   */
  const save = async (change: PackingChange, failure: string): Promise<PackingChoices | string> => {
    try {
      return await tripRequest<PackingChoices>(`/api/v1/trips/${id}/pack`, "POST", change);
    } catch (err) {
      const message = errorMessage(err);
      if (err instanceof TripRequestError && (err.status === 404 || err.status === 409)) void refresh();
      toast.error(failure, { description: message });
      return message;
    }
  };

  const setQuantity = async (key: string, change: PackingChange, name: string, previous: number, next: number,
    apply: (current: TripPackResponse, quantity: number) => TripPackResponse, saved: (choices: PackingChoices) => number) => {
    markBusy(key, true);
    // Shown at once, and put back if the save fails.
    setData((current) => current && apply(current, next));
    const result = await save(change, `Couldn't change how many ${name}`);
    setData((current) => current && apply(current, typeof result === "string" ? previous : saved(result)));
    if (typeof result !== "string") setStatus(`${name}: ${next}`);
    markBusy(key, false);
  };

  const itemQuantity = (item: PackingItem, quantity: number) => void setQuantity(item.key,
    { op: "quantity", key: item.key, quantity }, item.name, item.quantity, quantity,
    (current, value) => ({ ...current, items: current.items.map((entry) => entry.key === item.key ? { ...entry, quantity: value } : entry) }),
    (choices) => choices.quantities[item.key] ?? 1);

  const manualQuantity = (item: PackingManualItem, quantity: number) => void setQuantity(item.id,
    { op: "item_quantity", id: item.id, quantity }, item.name, item.quantity, quantity,
    (current, value) => ({ ...current, manual: current.manual.map((entry) => entry.id === item.id ? { ...entry, quantity: value } : entry) }),
    (choices) => choices.manual.find((entry) => entry.id === item.id)?.quantity ?? quantity);

  const addItem = async (name: string): Promise<string | null> => {
    const pending = pendingAdd.current?.name === name ? pendingAdd.current : { id: crypto.randomUUID(), name };
    pendingAdd.current = pending;
    try {
      const choices = await tripRequest<PackingChoices>(`/api/v1/trips/${id}/pack`, "POST",
        { op: "add_item", id: pending.id, name, quantity: 1 } satisfies PackingChange);
      pendingAdd.current = null;
      const added = choices.manual.find((entry) => entry.id === pending.id);
      if (added) setData((current) => current && { ...current, manual: [...current.manual.filter((entry) => entry.id !== added.id), added] });
      setStatus(`Added ${name}`);
      return null;
    } catch (err) {
      return `Couldn't add ${name}: ${errorMessage(err)}`;
    }
  };

  const removeItem = async (item: PackingManualItem) => {
    markBusy(item.id, true);
    const result = await save({ op: "remove_item", id: item.id }, `Couldn't remove ${item.name}`);
    if (typeof result !== "string") {
      setData((current) => current && { ...current, manual: current.manual.filter((entry) => entry.id !== item.id) });
      setStatus(`Removed ${item.name}`);
    }
    markBusy(item.id, false);
  };

  const acknowledge = async () => {
    if (!data) return;
    setAcknowledging(true);
    const result = await save({ op: "acknowledge", kits: data.kitVersions }, "Couldn't mark the changes as seen");
    if (typeof result !== "string") {
      // The card goes, so focus moves to the list it described.
      flushSync(() => setData((current) => current && { ...current, removed: [], items: current.items.map((item) => ({ ...item, change: undefined })) }));
      listHeading.current?.focus();
      setStatus("Changes marked as seen");
    }
    setAcknowledging(false);
  };

  const review = data?.coverage.filter(needsReview) ?? [];
  const savedDays = data?.coverage.filter((day) => day.advice === "saved").length ?? 0;
  const changed = !!data && (data.removed.length > 0 || data.items.some((item) => item.change));
  const groupGear = data?.groupGear ?? [];

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-2xl flex-col gap-5">
        <BackLink href={`/trips/${id}`}>Trip</BackLink>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-52">
            <SectionLabel>Your bag</SectionLabel>
            <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
              What to pack
            </h1>
            {data && (
              <p className="mt-1 text-sm text-muted-foreground">
                From your saved outfits for {savedDays} of {data.totalDays} {data.totalDays === 1 ? "day" : "days"}.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refresh();
            }}
            disabled={loading || refreshing}
            aria-label="Refresh pack list"
            aria-busy={refreshing}
          >
            {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Refresh
          </Button>
        </header>
        <p role="status" className="sr-only">{status}</p>

        {loading && <Skeleton className="h-48 w-full rounded-card" />}
        {error && <TripError>{error}</TripError>}

        {data && changed && (
          <PackingChanges items={data.items} removed={data.removed} editable={data.editable}
            acknowledging={acknowledging} onAcknowledge={() => void acknowledge()} />
        )}

        {data && review.length > 0 && (
          <Card>
            <h2 className="text-xl font-semibold text-foreground">Days to review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Days without a saved outfit aren&apos;t in your list yet, and a saved outfit stays as it was saved when the day&apos;s plan changes.
            </p>
            <ul className="mt-3 divide-y divide-border">
              {review.map((day) => (
                <li key={day.date} className="py-3 text-sm">
                  <p className="font-medium text-foreground">
                    {packingDay(day.date)} · {day.activity ?? "Activity not set"}
                  </p>
                  {day.stopName && <p className="break-words text-muted-foreground">{day.stopName}</p>}
                  <p className="mt-1 text-foreground">{day.message}</p>
                  {day.notes?.map((note) => <p key={note} className="mt-1 text-foreground">{note}</p>)}
                  {day.message !== day.forecast.message && !["available", "not_requested"].includes(day.forecast.status) && (
                    <p className="mt-1 text-muted-foreground">{day.forecast.message}</p>
                  )}
                  {day.approximation && <p className="mt-1 text-muted-foreground">{day.approximation}</p>}
                  <Link href={`/trips/${id}/days/${day.date}`}
                    className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline"
                    aria-label={`${coverageActionLabel(day)} for ${day.date}`}>
                    {coverageActionLabel(day)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data && (
          <section aria-labelledby="pack-kits-heading" className="flex flex-col gap-2.5">
            <h2 id="pack-kits-heading" ref={listHeading} tabIndex={-1} className="text-xl font-semibold text-foreground">From your saved outfits</h2>
            {data.items.length > 0 ? (
              <PackingItems items={data.items} editable={data.editable} busy={busy} onQuantity={itemQuantity} />
            ) : (
              <Card>
                <p className="text-sm text-foreground">
                  No saved outfits yet. Get layers for a day in Gear up and use Save to trip; what you save is packed here, once per item.
                </p>
              </Card>
            )}
          </section>
        )}

        {data && (
          <section aria-labelledby="pack-own-heading" className="flex flex-col gap-2.5">
            <h2 id="pack-own-heading" className="text-xl font-semibold text-foreground">Your own items</h2>
            <ManualItems items={data.manual} editable={data.editable} busy={busy}
              onAdd={addItem} onQuantity={manualQuantity} onRemove={(item) => void removeItem(item)} />
          </section>
        )}

        {data && data.checklists.length > 0 && (
          <section aria-labelledby="pack-checklists-heading" className="flex flex-col gap-2.5">
            <h2 id="pack-checklists-heading" className="text-xl font-semibold text-foreground">Older day checklists</h2>
            <OlderChecklists tripId={id} checklists={data.checklists} />
          </section>
        )}

        {data && data.suggestions.totalRequiredSlots + data.suggestions.extras.length > 0 && (
          <section aria-labelledby="pack-suggestions-heading" className="flex flex-col gap-2.5">
            <h2 id="pack-suggestions-heading" className="text-xl font-semibold text-foreground">Suggestions, not in your outfits</h2>
            <PackingSuggestions list={data.suggestions} days={data.suggestedDays} />
          </section>
        )}

        {groupGear.length > 0 && (
          <section aria-labelledby="pack-gear-heading" className="flex flex-col gap-2.5">
            <h2 id="pack-gear-heading" className="text-xl font-semibold text-foreground">Group gear (yours)</h2>
            <Card>
              <p className="text-sm text-muted-foreground">Assigned to you on the trip&apos;s Gear list, apart from your own things.</p>
              <ul className="mt-2 space-y-1.5">
                {groupGear.map((g) => (
                  <li key={g} className="break-words text-base text-foreground">{g}</li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        <div className="h-24" />
      </div>
    </PageLayout>
  );
}
