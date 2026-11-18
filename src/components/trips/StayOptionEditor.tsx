"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, fieldClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { LocationPicker } from "@/components/trips/LocationPicker";
import { STAY_EXACT } from "@/components/trips/LodgingEditor";
import { useTripEditorHistory } from "@/hooks/useTripEditorHistory";
import { STAY_COST_CURRENCIES } from "@/lib/stay-costs";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripLocation, TripStayCandidate } from "@/types/trips";

type Fields = {
  name: string; check_in: string; check_out: string; address: string; property_url: string; notes: string;
  location: TripLocation | null; cost_amount: string; cost_currency: string;
};

const fieldsOf = (candidate: TripStayCandidate | null): Fields => ({
  name: candidate?.name ?? "", check_in: candidate?.check_in ?? "", check_out: candidate?.check_out ?? "", address: candidate?.address ?? "",
  property_url: candidate?.property_url ?? "", notes: candidate?.notes ?? "", location: candidate?.location ?? null,
  cost_amount: candidate?.cost_amount == null ? "" : String(candidate.cost_amount), cost_currency: candidate?.cost_currency ?? "USD",
});

/** Focuses the field the server named, opening nothing else. */
function focusField(form: HTMLFormElement | null, name: string) {
  const field = form?.elements.namedItem(name);
  if (field instanceof HTMLElement) field.focus();
}

/**
 * Adds or changes a stay the organizer is considering (#213). Saving it never
 * changes anyone's nights or records a booking. Entered values stay in the
 * form after a failed save; a change made meanwhile is shown before saving
 * over it.
 */
