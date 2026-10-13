"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTripEditorHistory } from "@/hooks/useTripEditorHistory";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TripPackingRequirement, TripPackingReview } from "@/types/trip-packing";

const kindLabels = { owned: "Saved wardrobe selection", suggestion: "Not in your wardrobe", unresolved: "Unresolved gear choice", manual: "Your manual addition" };

function Requirement({ item, tripId }: { item: TripPackingRequirement; tripId: string }) {
  const dates = [...new Set(item.uses.map(u => u.date))];
  return <div className="min-w-0 py-2 text-sm">
    <p className="break-words font-medium">{item.name} · {item.quantity}</p>
    <p className="text-muted-foreground">{kindLabels[item.kind]}</p>
    <ul className="flex flex-wrap gap-x-3">
      {dates.map(date => <li key={date}><Link className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={`/trips/${tripId}/days/${date}`}>
        {date} · {[...new Set(item.uses.filter(u => u.date === date).map(u => `${u.purpose === "wear" ? "Wear" : "Carry"} (${u.phase})`))].join(", ")}
      </Link></li>)}
    </ul>
  </div>;
}

export function SavedPacking({ tripId, packing, onChange, onConflict }: {
  tripId: string; packing: TripPackingReview;
  onChange: (packing: TripPackingReview) => void; onConflict: () => Promise<void>;
}) {
  const fields = useRef<HTMLFieldSetElement>(null);
  const [manual, setManual] = useState(packing.manual_items);
  const [quantities, setQuantities] = useState(packing.quantities);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [review, setReview] = useState<TripPackingReview | null>(null);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const shown = review ?? (!edited ? packing : null);
  const delta = shown?.changes;
  const hasChanges = !!delta && delta.added.length + delta.removed.length + delta.changed.length > 0;

  async function submit(action: "preview" | "apply") {
    const invalid = [...(fields.current?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])].find(input => !input.checkValidity());
    if (invalid) { invalid.reportValidity(); setMessage("Choose whole-number quantities from 1 to 100."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/trips/${tripId}/pack`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: shown?.revision ?? packing.revision,
          source_revision: shown?.source_revision, proposal_revision: shown?.proposal_revision,
          manual_items: manual, quantities }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setReview(null); setEdited(true); await onConflict(); }
        throw new Error(body.error ?? "Could not save packing. Try again.");
      }
      if (action === "preview") setReview(body.packing);
      else { onChange(body.packing); setReview(null); setEdited(false); setMessage("Packing saved."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save packing. Your edits have been kept; try again."); }
    finally { setBusy(false); }
  }

  function discard() { setManual(packing.manual_items); setQuantities(packing.quantities); setName(""); setQuantity("1"); setReview(null); setEdited(false); setMessage("Pending edits discarded."); }
  return <>
    {(edited || name.trim().length > 0) && <PackingDraftGuard onDiscard={discard} />}
    <Card>
      <h2 className="text-xl font-semibold">Your saved packing requirements</h2>
      <p className="mt-1 text-sm text-muted-foreground">Accepted Wear and Carry selections, with one entry per physical item. Changing weather or your wardrobe does not replace them. Packing checks are not available yet.</p>
      {packing.requirements.length === 0 ? <p className="mt-3 text-sm">No requirements applied yet. Review saved kits below, or add personal items.</p>
        : <ul className="mt-3 divide-y divide-border">{packing.requirements.map(item => <li key={item.id}><Requirement item={item} tripId={tripId} /></li>)}</ul>}
    </Card>
    <Card>
      <h2 className="text-xl font-semibold">Review packing changes</h2>
      <p className="mt-1 text-sm text-muted-foreground">A substituted item appears as a removal and an addition. Removed items stay on your saved list until you apply these changes.</p>
      {delta && <div className="mt-3 space-y-3">
        {([['Added', delta.added], ['Removed', delta.removed]] as const).map(([label, items]) => items.length > 0 && <div key={label}><h3 className="font-semibold">{label}</h3><ul>{items.map(item => <li key={item.id}><Requirement item={item} tripId={tripId} /></li>)}</ul></div>)}
        {delta.changed.length > 0 && <div><h3 className="font-semibold">Changed quantity or days</h3><ul>{delta.changed.map(change => <li key={change.after.id}>
          <p className="mt-2 text-sm text-muted-foreground">Previously:</p><Requirement item={change.before} tripId={tripId} />
          <p className="text-sm text-muted-foreground">After applying:</p><Requirement item={change.after} tripId={tripId} />
        </li>)}</ul></div>}
        {!hasChanges && <p className="text-sm">Your saved requirements match your accepted kits and personal additions.</p>}
      </div>}
      <fieldset ref={fields} disabled={busy} className="mt-4 space-y-3">
        <legend className="font-semibold">Personal additions and quantities</legend>
        <ul className="space-y-2">{manual.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-words">{item.name} quantity</span>
            <Input className="w-24" type="number" min={1} max={100} step={1} value={item.quantity}
              onChange={event => { setManual(manual.map(m => m.id === item.id ? { ...m, quantity: Number(event.target.value) } : m)); setReview(null); setEdited(true); }} /></label>
          <Button type="button" size="sm" variant="outline" onClick={() => { setManual(manual.filter(m => m.id !== item.id)); setReview(null); setEdited(true); }} aria-label={`Remove ${item.name}`}>Remove</Button>
        </li>)}</ul>
        <form onSubmit={event => {
          event.preventDefault();
          if (!name.trim() || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 100) return;
          setManual([...manual, { id: crypto.randomUUID(), name: name.trim(), quantity: Number(quantity) }]);
          setName(""); setQuantity("1"); setReview(null); setEdited(true);
        }} className="space-y-2">
          <label className="block text-sm" htmlFor="packing-item-name">Personal item</label>
          <Input id="packing-item-name" value={name} maxLength={200} required onChange={e => setName(e.target.value)} />
          <label className="block text-sm" htmlFor="packing-item-quantity">Quantity</label>
          <Input id="packing-item-quantity" type="number" min={1} max={100} step={1} value={quantity} required onChange={e => setQuantity(e.target.value)} />
          <Button type="submit" variant="outline" disabled={manual.length >= 100}>Add to review</Button>
        </form>
        <div className="space-y-2">{packing.proposed.filter(item => item.kind !== "manual").map(item => <label key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 break-words">{item.name} quantity</span>
          <Input className="w-24" type="number" min={1} max={100} step={1} value={quantities[item.id] ?? item.quantity}
            onChange={e => { setQuantities({ ...quantities, [item.id]: Number(e.target.value) }); setReview(null); setEdited(true); }} />
        </label>)}</div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void submit("preview")}>Review changes</Button>
        <Button disabled={busy || !shown || (!hasChanges && !edited) || !!name.trim()} onClick={() => void submit("apply")} aria-busy={busy}>Apply reviewed changes</Button>
        {edited && <Button variant="ghost" disabled={busy} onClick={discard}>Discard pending edits</Button>}
      </div>
      <p className="mt-2 text-sm" role="status" aria-live="polite">{busy ? "Saving or reviewing packing…" : message || (edited && !review ? "Personal edits are not saved yet. Review changes before applying." : "")}</p>
    </Card>
  </>;
}

/** Dirty packing edits use the trip sheet's Back and discard convention. */
function PackingDraftGuard({ onDiscard }: { onDiscard: () => void }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState<"back" | string | null>(null);
  const history = useTripEditorHistory(() => { setLeaving("back"); return true; }, true);
  useEffect(() => {
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.href === window.location.href) return;
      event.preventDefault(); event.stopPropagation(); setLeaving(anchor.href);
    }
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  function discardAndLeave() {
    const target = leaving;
    // Remove the editor's same-URL entry before following the requested link.
    window.addEventListener("popstate", () => {
      if (target === "back") window.history.back();
      else if (target) {
        const url = new URL(target);
        if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash);
        else window.location.assign(target);
      }
    }, { once: true });
    history.leave(); onDiscard();
  }
  return <TripSheet open={!!leaving} onClose={() => setLeaving(null)}
    header={<TripSheetTitle>Discard packing changes?</TripSheetTitle>}
    footer={<><Button onClick={() => setLeaving(null)}>Keep editing</Button><Button variant="outline" onClick={discardAndLeave}>Discard changes</Button></>}>
    <TripSheetDescription>Your personal additions and quantity edits have not been saved.</TripSheetDescription>
  </TripSheet>;
}
