"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, Backpack, Minus, Plus, X } from "lucide-react";
import { FieldError } from "@/components/FieldError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sentenceCase } from "@/components/trips/trip-primitives";
import { BODY_PART_LABELS, LAYER_LABELS } from "@/lib/layers";
import { BODY_PART_ORDER, LAYER_TYPE_ORDER, type PackingListData } from "@/lib/packingList";
import { MAX_NAME, MAX_QUANTITY } from "@/lib/trip-packing";
import { cn } from "@/lib/utils";
import type {
  PackingChecks, PackingChecklist, PackingEquipmentItem, PackingItem, PackingManualItem, PackingRemovedItem, TouringEquipment,
} from "@/types/trip-packing";

type CheckControls = {
  checks: PackingChecks;
  onCheck: (key: string, name: string, quantity: number, packed: boolean) => void;
};

function PackingCheck({ itemKey, name, quantity, checks, busy, onCheck }: CheckControls & {
  itemKey: string; name: string; quantity: number; busy: boolean;
}) {
  const checked = checks[itemKey]?.packed === true && checks[itemKey]?.quantity === quantity;
  return (
    <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center self-start rounded-md focus-within:ring-2 focus-within:ring-ring">
      <input type="checkbox" className="size-5 accent-primary" checked={checked}
        aria-label={`Packed ${name}${quantity > 1 ? ` (all ${quantity})` : ""}`}
        aria-disabled={busy || undefined} aria-busy={busy || undefined}
        onChange={() => { if (!busy) onCheck(itemKey, name, quantity, !checked); }} />
    </label>
  );
}

/** "Sat Oct 10" for a "yyyy-MM-dd" date. */
export const packingDay = (date: string) => format(new Date(`${date}T00:00:00`), "EEE MMM d");

/** "Worn Sat Oct 10, Sun Oct 11 · Carried Sun Oct 11". */
function usesLabel(days: PackingItem["days"]): string {
  const on = (use: "wear" | "carry") => days.filter((day) => day.uses.includes(use)).map((day) => packingDay(day.date));
  const worn = on("wear");
  const carried = on("carry");
  return [worn.length > 0 && `Worn ${worn.join(", ")}`, carried.length > 0 && `Carried ${carried.join(", ")}`]
    .filter(Boolean).join(" · ");
}

const OWNERSHIP_LABEL: Record<PackingItem["ownership"], string> = {
  owned: "Your gear",
  suggested: "Not in your wardrobe",
  general: "General item",
};

/**
 * How many to pack. The buttons ignore taps rather than disabling while a
 * change saves or at a limit, so focus stays on them.
 */