export function StayOptionEditor({ tripId, candidate, onClose, onCloseAutoFocus, onSaved }: {
  tripId: string;
  /** The option to change, or null to add one. */
  candidate: TripStayCandidate | null;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
  onSaved: (saved: TripStayCandidate, added: boolean) => Promise<void>;
}) {
  const [fields, setFields] = useState(() => fieldsOf(candidate));
  const [original] = useState(() => JSON.stringify(fieldsOf(candidate)));
  // A new option keeps its identity across retries, so a retried save can't add it twice.
  const [identity, setIdentity] = useState(() => ({ id: candidate?.id ?? crypto.randomUUID(), revision: candidate?.revision ?? null as number | null }));
  const [saved, setSaved] = useState<TripStayCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [closed, setClosed] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(fields) !== original;
  const handleBack = () => {
    if (busy) return true;
    if (dirty) { setDiscarding(true); return true; }
    setClosed(true);
    return false;
  };
  const history = useTripEditorHistory(handleBack, dirty && !closed);
  const close = () => { history.leave(); setClosed(true); };
  const requestClose = () => {
    if (handleBack()) history.ensureEntry();
    else history.leave();
  };
  const set = (patch: Partial<Fields>) => { setFields((prev) => ({ ...prev, ...patch })); setErrorField(null); };
  useEffect(() => {
    if (!busy && errorField) focusField(form.current, errorField);
  }, [busy, errorField]);

  // Two quick submits (a double tap) can both run before the busy state re-renders.
  const submitting = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null); setErrorField(null);
    const body = {
      candidate: { id: identity.id, name: fields.name, check_in: fields.check_in || null, check_out: fields.check_out || null,
        address: fields.address || null, property_url: fields.property_url || null, notes: fields.notes || null, location: fields.location,
        cost_amount: fields.cost_amount.trim() || null, cost_currency: fields.cost_amount.trim() ? fields.cost_currency : null },
      expected_revision: identity.revision,
    };
    try {
      const editing = identity.revision !== null;
      const result = await timedTripRequest<{ candidate: TripStayCandidate }>(
        `/api/v1/trips/${tripId}/stay-candidates${editing ? `/${identity.id}` : ""}`, editing ? "PATCH" : "POST", body);
      await onSaved(result.candidate, !editing);
      close();
    } catch (err) {
      const details = err instanceof TripRequestError ? err.details : undefined;
      setError(errorMessage(err));
      if (err instanceof TripRequestError && err.status === 409 && details && "current" in details) {
        // Show what's saved now; saving again replaces it with what's in the form.
        const current = details.current as TripStayCandidate | null;
        setSaved(current);
        setIdentity(current ? { id: current.id, revision: current.revision } : { id: crypto.randomUUID(), revision: null });
      } else if (err instanceof TripRequestError && err.status === 404) {
        setIdentity({ id: crypto.randomUUID(), revision: null });
      }
      setErrorField(typeof details?.field === "string" ? details.field : null);
    } finally { submitting.current = false; setBusy(false); }
  };

  const text = (name: keyof Omit<Fields, "location">, label: string, options: { type?: string; required?: boolean; maxLength?: number; inputMode?: "decimal"; hint?: string } = {}) =>
    <label className="block min-w-0 space-y-1 text-base text-foreground">
      <span>{label}</span>
      <Input name={name} type={options.type ?? "text"} required={options.required} maxLength={options.maxLength} inputMode={options.inputMode}
        value={fields[name]} onChange={(event) => set({ [name]: event.target.value })} className={fieldClassName}
        aria-invalid={errorField === name || undefined} aria-describedby={errorField === name ? "option-error" : undefined} />
      {options.hint && <span className="block text-sm text-muted-foreground">{options.hint}</span>}
    </label>;

  return <TripSheet open={!closed} busy={busy} onClose={requestClose} className="sm:max-w-xl" fullHeight
    onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
    header={<><TripSheetTitle>{discarding ? "Discard changes?" : candidate ? "Change option" : "Add a stay to compare"}</TripSheetTitle>
      <TripSheetDescription>{discarding ? "Your saved options will be kept." : "Only an option: nobody's nights change and nothing is booked."}</TripSheetDescription></>}
    footer={discarding ? <>
      <Button type="button" onClick={(event) => { event.preventDefault(); setDiscarding(false); history.ensureEntry(); }}>Keep editing</Button>
      <Button type="button" variant="outline" onClick={close}>Discard changes</Button>
    </> : <>
      <Button type="submit" form="stay-option-form" loading={busy}>{saved ? "Save over the saved option" : "Save option"}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>
    </>}>
    {!discarding && <div className="space-y-4">
      {saved && <div className="rounded-control border border-warning p-3 text-base text-foreground">
        <p>Saved now, by someone else&apos;s change. Your entries are kept below; saving replaces it with them.</p>
        <p className="mt-2 break-words">{saved.name} · {saved.date_label}{saved.cost_label ? ` · ${saved.cost_label}` : ""}{saved.notes ? ` · ${saved.notes}` : ""}</p>
      </div>}
      {error && <p id="option-error" role="alert" className="text-base text-destructive">{error}</p>}
      <form id="stay-option-form" ref={form} onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          {text("name", "Stay name", { required: true, maxLength: 200 })}
          <LocationPicker tripId={tripId} heading="Where is the stay?" exactTarget={STAY_EXACT} value={fields.location}
            onChange={(location) => set({ location })}
            onSaveLater={(query) => {
              if (!fields.address.trim()) set({ address: query });
              setTimeout(() => focusField(form.current, "address"), 0);
            }} />
          {text("address", "Address or location description", { maxLength: 1000 })}
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-base font-medium text-foreground">Nights it&apos;s for (optional)</legend>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{text("check_in", "Check-in", { type: "date" })}{text("check_out", "Check-out", { type: "date" })}</div>
            <p className="text-base text-muted-foreground">It can overlap stays you&apos;ve already saved. Any cost below is for these nights.</p>
          </fieldset>
          {text("property_url", "Property website", { type: "url", maxLength: 2000 })}
          <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-base font-medium text-foreground">Estimated total cost (optional)</legend>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] gap-3">
              {text("cost_amount", "Amount", { inputMode: "decimal", maxLength: 14 })}
              <label className="block min-w-0 space-y-1 text-base text-foreground"><span>Currency</span>
                <select name="cost_currency" value={fields.cost_currency} onChange={(event) => set({ cost_currency: event.target.value })}
                  className={fieldClassName} aria-invalid={errorField === "cost_currency" || undefined}>
                  {STAY_COST_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select></label>
            </div>
            <p className="text-base text-muted-foreground">Your estimate for its nights, not a live price. Fees and availability aren&apos;t checked.</p>
          </fieldset>
          <label className="block space-y-1 text-base text-foreground"><span>Notes for the crew</span>
            <textarea name="notes" rows={3} maxLength={2000} value={fields.notes} onChange={(event) => set({ notes: event.target.value })}
              className={cn(fieldClassName, "h-auto py-2")} aria-invalid={errorField === "notes" || undefined} /></label>
          <p className="text-base text-muted-foreground">Leave out confirmation numbers, payment details and access codes.</p>
        </fieldset>
      </form>
      {busy && <p role="status" className="text-base text-muted-foreground">Saving option…</p>}
    </div>}
  </TripSheet>;
}
