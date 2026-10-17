"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, Circle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { equipmentKey, withEquipmentChoices } from "@/lib/touring-equipment";
import { errorMessage, tripRequest } from "@/lib/trip-requests";
import type {
  EquipmentTemplateOption, PackingChange, PackingChoices, TouringEquipment, TripEquipmentResponse,
} from "@/types/trip-packing";
import type { TripGroupGear } from "@/types/trips";

const GEAR_GUIDANCE_URL = "https://avalanche.org/avalanche-tutorial/get-the-gear.php";

/** What the preview starts with: the suggested additions that aren't in the list. */
const preselected = (template: EquipmentTemplateOption[]) =>
  new Set(template.filter((option) => option.state === "available" && option.tier === "suggested").map((option) => option.id));

function Purpose({ option }: { option: EquipmentTemplateOption }) {
  return (
    <details className="ml-11 text-sm text-muted-foreground">
      <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-2">
        What it&apos;s for<span className="sr-only">: {option.name}</span>
      </summary>
      <p className="pb-1">{option.purpose}</p>
    </details>
  );
}

/**
 * Add touring equipment (#212): the template as the person's list stands, in
 * groups, and Add selected items. Nothing is added until they choose it.
 * Render it to open it; it closes itself, then calls `onClosed`.
 */