function QuantityStepper({ name, value, busy, onChange }: {
  name: string;
  value: number;
  busy: boolean;
  onChange: (next: number) => void;
}) {
  const fewer = busy || value <= 1;
  const more = busy || value >= MAX_QUANTITY;
  const blocked = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
  return (
    <div role="group" aria-label={`How many ${name}`} className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="outline" size="icon-sm" className={blocked} aria-label={`One fewer ${name}`}
        aria-disabled={fewer || undefined} onClick={() => { if (!fewer) onChange(value - 1); }}>
        <Minus aria-hidden="true" />
      </Button>
      <span aria-live="polite" className="min-w-7 text-center text-base font-medium tabular-nums text-foreground">{value}</span>
      <Button type="button" variant="outline" size="icon-sm" className={blocked} aria-label={`One more ${name}`}
        aria-disabled={more || undefined} onClick={() => { if (!more) onChange(value + 1); }}>
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}

/** What changed in the person's saved outfits since they last acknowledged their list. */
export function PackingChanges({ items, removed, editable, acknowledging, onAcknowledge }: {
  items: PackingItem[];
  removed: PackingRemovedItem[];
  editable: boolean;
  acknowledging: boolean;
  onAcknowledge: () => void;
}) {
  const headingId = useId();
  const added = items.filter((item) => item.change?.kind === "added").length;
  const replaced = items.filter((item) => item.change?.kind === "replaced").length;
  const counts = [
    added > 0 && `${added} new`,
    replaced > 0 && `${replaced} replaced`,
    removed.length > 0 && `${removed.length} no longer in your outfits`,
  ].filter(Boolean).join(", ");
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold text-foreground">Your saved outfits changed</h2>
      <p className="mt-1 text-sm text-foreground">
        {sentenceCase(counts)}. The list below already has the changes, marked New or Replaces.
      </p>
      {removed.length > 0 && (
        <>
          <h3 className="mt-3 text-base font-semibold text-foreground">No longer in your outfits</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {removed.map((item) => (
              <li key={item.key} className="break-words text-sm text-foreground">
                {item.name} <span className="text-muted-foreground">· was for {item.dates.map(packingDay).join(", ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {editable && (
        <Button type="button" variant="outline" size="sm" className="mt-3" loading={acknowledging} onClick={onAcknowledge}>
          Got it
        </Button>
      )}
    </section>
  );
}

function ItemRow({ item, editable, busy, onQuantity, checks, onCheck }: CheckControls & {
  item: PackingItem;
  editable: boolean;
  busy: boolean;
  onQuantity: (item: PackingItem, quantity: number) => void;
}) {
  const label = item.brand && !item.name.startsWith(item.brand) ? `${item.brand} ${item.name}` : item.name;
  return (
    // On phones the quantity gets its own line so long names stay readable.
    <li className="grid grid-cols-1 items-start gap-x-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-start gap-1">
        {editable && <PackingCheck itemKey={item.key} name={item.name} quantity={item.quantity} checks={checks} busy={busy} onCheck={onCheck} />}
        <p className="min-w-0 self-center break-words text-base font-medium text-foreground">{label}</p>
      </div>
      {editable
        ? <div className="ml-12 w-fit sm:ml-0"><QuantityStepper name={item.name} value={item.quantity} busy={busy} onChange={(next) => onQuantity(item, next)} /></div>
        : <span className="self-center text-base text-foreground">{item.quantity > 1 && `×${item.quantity}`}</span>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:col-span-2">
        {item.change?.kind === "added" && <Badge size="sm" variant="primary">New</Badge>}
        {item.change?.kind === "replaced" && <Badge size="sm" variant="primary" className="max-w-full whitespace-normal [overflow-wrap:anywhere]">Replaces {item.change.replaces.join(", ")}</Badge>}
        {item.ownership === "owned"
          ? <span className="text-sm text-muted-foreground">{OWNERSHIP_LABEL.owned}</span>
          : <Badge size="sm" variant="outline">{OWNERSHIP_LABEL[item.ownership]}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground sm:col-span-2">
        {item.layerType && `${LAYER_LABELS[item.layerType]} · `}{usesLabel(item.days)}
      </p>
    </li>
  );
}

/** Everything the person's saved outfits call for, by body area, then what's only carried. */
export function PackingItems({ items, editable, busy, onQuantity, checks, onCheck }: CheckControls & {
  items: PackingItem[];
  editable: boolean;
  busy: ReadonlySet<string>;
  onQuantity: (item: PackingItem, quantity: number) => void;
}) {
  const groups = [
    ...BODY_PART_ORDER.map((bodyPart) => ({ key: bodyPart, label: BODY_PART_LABELS[bodyPart], items: items.filter((item) => item.bodyPart === bodyPart) })),
    { key: "carry", label: "Carry", items: items.filter((item) => !item.bodyPart) },
  ].filter((group) => group.items.length > 0);
  return (
    <div className="divide-y divide-border border-y border-border">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            {group.key === "carry" && <Backpack className="size-4 text-muted-foreground" aria-hidden="true" />}
            {group.label}
          </h3>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {group.items.map((item) => (
              <ItemRow key={item.key} item={item} editable={editable} busy={busy.has(item.key)} onQuantity={onQuantity} checks={checks} onCheck={onCheck} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Items the person added by hand, and the form to add one. */
export function ManualItems({ items, editable, busy, onAdd, onQuantity, onRemove, checks, onCheck }: CheckControls & {
  items: PackingManualItem[];
  editable: boolean;
  busy: ReadonlySet<string>;
  /** Resolves with an error to show, or null once it's added. */
  onAdd: (name: string) => Promise<string | null>;
  onQuantity: (item: PackingManualItem, quantity: number) => void;
  onRemove: (item: PackingManualItem) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (adding) return;
    if (!name.trim()) {
      setError("Name the item to add.");
      inputRef.current?.focus();
      return;
    }
    setAdding(true);
    const failure = await onAdd(name.trim());
    setAdding(false);
    setError(failure);
    if (!failure) setName("");
    inputRef.current?.focus();
  };

  return (
    <div>
      {items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0">
              <div className="flex min-w-0 flex-1 basis-28 items-start gap-1">
                {editable && <PackingCheck itemKey={`manual:${item.id}`} name={item.name} quantity={item.quantity} checks={checks} busy={busy.has(item.id)} onCheck={onCheck} />}
                <p className="min-w-0 self-center break-words text-base font-medium text-foreground">{item.name}</p>
              </div>
              {editable ? (
                <div className="ml-auto flex items-center gap-1">
                  <QuantityStepper name={item.name} value={item.quantity} busy={busy.has(item.id)} onChange={(next) => onQuantity(item, next)} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`}
                    aria-disabled={busy.has(item.id) || undefined}
                    onClick={() => { if (!busy.has(item.id)) onRemove(item); }}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ) : item.quantity > 1 && <span className="text-base text-foreground">×{item.quantity}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing added yet: toothbrush, headlamp, chargers, spare socks.</p>
      )}
      {editable ? (
        <form onSubmit={(event) => void submit(event)} className={cn("flex flex-col gap-1.5", items.length > 0 ? "mt-3 border-t border-border pt-3" : "mt-3")} noValidate>
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">Add an item</label>
          <div className="flex flex-wrap gap-2">
            <Input ref={inputRef} id={inputId} value={name} maxLength={MAX_NAME} autoComplete="off" className="min-w-0 flex-1 basis-48"
              aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
              onChange={(event) => { setName(event.target.value); if (error) setError(null); }} />
            <Button type="submit" variant="outline" loading={adding}>
              {!adding && <Plus aria-hidden="true" />}
              Add
            </Button>
          </div>
          {error && <FieldError id={errorId}>{error}</FieldError>}
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Your own items can&apos;t be changed right now. Try again later.</p>
      )}
    </div>
  );
}

/** "Sat Oct 10, Sun Oct 11", or what to say when the plan has no Backcountry days. */
function touringDaysLabel(dates: string[]): string {
  return dates.length > 0
    ? `For your Backcountry days: ${dates.map(packingDay).join(", ")}.`
    : "No Backcountry days in the plan now.";
}

/**
 * The touring equipment the person added from the template (#212), checked
 * like everything else in their list.
 */
export function EquipmentItems({ equipment, busy, onQuantity, onRemove, onAdd, checks, onCheck }: CheckControls & {
  equipment: TouringEquipment;
  busy: ReadonlySet<string>;
  onQuantity: (item: PackingEquipmentItem, quantity: number) => void;
  onRemove: (item: PackingEquipmentItem) => void;
  /** Opens the template. */
  onAdd: () => void;
}) {
  const { items, editable } = equipment;
  return (
    <div>
      <p className="text-sm text-muted-foreground">{touringDaysLabel(equipment.dates)}</p>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 last:pb-0">
              <div className="flex min-w-0 flex-1 basis-40 items-start gap-1">
                {editable && <PackingCheck itemKey={item.key} name={item.name} quantity={item.quantity} checks={checks} busy={busy.has(item.key)} onCheck={onCheck} />}
                <div className="min-w-0 self-center">
                  <p className="break-words text-base font-medium text-foreground">{item.name}</p>
                  <details className="text-sm text-muted-foreground">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-2">
                      What it&apos;s for<span className="sr-only">: {item.name}</span>
                    </summary>
                    <p className="pb-1">{item.purpose}</p>
                  </details>
                </div>
              </div>
              {editable ? (
                <div className="ml-auto flex items-center gap-1">
                  <QuantityStepper name={item.name} value={item.quantity} busy={busy.has(item.key)} onChange={(next) => onQuantity(item, next)} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.name} from your list`}
                    aria-disabled={busy.has(item.key) || undefined}
                    onClick={() => { if (!busy.has(item.key)) onRemove(item); }}>
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ) : item.quantity > 1 && <span className="text-base text-foreground">×{item.quantity}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-base text-foreground">
          Nothing added yet. Add the touring equipment you&apos;re bringing, like your transceiver, probe and shovel.
        </p>
      )}
      {editable ? (
        <Button type="button" variant="outline" className="mt-3" onClick={onAdd}>
          <Plus aria-hidden="true" />
          {items.length > 0 ? "Add more touring equipment" : "Add touring equipment"}
        </Button>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Touring equipment can&apos;t be changed right now. Try again later.</p>
      )}
    </div>
  );
}

/** Category checklists from before saved outfits, which name no particular items. */
export function OlderChecklists({ tripId, checklists }: { tripId: string; checklists: PackingChecklist[] }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        These name kinds of layers, not your items, so they aren&apos;t in your list. Save an outfit for the day from Gear up to add it.
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {checklists.map((checklist) => (
          <li key={checklist.date} className="flex flex-wrap items-center justify-between gap-x-3 py-2">
            <span className="text-base text-foreground">
              {packingDay(checklist.date)} <span className="text-muted-foreground">· {checklist.items.map(sentenceCase).join(", ")}</span>
            </span>
            <Link href={`/trips/${tripId}/days/${checklist.date}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 hover:no-underline">
              Open {packingDay(checklist.date)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** General guidance for the days without a saved outfit, kept apart from the person's list. */
export function PackingSuggestions({ list, days }: { list: PackingListData; days: number }) {
  const rows = BODY_PART_ORDER.flatMap((bodyPart) => LAYER_TYPE_ORDER.flatMap((layerType) =>
    list.byBodyPart[bodyPart][layerType].map((entry) => ({
      key: entry.mappingKey, bodyPart, name: entry.specificItem,
      detail: `${LAYER_LABELS[layerType]} · ${entry.source === "mapped" ? "Your item for" : "Likely match for"} ${entry.standardOption}`,
    }))));
  const groups = BODY_PART_ORDER
    .map((bodyPart) => ({ bodyPart, rows: rows.filter((row) => row.bodyPart === bodyPart) }))
    .filter((group) => group.rows.length > 0);
  return (
    <div className="divide-y divide-border border-y border-border">
      <p className="py-4 text-sm text-muted-foreground">
        General guidance for {days} {days === 1 ? "day" : "days"} without a saved outfit, from each day&apos;s activity and weather.
        These aren&apos;t in your list until you save an outfit for the day.
      </p>
      {groups.map(({ bodyPart, rows: groupRows }) => (
        <section key={bodyPart} aria-label={`Suggested for ${BODY_PART_LABELS[bodyPart]}`} className="py-4">
          <h3 className="text-base font-semibold text-foreground">{BODY_PART_LABELS[bodyPart]}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {groupRows.map((row) => (
              <li key={row.key}>
                <p className="break-words text-base text-foreground">{row.name}</p>
                <p className="text-sm text-muted-foreground">{row.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {list.gaps.length > 0 && (
        <section aria-label="Suggested, not in your wardrobe" className="py-4">
          <h3 className="text-base font-semibold text-foreground">Not in your wardrobe</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {list.gaps.map((gap) => (
              <li key={gap.mappingKey} className="flex items-center gap-2 text-base text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words">
                  {gap.standardOption}{" "}
                  <span className="text-sm text-muted-foreground">· {BODY_PART_LABELS[gap.bodyPart]} / {LAYER_LABELS[gap.layerType]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {list.extras.length > 0 && (
        <section aria-label="Suggested to carry" className="py-4">
          <h3 className="text-base font-semibold text-foreground">Carry</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {list.extras.map((extra) => <li key={extra} className="break-words text-base text-foreground">{extra}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
