"use client";

import { use, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SharedGearList } from "@/components/trips/SharedGear";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel, TripError } from "@/components/trips/trip-primitives";
import {
  EquipmentItems, ManualItems, OlderChecklists, PackingChanges, PackingItems, PackingSuggestions, packingDay,
} from "@/components/trips/TripPacking";
import { EquipmentTemplateSheet } from "@/components/trips/TouringEquipment";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { usePublishTripSummary } from "@/hooks/useTrip";
import { equipmentKey, withEquipmentChoices } from "@/lib/touring-equipment";
import { errorMessage, timedTripRequest, tripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripDayCoverage } from "@/types/trip-coverage";
import type {
  PackingChange, PackingCheckChange, PackingChoices, PackingEquipmentItem, PackingItem, PackingManualItem, TripPackResponse,
} from "@/types/trip-packing";

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
  const [checkErrors, setCheckErrors] = useState<Record<string, { change: PackingCheckChange; name: string; message: string; conflict: boolean }>>({});
  const checking = useRef(new Set<string>());
  // A hand-added item keeps its identity until it's saved, so a retry adds it once.
  const pendingAdd = useRef<{ id: string; name: string } | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const equipmentHeading = useRef<HTMLHeadingElement>(null);
  const [addingEquipment, setAddingEquipment] = useState(false);
  const templateFocus = useReturnFocus();
  // Saves in flight and finished, so a list read while one saved isn't shown
  // over it; and whether to read the list again once they're done.
  const saves = useRef({ inFlight: 0, finished: 0, refreshAfter: false });
  const afterSaves = useRef(new Set<() => void>());
  // The pack list has its own endpoint, so it names the trip for the
  // workspace header rather than loading the whole trip for it.
  usePublishTripSummary(data?.trip);

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

  /**
   * Reads the list again. A list read while a change saved may not have it,
   * so it's read again once no change is saving rather than shown over it.
   */
  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      for (;;) {
        const finished = saves.current.finished;
        const body = await fetchPackList(id);
        if (saves.current.inFlight > 0) {
          // A successful read made during a personal save is provisional.
          // Keep this refresh pending until saves settle, then read again;
          // shared gear must not mistake a deferred read for a failed save.
          await new Promise<void>((resolve) => afterSaves.current.add(resolve));
          continue;
        }
        if (saves.current.finished === finished) {
          setData(body);
          return true;
        }
      }
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setRefreshing(false);
    }
  };

  /** Runs a change's request, counted as saving, then any refresh waiting for it. */
  const track = async <T,>(request: () => Promise<T>): Promise<T> => {
    saves.current.inFlight += 1;
    try {
      return await request();
    } finally {
      saves.current.inFlight -= 1;
      saves.current.finished += 1;
      if (saves.current.inFlight === 0) {
        for (const resolve of afterSaves.current) resolve();
        afterSaves.current.clear();
      }
      if (saves.current.inFlight === 0 && saves.current.refreshAfter) {
        saves.current.refreshAfter = false;
        void refresh();
      }
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
      return await track(async () => {
        try {
          return await tripRequest<PackingChoices>(`/api/v1/trips/${id}/pack`, "POST", change);
        } catch (err) {
          if (err instanceof TripRequestError && (err.status === 404 || err.status === 409)) saves.current.refreshAfter = true;
          throw err;
        }
      });
    } catch (err) {
      const message = errorMessage(err);
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
    setData((current) => {
      if (!current) return current;
      const next = apply(current, typeof result === "string" ? previous : saved(result));
      if (typeof result !== "string") {
        const checkKey = change.op === "item_quantity" ? `manual:${change.id}`
          : change.op === "equipment_quantity" ? equipmentKey(change.id) : key;
        const checks = { ...current.checks };
        if (result.checks?.[checkKey]) checks[checkKey] = result.checks[checkKey];
        else delete checks[checkKey];
        next.checks = checks;
      }
      return next;
    });
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

  const equipmentQuantity = (item: PackingEquipmentItem, quantity: number) => void setQuantity(item.key,
    { op: "equipment_quantity", id: item.id, quantity }, item.name, item.quantity, quantity,
    (current, value) => ({ ...current, equipment: { ...current.equipment,
      items: current.equipment.items.map((entry) => entry.id === item.id ? { ...entry, quantity: value } : entry) } }),
    (choices) => choices.equipment[item.id]?.quantity ?? quantity);

  /**
   * Shows a saved change to the equipment `ids`, and the checks it cleared or
   * kept. Only those items: other rows' saves can answer in any order.
   */
  const showEquipment = (choices: PackingChoices, ids: string[]) => setData((current) => {
    if (!current) return current;
    const checks = { ...current.checks };
    for (const key of ids.map(equipmentKey)) {
      if (choices.checks[key]) checks[key] = choices.checks[key];
      else delete checks[key];
    }
    return { ...current, checks, equipment: withEquipmentChoices(current.equipment, choices.equipment, ids) };
  });

  const addEquipment = async (ids: string[]): Promise<string | null> => {
    try {
      const choices = await track(() => tripRequest<PackingChoices>(`/api/v1/trips/${id}/pack`, "POST",
        { op: "add_equipment", ids } satisfies PackingChange));
      showEquipment(choices, ids);
      setStatus(`Added ${ids.length === 1 ? "1 item" : `${ids.length} items`} to your touring equipment`);
      return null;
    } catch (err) {
      return `Couldn't add the items: ${errorMessage(err)}`;
    }
  };

  const removeEquipment = async (item: PackingEquipmentItem) => {
    markBusy(item.key, true);
    const result = await save({ op: "remove_equipment", id: item.id }, `Couldn't remove ${item.name}`);
    if (typeof result !== "string") {
      showEquipment(result, [item.id]);
      // The row goes, so focus moves to the section it was in.
      equipmentHeading.current?.focus();
      setStatus(`Removed ${item.name} from your list`);
    }
    markBusy(item.key, false);
  };

  // Keep only this row's response: other rows can finish in a different order.
  const saveCheck = async (change: PackingCheckChange, name: string) => {
    if (checking.current.has(change.key)) return;
    checking.current.add(change.key);
    const rowKey = change.key.startsWith("manual:") ? change.key.slice(7) : change.key;
    markBusy(rowKey, true);
    setStatus(`Saving packing check for ${name}`);
    setCheckErrors((current) => { const next = { ...current }; delete next[change.key]; return next; });
    try {
      const choices = await track(() => timedTripRequest<PackingChoices>(`/api/v1/trips/${id}/pack`, "POST", change));
      const confirmed = choices.checks[change.key];
      if (!confirmed) throw new Error("The server didn't confirm this packing check. Try again.");
      setData((current) => current && { ...current, checks: { ...current.checks, [change.key]: confirmed } });
      setStatus(`${name}: ${confirmed.packed ? "packed" : "not packed"}, saved`);
    } catch (err) {
      const conflict = err instanceof TripRequestError && (err.status === 404 || err.status === 409);
      const message = errorMessage(err);
      setCheckErrors((current) => ({ ...current, [change.key]: { change, name, message, conflict } }));
      setStatus(`Packing check for ${name} wasn't confirmed. ${message}`);
      if (conflict) void refresh();
    } finally {
      checking.current.delete(change.key);
      markBusy(rowKey, false);
    }
  };

  const setPacked = (key: string, name: string, quantity: number, packed: boolean) => {
    if (!data) return;
    void saveCheck({ op: "set_packed", key, packed, quantity, expected: data.checks[key]?.version ?? null,
      mutation: crypto.randomUUID(), kits: data.kitVersions }, name);
  };

  const addItem = async (name: string): Promise<string | null> => {
    const pending = pendingAdd.current?.name === name ? pendingAdd.current : { id: crypto.randomUUID(), name };
    pendingAdd.current = pending;
    try {
      const choices = await track(() => tripRequest<PackingChoices>(`/api/v1/trips/${id}/pack`, "POST",
        { op: "add_item", id: pending.id, name, quantity: 1 } satisfies PackingChange));
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
    <div className="flex w-full max-w-3xl flex-col gap-8">
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
      {busy.size > 0 && <p aria-hidden="true" className="text-sm text-muted-foreground">Saving packing changes…</p>}

      {loading && <Skeleton className="h-48 w-full rounded-card" />}
      {error && <TripError>{error}</TripError>}

      {Object.entries(checkErrors).map(([key, failure]) => (
        <div key={key} role="alert" className="border-l-2 border-destructive pl-3">
          <p className="break-words text-sm font-medium">Packing check for {failure.name} wasn&apos;t confirmed.</p>
          <p className="mt-1 text-sm text-muted-foreground">{failure.message} The checkbox shows the last confirmed state.</p>
          <Button type="button" variant="outline" className="mt-3" disabled={busy.has(key.startsWith("manual:") ? key.slice(7) : key)}
            aria-label={failure.conflict ? undefined : `Retry packing check for ${failure.name}`}
            onClick={() => {
              if (failure.conflict) {
                void refresh();
                setCheckErrors((current) => { const next = { ...current }; delete next[key]; return next; });
              } else void saveCheck(failure.change, failure.name);
            }}>
            {failure.conflict ? "Review saved list" : "Retry"}
          </Button>
        </div>
      ))}

      {data && changed && (
        <PackingChanges items={data.items} removed={data.removed} editable={data.editable}
          acknowledging={acknowledging} onAcknowledge={() => void acknowledge()} />
      )}

      {data && review.length > 0 && (
        <section aria-labelledby="pack-review-heading">
          <h2 id="pack-review-heading" className="text-xl font-semibold text-foreground">Days to review</h2>
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
        </section>
      )}

      {data && (
        <section aria-labelledby="pack-kits-heading" className="flex flex-col gap-2.5">
          <h2 id="pack-kits-heading" ref={listHeading} tabIndex={-1} className="text-xl font-semibold text-foreground">From your saved outfits</h2>
          <p className="text-sm text-muted-foreground">
            {data.editable
              ? "Check an item when you've packed its full quantity. Checks are private to you on this trip. New items start unchecked; returning items keep their previous check."
              : "Packing checks can't be loaded right now. Refresh to try again."}
          </p>
          {data.items.length > 0 ? (
            <PackingItems items={data.items} editable={data.editable} busy={busy} onQuantity={itemQuantity} checks={data.checks} onCheck={setPacked} />
          ) : (
            <p className="text-sm text-foreground">
              No saved outfits yet. Get layers for a day in Gear up and use Save to trip; what you save is packed here, once per item.
            </p>
          )}
        </section>
      )}

      {data && (data.equipment.dates.length > 0 || data.equipment.items.length > 0) && (
        <section aria-labelledby="pack-equipment-heading" className="flex flex-col gap-2.5">
          <h2 id="pack-equipment-heading" ref={equipmentHeading} tabIndex={-1} className="text-xl font-semibold text-foreground">Touring equipment</h2>
          <EquipmentItems equipment={data.equipment} busy={busy} onQuantity={equipmentQuantity}
            onRemove={(item) => void removeEquipment(item)}
            onAdd={() => { templateFocus.remember(() => equipmentHeading.current); setAddingEquipment(true); }}
            checks={data.checks} onCheck={setPacked} />
        </section>
      )}
      {data && addingEquipment && (
        <EquipmentTemplateSheet equipment={data.equipment} onAdd={addEquipment}
          onClosed={() => setAddingEquipment(false)} onCloseAutoFocus={templateFocus.restore} />
      )}

      {data && (
        <section aria-labelledby="pack-own-heading" className="flex flex-col gap-2.5">
          <h2 id="pack-own-heading" className="text-xl font-semibold text-foreground">Your own items</h2>
          <ManualItems items={data.manual} editable={data.editable} busy={busy}
            onAdd={addItem} onQuantity={manualQuantity} onRemove={(item) => void removeItem(item)} checks={data.checks} onCheck={setPacked} />
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

      {data && (
        <section aria-labelledby="pack-gear-heading" className="flex flex-col gap-2.5">
          <h2 id="pack-gear-heading" className="text-xl font-semibold text-foreground">Group gear (yours)</h2>
          <p className="text-sm text-muted-foreground">Requests and accepted responsibilities are separate from your personal packing checks.</p>
          {groupGear.length === 0 && <p className="text-sm text-muted-foreground">No shared gear is currently assigned to you.</p>}
          <SharedGearList personal tripId={id} gear={groupGear} userId="self" onSaved={refresh} />
          <Link href={`/trips/${id}/gear`}
            className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline">
            All shared gear
          </Link>
        </section>
      )}

      <div className="h-24" />
    </div>
  );
}