export function EquipmentTemplateSheet({ equipment, onAdd, onClosed, onCloseAutoFocus }: {
  equipment: TouringEquipment;
  /** Saves the selected items; resolves with an error to show, or null once they're added. */
  onAdd: (ids: string[]) => Promise<string | null>;
  /** Once it has closed, so the opener can unmount it. */
  onClosed: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const errorId = useId();
  const [selected, setSelected] = useState(() => preselected(equipment.template));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const close = () => setClosed(true);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // A long list scrolls; keep the reason a save failed in view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);

  const inList = equipment.template.filter((option) => option.state === "added" || option.state === "listed");
  const groups = [
    { key: "suggested", title: "Suggested additions", note: null,
      options: equipment.template.filter((option) => option.state === "available" && option.tier === "suggested") },
    { key: "optional", title: "Optional", note: null,
      options: equipment.template.filter((option) => option.state === "available" && option.tier === "optional") },
    { key: "removed", title: "You removed", note: "You took these out of your list. Select one to add it again.",
      options: equipment.template.filter((option) => option.state === "removed") },
  ].filter((group) => group.options.length > 0);
  const nothingToAdd = groups.length === 0;

  const toggle = (id: string) => {
    setError(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const add = async () => {
    if (saving) return;
    // Only what's still offered: an item can't be added twice.
    const ids = groups.flatMap((group) => group.options).map((option) => option.id).filter((id) => selected.has(id));
    if (ids.length === 0) {
      setError("Select at least one item to add.");
      return;
    }
    setSaving(true);
    setError(null);
    const failure = await onAdd(ids);
    setSaving(false);
    setError(failure);
    if (!failure) close();
  };

  return (
    <TripSheet open={!closed} busy={saving} onClose={close} className="sm:max-w-lg"
      onCloseAutoFocus={(event) => { onCloseAutoFocus?.(event); onClosed(); }}
      header={<>
        <TripSheetTitle>Touring equipment</TripSheetTitle>
        <TripSheetDescription>
          For your Backcountry days. Nothing is added to your packing list until you choose Add selected items.
        </TripSheetDescription>
      </>}
      footer={nothingToAdd ? (
        <Button type="button" variant="outline" onClick={close}>Close</Button>
      ) : <>
        <Button type="button" loading={saving} onClick={() => void add()} aria-describedby={error ? errorId : undefined}>
          Add selected items
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button>
      </>}
    >
      <div className="space-y-5">
        {inList.length > 0 && (
          <section aria-labelledby={`${errorId}-in-list`}>
            <h3 id={`${errorId}-in-list`} className="text-base font-semibold text-foreground">Already in your list</h3>
            <ul className="mt-1 space-y-1">
              {inList.map((option) => (
                <li key={option.id} className="break-words text-base text-foreground">
                  {option.name}
                  {option.state === "listed" && option.listedAs && (
                    <span className="text-muted-foreground"> · in your list as {option.listedAs}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.map((group) => (
          <fieldset key={group.key}>
            <legend className="text-base font-semibold text-foreground">{group.title}</legend>
            {group.note && <p className="text-sm text-muted-foreground">{group.note}</p>}
            <ul className="mt-1">
              {group.options.map((option) => (
                <li key={option.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center">
                      <input type="checkbox" className="size-5 accent-primary" checked={selected.has(option.id)}
                        onChange={() => toggle(option.id)} />
                    </span>
                    <span className="min-w-0 break-words text-base text-foreground">{option.name}</span>
                  </label>
                  <Purpose option={option} />
                </li>
              ))}
            </ul>
          </fieldset>
        ))}

        {nothingToAdd && <p className="text-base text-foreground">Everything on this list is in yours.</p>}

        <p className="text-sm text-muted-foreground">
          These are packing suggestions, not a complete safety assessment. The rescue gear follows the National Avalanche
          Center&apos;s guidance: always carry a transceiver, probe and shovel, and know how to use them.{" "}
          <a href={GEAR_GUIDANCE_URL} target="_blank" rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2">
            Read the gear guidance<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>

        {/* Next to the actions, where the person is when a save fails. */}
        {error && <p ref={errorRef} id={errorId} role="alert" className="rounded-control border border-destructive p-3 text-base text-foreground">{error}</p>}
      </div>
    </TripSheet>
  );
}

const linkClassName = "inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline";

/**
 * My equipment on a Backcountry day (#212): the person's touring equipment,
 * whether each item is packed for the trip (read from their packing list,
 * where it's checked), and the shared items assigned to them.
 */
export function DayEquipment({ tripId, gear, memberId }: {
  tripId: string;
  /** The trip's shared gear. */
  gear: TripGroupGear[];
  /** The signed-in person's member row. */
  memberId: string;
}) {
  const [data, setData] = useState<TripEquipmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const focus = useReturnFocus();

  useEffect(() => {
    let cancelled = false;
    tripRequest<TripEquipmentResponse>(`/api/v1/trips/${tripId}/pack/equipment`)
      .then((body) => { if (!cancelled) { setData(body); setError(null); } })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [tripId, attempt]);

  const add = async (ids: string[]): Promise<string | null> => {
    try {
      const choices = await tripRequest<PackingChoices>(`/api/v1/trips/${tripId}/pack`, "POST",
        { op: "add_equipment", ids } satisfies PackingChange);
      setData((current) => {
        if (!current) return current;
        // Only the items this added: the day reads the rest from its own load.
        const checks = { ...current.checks };
        for (const key of ids.map(equipmentKey)) {
          if (choices.checks[key]) checks[key] = choices.checks[key];
          else delete checks[key];
        }
        return { equipment: withEquipmentChoices(current.equipment, choices.equipment, ids), checks };
      });
      setStatus(`Added ${ids.length === 1 ? "1 item" : `${ids.length} items`} to your touring equipment`);
      return null;
    } catch (err) {
      return `Couldn't add the items: ${errorMessage(err)}`;
    }
  };

  const assigned = gear.filter((item) => item.assignee_member_id === memberId);
  const items = data?.equipment.items ?? [];
  const packed = (key: string, quantity: number) => data?.checks[key]?.packed === true && data.checks[key].quantity === quantity;

  return (
    <section aria-labelledby="my-equipment-heading" className="flex flex-col gap-2.5">
      <h2 id="my-equipment-heading" ref={heading} tabIndex={-1} className="text-title font-semibold text-foreground">My equipment</h2>
      <p role="status" className="sr-only">{status}</p>
      {!data && !error && <Skeleton className="h-20 w-full rounded-card" />}
      {error && (
        <Card role="alert">
          <p className="text-base font-medium text-foreground">Couldn&apos;t load your touring equipment.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>
            Retry
          </Button>
        </Card>
      )}
      {data && (
        <Card>
          {items.length > 0 ? <>
            <p className="text-sm text-muted-foreground">Packed for the trip, as checked on your packing list.</p>
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {items.map((item) => (
                <li key={item.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 break-words text-base text-foreground">
                    {item.name}{item.quantity > 1 && ` ×${item.quantity}`}
                  </span>
                  {packed(equipmentKey(item.id), item.quantity) ? (
                    <span className="flex items-center gap-1.5 text-sm text-foreground"><Check className="size-4" aria-hidden="true" />Packed</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Circle className="size-4" aria-hidden="true" />Not packed yet</span>
                  )}
                </li>
              ))}
            </ul>
          </> : (
            <p className="text-base text-foreground">No touring equipment in your packing list yet.</p>
          )}
          {!data.equipment.editable && (
            <p className="mt-2 text-sm text-muted-foreground">Touring equipment can&apos;t be changed right now. Try again later.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {data.equipment.editable && (
              <Button type="button" variant="outline" onClick={() => { focus.remember(() => heading.current); setStatus(""); setAdding(true); }}>
                <Plus aria-hidden="true" />
                {items.length > 0 ? "Add more touring equipment" : "Add touring equipment"}
              </Button>
            )}
            <Link href={`/trips/${tripId}/pack`} className={linkClassName}>Open my packing list</Link>
          </div>
        </Card>
      )}
      {assigned.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-foreground">Shared items assigned to you</h3>
          <ul className="mt-1 flex flex-col divide-y divide-border">
            {assigned.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2.5">
                <span className="min-w-0 break-words text-base text-foreground">{item.description}</span>
                <span className="text-sm text-muted-foreground">Assigned</span>
              </li>
            ))}
          </ul>
          <Link href={`/trips/${tripId}/gear`} className={linkClassName}>Open shared gear</Link>
        </Card>
      )}
      {data && adding && (
        <EquipmentTemplateSheet equipment={data.equipment} onAdd={add}
          onClosed={() => setAdding(false)} onCloseAutoFocus={focus.restore} />
      )}
    </section>
  );
}
