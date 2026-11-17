"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { personNote } from "@/components/trips/LodgingEditor";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripLodgingPerson, TripStayComparison, TripStayComparisonOption, TripStayUsePreview } from "@/types/trips";

const listed = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * Use for these nights (#213): who moves into a compared stay or option for
 * the compared nights, previewed per person and night before anything is
 * saved. Reservations are never changed. See docs/trip-stays.md#use-for-these-nights.
 */
export function UseStayOption({ tripId, option, window, people, onClose, onCloseAutoFocus, onSaved, onPlanChanged }: {
  tripId: string;
  option: TripStayComparisonOption;
  window: TripStayComparison["window"];
  /** Everyone on the trip, to choose who stays there. */
  people: TripLodgingPerson[];
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
  onSaved: (message: string) => Promise<void>;
  /** The saved plan changed since the preview: load it again behind the sheet. */
  onPlanChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [memberIds, setMemberIds] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<TripStayUsePreview | null>(null);
  const [replacement, setReplacement] = useState(false);
  // The first preview loads as the sheet opens.
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const mutationId = useRef<string | null>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const url = `/api/v1/trips/${tripId}/stay-candidates/use`;
  const { key } = option, { first_night: firstNight, checkout } = window;
  const request = { option: key, first_night: firstNight, checkout };

  const fetchPreview = useCallback((who: string[] | null) => timedTripRequest<TripStayUsePreview>(url, "POST",
    { option: key, first_night: firstNight, checkout, preview: true, ...(who ? { member_ids: who } : {}) }), [url, key, firstNight, checkout]);
  const show = useCallback((result: TripStayUsePreview) => {
    setPreview(result); setMemberIds(result.member_ids); mutationId.current = crypto.randomUUID();
    setTimeout(() => reviewRef.current?.focus(), 0);
  }, []);
  // The sheet opens on the preview for everyone on the trip those nights.
  useEffect(() => {
    let cancelled = false;
    fetchPreview(null).then((result) => { if (!cancelled) show(result); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [fetchPreview, show]);
  const review = async (who: string[] | null) => {
    setBusy(true); setError(null); setConflict(false); setPreview(null); setReplacement(false);
    try { show(await fetchPreview(who)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!preview || !mutationId.current || busy) return;
    setBusy(true); setError(null);
    try {
      await timedTripRequest(url, "POST", { ...request, preview: false, member_ids: memberIds, expected_revision: preview.revision,
        expected_people_key: preview.people_key, mutation_id: mutationId.current, replace_nights: replacement });
      await onSaved(`${option.name} is now the stay for these nights. Bookings weren't changed.`);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
      setConflict(err instanceof TripRequestError && err.status === 409);
    } finally { setBusy(false); }
  };
  const reviewAgain = async () => {
    setBusy(true);
    await onPlanChanged().catch(() => undefined);
    setBusy(false);
    await review(memberIds);
  };
  const toggle = (id: string, on: boolean) => {
    setMemberIds((prev) => on ? [...prev ?? [], id] : (prev ?? []).filter((entry) => entry !== id));
    setPreview(null); setReplacement(false);
  };
  const conflictDates = preview?.conflicts.map((date) => preview.changes.find((entry) => entry.date === date)?.date_label ?? date).join(", ");
  const byNight = preview ? [...new Set(preview.changes.map((entry) => entry.date))].map((date) => ({ date, changes: preview.changes.filter((entry) => entry.date === date) })) : [];

  return <TripSheet open={open} busy={busy} onClose={() => setOpen(false)} className="sm:max-w-xl" fullHeight
    onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
    header={<><TripSheetTitle>Use {option.name} for these nights?</TripSheetTitle>
      <TripSheetDescription>{window.label}. Nothing changes until you confirm.</TripSheetDescription></>}
    footer={<>
      {conflict ? <Button type="button" loading={busy} onClick={reviewAgain}>Review again</Button>
        : preview ? <Button type="button" loading={busy} disabled={preview.conflicts.length > 0 && !replacement} onClick={save}>{replacement ? "Replace those nights and use it" : "Use for these nights"}</Button>
        : <Button type="button" loading={busy} disabled={!memberIds?.length} onClick={() => review(memberIds)}>Review nights</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
    </>}>
    <div className="space-y-4 text-base text-foreground">
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {memberIds && <fieldset className="min-w-0" disabled={busy}>
        <legend className="mb-1 font-medium">Who stays there</legend>
        {people.map((person) => <label key={person.member_id} className="flex min-h-11 items-start gap-3 py-2.5">
          <input type="checkbox" name="member_ids" checked={memberIds.includes(person.member_id)} onChange={(event) => toggle(person.member_id, event.target.checked)} className="mt-0.5 size-5 shrink-0" />
          <span className="min-w-0"><span className="break-words">{person.display_name}</span>{personNote(person) && <span className="text-muted-foreground"> · {personNote(person)}</span>}</span>
        </label>)}
        <p className="text-muted-foreground">Nights someone isn&apos;t on the trip are left as they are.</p>
      </fieldset>}
      {preview && <section className="rounded-control border border-border p-3">
        <h3 tabIndex={-1} ref={reviewRef} className="font-semibold">What changes</h3>
        {preview.summary.length ? <ul className="mt-2 space-y-2">{preview.summary.map((line) => <li key={line} className="break-words">{line}</li>)}</ul>
          : <p className="mt-2">Nobody&apos;s nights change: they&apos;re already there.</p>}
        <p className="mt-2 text-muted-foreground">Nobody else&apos;s nights change.</p>
        {byNight.length > 0 && <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2">Each night and person</summary>
          <ul className="space-y-2">{byNight.map(({ date, changes }) => <li key={date} className="break-words">
            <p className="font-medium">Night of {changes[0].date_label}</p>
            <ul>{changes.map((entry) => <li key={entry.member_id}>{entry.display_name}: {entry.before} → {entry.after}{entry.conflict ? " · replaces their plan" : ""}</li>)}</ul>
          </li>)}</ul>
        </details>}
        {preview.changes.some((entry) => entry.morning) && <details className="mt-1"><summary className="min-h-11 cursor-pointer py-2">The mornings after</summary>
          <ul className="space-y-1">{preview.changes.filter((entry) => entry.morning).map((entry) => <li key={`${entry.member_id}:${entry.date}`} className="break-words">{entry.morning}: {entry.display_name} starts from {entry.morning_origin}</li>)}</ul>
        </details>}
        {preview.new_stay && <p className="mt-2">{preview.stay_name} becomes a saved stay for {preview.date_label}, booking not confirmed. Your other options stay as they are.</p>}
        {preview.booked_kept.length > 0 && <p className="mt-2">{listed(preview.booked_kept)} {preview.booked_kept.length === 1 ? "stays" : "stay"} booked: nothing is canceled. Change the booking on Stays once you&apos;ve changed the reservation.</p>}
        {preview.conflicts.length > 0 && <label className="mt-3 flex min-h-11 items-start gap-3">
          <input type="checkbox" checked={replacement} disabled={busy} onChange={(event) => setReplacement(event.target.checked)} className="mt-1 size-5 shrink-0" />
          <span>Replace their existing plans for {conflictDates}. Stays and booking statuses are kept.</span>
        </label>}
      </section>}
      {busy && <p role="status" className="text-muted-foreground">{preview ? "Saving nights…" : "Loading what changes…"}</p>}
    </div>
  </TripSheet>;
}
