"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, fieldClassName } from "@/components/ui/input";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { TOUR_ACTIVITY } from "@/components/trips/TourPlan";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { useTripEditorHistory } from "@/hooks/useTripEditorHistory";
import { errorMessage, timedTripRequest, TripRequestError } from "@/lib/trip-requests";
import { cn } from "@/lib/utils";
import type {
  TripConditionsCategory,
  TripConditionsReview,
  TripConditionsReviewEntry,
  TripDayConditionsSource,
  TripFull,
} from "@/types/trips";

const CATEGORY: Record<TripConditionsCategory, { label: string; open: string }> = {
  avalanche: { label: "Avalanche forecast", open: "Open forecast" },
  weather: { label: "Mountain weather", open: "Open weather" },
  access: { label: "Access and closures", open: "Open access information" },
};

const externalLink = "inline-flex min-h-11 items-center text-primary underline";
/** A time on the viewer's clock, e.g. "Fri Oct 9, 6:12 PM". */
const when = (iso: string) => format(new Date(iso), "EEE MMM d, h:mm a");

/** Someone else's name on a review. The organizer's member row is named "You", for their own view. */
function reviewerName(data: TripFull, userId: string): string {
  const member = data.members.find((entry) => entry.user_id === userId);
  if (userId === data.trip.owner_user_id && (!member || member.display_name === "You")) return "The organizer";
  return member?.display_name ?? "A former crew member";
}

const isCurrent = (review: TripConditionsReview | undefined) => !!review && review.current.action !== "withdrawn";

type ReviewMode = "record" | "correct" | "withdraw";

/**
 * A tour day's official conditions sources (#211): each one's link, and the
 * signed-in person's own Record my review. The organizer adds, edits and
 * removes sources; everyone records, corrects or withdraws only their own
 * review, and sees the crew's. Shown on Backcountry days and on any day with
 * sources. A review is a dated note, never a sign the forecast is current.
 */
export function DayConditions({ data, date, dateLabel, activity, userId, onSaved }: {
  data: TripFull;
  date: string;
  dateLabel: string;
  /** The activity the day page shows: the day's own or its stop's first. */
  activity: string | null;
  /** The signed-in person, who records their own reviews. */
  userId: string | null;
  onSaved: () => Promise<void>;
}) {
  const sources = data.conditions?.filter((source) => source.date === date) ?? [];
  const canEdit = !!userId && data.trip.owner_user_id === userId;
  const dayId = data.days.find((day) => day.date === date)?.id;
  // The source being edited, null to add one.
  const [editing, setEditing] = useState<{ source: TripDayConditionsSource | null } | null>(null);
  const [reviewing, setReviewing] = useState<{ sourceId: string; mode: ReviewMode } | null>(null);
  const [status, setStatus] = useState("");
  const focus = useReturnFocus();
  // An open editor, or the result it announced, keeps the section on the page:
  // removing another activity's last source would otherwise unmount the sheet
  // before it can close, return focus and say what happened.
  if (activity !== TOUR_ACTIVITY && sources.length === 0 && !editing && !reviewing && !status) return null;

  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" });
  const mine = (source: TripDayConditionsSource) => source.reviews.find((review) => review.user_id === userId);
  const recorded = sources.filter((source) => isCurrent(mine(source)) && mine(source)!.stale_reasons.length === 0).length;
  const saved = async (message: string) => { setStatus(message); await onSaved(); };
  const heading = () => document.getElementById("conditions-heading");
  const openEditor = (source: TripDayConditionsSource | null) => { focus.remember(heading); setStatus(""); setEditing({ source }); };
  const openReview = (sourceId: string, mode: ReviewMode) => { focus.remember(heading); setStatus(""); setReviewing({ sourceId, mode }); };
  const reviewSource = reviewing && sources.find((source) => source.id === reviewing.sourceId);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="conditions-heading" tabIndex={-1} className="text-title font-semibold text-foreground">Conditions</h2>
        {canEdit && <Button type="button" variant="outline" onClick={() => openEditor(null)}>Add source</Button>}
      </div>
      {!canEdit && <p className="mt-1 text-base text-muted-foreground">Sources are managed by the organizer. You record your own reviews.</p>}
      <p aria-live="polite" className="text-sm text-success">{status}</p>
      {sources.length === 0 ? (
        <p className="mt-2 text-base text-muted-foreground">
          {canEdit
            ? "No sources yet. Add or check an official source: the avalanche forecast, mountain weather and access or closures for this area."
            : "No sources yet. Check an official source before you go; the organizer can add links here."}
        </p>
      ) : (
        <>
          {userId && <p className="mt-2 text-base font-medium text-foreground">Your reviews: {recorded} of {sources.length} recorded for {weekday}</p>}
          <ul className="mt-3 space-y-4">
            {sources.map((source) => (
              <SourceRow key={source.id} data={data} source={source} userId={userId} canEdit={canEdit}
                onEdit={() => openEditor(source)} onReview={(mode) => openReview(source.id, mode)} />
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        A recorded review notes who looked at a source and when. It doesn&apos;t mean the forecast is current or the plan is safe.
      </p>
      {editing && <SourceEditor key={editing.source?.id ?? "new"} tripId={data.trip.id} date={date} dateLabel={dateLabel} dayId={dayId}
        source={editing.source} onSaved={saved} onClose={() => setEditing(null)} onCloseAutoFocus={focus.restore} />}
      {reviewing && <ReviewEditor key={`${reviewing.sourceId}:${reviewing.mode}`} tripId={data.trip.id} date={date} dateLabel={dateLabel}
        dayId={dayId} source={reviewSource || undefined} review={reviewSource ? mine(reviewSource) : undefined} mode={reviewing.mode}
        onSaved={saved} onReload={onSaved} onClose={() => setReviewing(null)} onCloseAutoFocus={focus.restore} />}
    </Card>
  );
}

function SourceRow({ data, source, userId, canEdit, onEdit, onReview }: {
  data: TripFull;
  source: TripDayConditionsSource;
  userId: string | null;
  canEdit: boolean;
  onEdit: () => void;
  onReview: (mode: ReviewMode) => void;
}) {
  const review = userId ? source.reviews.find((entry) => entry.user_id === userId) : undefined;
  const crew = source.reviews.filter((entry) => entry.user_id !== userId);
  const current = isCurrent(review);
  const stale = current && review!.stale_reasons.length > 0;
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="text-sm text-muted-foreground">{CATEGORY[source.category].label}{source.region ? ` · ${source.region}` : ""}</p>
      <p className="break-words text-base font-semibold text-foreground">{source.name}</p>
      <a href={source.url} target="_blank" rel="noopener noreferrer" className={externalLink}>
        {CATEGORY[source.category].open} (new tab)
      </a>
      <p className="text-sm text-muted-foreground">Validity not available in SWTTR — check the source.</p>
      <p className="text-sm text-muted-foreground">Added by the organizer</p>

      {userId && (
        <div className="mt-2 rounded-control border border-border p-3 text-base text-foreground">
          {!current ? (
            <p>No review recorded{review ? ` · You withdrew your review ${when(review.current.created_at)}` : ""}</p>
          ) : stale ? (
            <>
              <Badge variant="warning">Plan changed — review again</Badge>
              <p className="mt-1">{review!.stale_reasons.join(" · ")}</p>
              <p className="text-sm text-muted-foreground">You reviewed it {when(review!.current.reviewed_at)}, before the change.</p>
            </>
          ) : (
            <p>You reviewed this source {when(review!.current.reviewed_at)}</p>
          )}
          {current && review!.current.note && <p className="mt-1 break-words whitespace-pre-wrap">Your note: {review!.current.note}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant={current && !stale ? "outline" : "default"} onClick={() => onReview("record")}
              aria-label={`Record my review of ${source.name}`}>Record my review</Button>
            {current && <Button type="button" variant="outline" onClick={() => onReview("correct")}
              aria-label={`Edit note on my review of ${source.name}`}>Edit note</Button>}
            {current && <Button type="button" variant="ghost" onClick={() => onReview("withdraw")}
              aria-label={`Withdraw review of ${source.name}`}>Withdraw review</Button>}
          </div>
          {review && review.history.length > 0 && <History label="Your review history" review={review} />}
        </div>
      )}

      {crew.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-base text-foreground">Crew reviews ({crew.length})</summary>
          <ul className="space-y-3 pb-2">
            {crew.map((entry) => <CrewReview key={entry.user_id} review={entry} name={reviewerName(data, entry.user_id)} />)}
          </ul>
        </details>
      )}
      {canEdit && <Button type="button" variant="ghost" className="mt-1" onClick={onEdit} aria-label={`Edit source ${source.name}`}>Edit source</Button>}
    </li>
  );
}

function CrewReview({ review, name }: { review: TripConditionsReview; name: string }) {
  const withdrawn = review.current.action === "withdrawn";
  return (
    <li className="text-base text-foreground">
      <p>{withdrawn
        ? `${name} withdrew their review · ${when(review.current.created_at)}`
        : `${name} recorded a review · ${when(review.current.reviewed_at)}`}</p>
      {!withdrawn && review.stale_reasons.length > 0 && (
        <p><Badge variant="warning">Plan changed since</Badge> {review.stale_reasons.join(" · ")}</p>
      )}
      {!withdrawn && review.current.note && <p className="break-words whitespace-pre-wrap text-muted-foreground">{review.current.note}</p>}
      {review.history.length > 0 && <History label={`${name}'s review history`} review={review} />}
    </li>
  );
}

const ENTRY_LABEL: Record<TripConditionsReviewEntry["action"], string> = {
  reviewed: "Recorded a review", corrected: "Corrected the note", withdrawn: "Withdrew the review",
};

/** Every entry, newest first, each attributed and dated. */
function History({ label, review }: { label: string; review: TripConditionsReview }) {
  return (
    <details className="mt-1">
      <summary className="min-h-11 cursor-pointer py-2 text-sm text-foreground">{label}</summary>
      <ol className="space-y-1 text-sm text-muted-foreground">
        {[review.current, ...review.history].map((entry) => (
          <li key={entry.id} className="break-words whitespace-pre-wrap">
            {ENTRY_LABEL[entry.action]} · {when(entry.created_at)}{entry.note && entry.action !== "withdrawn" ? ` · ${entry.note}` : ""}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Cancel, Escape and Back for an editor sheet: they ask before discarding edits. */
function useEditorClose(dirty: boolean, busy: boolean, confirming: boolean, stopConfirming: () => void) {
  const [discarding, setDiscarding] = useState(false);
  const [closed, setClosed] = useState(false);
  const handleBack = () => {
    if (busy) return true;
    if (confirming) { stopConfirming(); return true; }
    if (dirty) { setDiscarding(true); return true; }
    setClosed(true);
    return false;
  };
  const history = useTripEditorHistory(handleBack, dirty && !closed);
  return {
    closed,
    discarding,
    close: () => { history.leave(); setClosed(true); },
    requestClose: () => { if (handleBack()) history.ensureEntry(); else history.leave(); },
    keepEditing: () => { setDiscarding(false); history.ensureEntry(); },
  };
}

function useFieldErrors(form: RefObject<HTMLFormElement | null>, busy: boolean) {
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (busy || !field) return;
    const element = form.current?.elements.namedItem(field);
    if (element instanceof HTMLElement) element.focus();
  }, [busy, field, form]);
  return {
    error, field, conflict,
    clear: () => { setError(null); setField(null); },
    show: (err: unknown) => {
      setError(errorMessage(err));
      setConflict(err instanceof TripRequestError && err.status === 409);
      setField(err instanceof TripRequestError && typeof err.details?.field === "string" ? err.details.field : null);
    },
    resolve: () => setConflict(false),
  };
}

type SourceDraft = { category: TripConditionsCategory; name: string; region: string; url: string };

function SourceEditor({ tripId, date, dateLabel, dayId, source, onSaved, onClose, onCloseAutoFocus }: {
  tripId: string;
  date: string;
  dateLabel: string;
  /** The day the editor opened for; after a date change another day can hold this date. */
  dayId: string | undefined;
  /** The source to change, or null to add one. */
  source: TripDayConditionsSource | null;
  onSaved: (message: string) => Promise<void>;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [draft, setDraft] = useState<SourceDraft>(() => ({
    category: source?.category ?? "avalanche", name: source?.name ?? "", region: source?.region ?? "", url: source?.url ?? "",
  }));
  const [original] = useState(() => JSON.stringify(draft));
  // What the save applies to; Check the latest moves it to what's saved now.
  const [target, setTarget] = useState({ sourceId: source?.id ?? null, revision: source?.revision ?? 0, dayId });
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  // One identity per input, so a retry of an uncertain save replays rather than saving twice.
  const mutationId = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const errors = useFieldErrors(form, busy);
  const sheet = useEditorClose(JSON.stringify(draft) !== original, busy, removing, () => setRemoving(false));

  const change = (field: keyof SourceDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    mutationId.current = null;
    errors.clear();
  };
  const send = async (action: "add" | "save" | "remove", message: string) => {
    if (busy) return;
    mutationId.current ??= crypto.randomUUID();
    setBusy(true); errors.clear();
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${date}/conditions`, "POST", {
        action, day_id: target.dayId, mutation_id: mutationId.current,
        ...(action === "add" ? {} : { source_id: target.sourceId, expected_revision: target.revision }),
        ...(action === "remove" ? {} : { source: { ...draft, region: draft.region.trim() || null } }),
      });
      await onSaved(message);
      sheet.close();
    } catch (err) { errors.show(err); }
    finally { setBusy(false); }
  };
  const save = (event?: FormEvent) => {
    event?.preventDefault();
    void send(target.sourceId ? "save" : "add", target.sourceId ? "Source saved." : "Source added.");
  };
  const remove = () => {
    if (!removing) { mutationId.current = null; setRemoving(true); return; }
    void send("remove", `Source removed from ${dateLabel}. Reviews recorded for it are kept.`);
  };
  const inspect = async () => {
    setBusy(true); errors.clear();
    try {
      const current = await timedTripRequest<TripFull>(`/api/v1/trips/${tripId}`, "GET");
      const saved = target.sourceId ? current.conditions?.find((entry) => entry.id === target.sourceId && entry.date === date) : undefined;
      setTarget({ sourceId: saved?.id ?? null, revision: saved?.revision ?? 0, dayId: current.days.find((entry) => entry.date === date)?.id });
      setNotice(saved
        ? `Saved now: ${saved.name} · ${saved.url}. Your changes are still in the form; save to replace it.`
        : target.sourceId ? `This source isn't on ${dateLabel} any more. Save to add yours as a new source.`
        : "Your source is still in the form; save to add it.");
      setRemoving(false); errors.resolve();
      mutationId.current = null;
    } catch (err) { errors.show(err); }
    finally { setBusy(false); }
  };

  const describedBy = (key: string, hint?: boolean) => errors.field === key ? "conditions-source-error" : hint ? `${key}-hint` : undefined;
  const title = sheet.discarding ? "Discard changes?" : removing ? "Remove source?" : target.sourceId ? "Edit source" : "Add source";
  return (
    <TripSheet open={!sheet.closed} busy={busy} onClose={sheet.requestClose} className="sm:max-w-xl"
      onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
      header={<>
        <TripSheetTitle>{title}</TripSheetTitle>
        <TripSheetDescription>{sheet.discarding ? "The saved sources will be kept." : `${dateLabel} · Shared with the crew · Managed by the organizer`}</TripSheetDescription>
      </>}
      footer={sheet.discarding ? <>
        <Button type="button" onClick={(event) => { event.preventDefault(); sheet.keepEditing(); }}>Keep editing</Button>
        <Button type="button" variant="outline" onClick={sheet.close}>Discard changes</Button>
      </> : errors.conflict ? <>
        <Button type="button" loading={busy} onClick={() => void inspect()}>Check the latest</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={sheet.requestClose}>Cancel</Button>
      </> : removing ? <>
        <Button type="button" variant="destructive" loading={busy} onClick={remove}>Remove source</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoving(false)}>Keep source</Button>
      </> : <>
        <Button type="submit" form="conditions-source-form" loading={busy}>Save source</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={sheet.requestClose}>Cancel</Button>
        {target.sourceId && <Button type="button" variant="ghost" disabled={busy} onClick={remove}>Remove from this day</Button>}
      </>}
    >
      {!sheet.discarding && <div className="space-y-4">
        {notice && <p className="rounded-control border border-warning p-3 text-base text-foreground">{notice}</p>}
        {errors.error && <p id="conditions-source-error" role="alert" className="text-base text-destructive">{errors.error}</p>}
        {removing ? (
          <p className="break-words text-base text-foreground">
            {source?.name} will no longer be listed for {dateLabel}. Reviews already recorded for it are kept.
          </p>
        ) : (
          <form id="conditions-source-form" ref={form} onSubmit={save} className="space-y-4" aria-busy={busy}>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <label className="block min-w-0 space-y-1 text-base text-foreground">
                <span>Type</span>
                <select name="category" value={draft.category} onChange={(event) => change("category", event.target.value)}
                  className={fieldClassName} aria-invalid={errors.field === "category" || undefined} aria-describedby={describedBy("category")}>
                  {(Object.keys(CATEGORY) as TripConditionsCategory[]).map((key) => <option key={key} value={key}>{CATEGORY[key].label}</option>)}
                </select>
              </label>
              {([
                ["name", "Source name", { required: true, maxLength: 200, hint: "e.g. Mount Washington Avalanche Center" }],
                ["region", "Area or region (optional)", { maxLength: 200, hint: "The forecast zone or area it covers, e.g. Presidential Range." }],
                ["url", "Link", { required: true, maxLength: 2000, type: "url", hint: "The official page, starting with https://" }],
              ] as const).map(([key, label, options]) => (
                <div key={key} className="min-w-0 space-y-1 text-base text-foreground">
                  <label className="block space-y-1">
                    <span>{label}</span>
                    <Input name={key} type={"type" in options ? options.type : "text"} required={"required" in options} maxLength={options.maxLength}
                      value={draft[key]} onChange={(event) => change(key, event.target.value)} className={fieldClassName}
                      aria-invalid={errors.field === key || undefined} aria-describedby={describedBy(key, true)} />
                  </label>
                  <p id={`${key}-hint`} className="text-sm text-muted-foreground">{options.hint}</p>
                </div>
              ))}
            </fieldset>
          </form>
        )}
        {busy && <p role="status" className="text-base text-muted-foreground">
          {errors.conflict ? "Loading the saved sources…" : removing ? "Removing source…" : "Saving source…"}
        </p>}
      </div>}
    </TripSheet>
  );
}

function ReviewEditor({ tripId, date, dateLabel, dayId, source, review, mode, onSaved, onReload, onClose, onCloseAutoFocus }: {
  tripId: string;
  date: string;
  dateLabel: string;
  dayId: string | undefined;
  /** The source as saved now; missing when it was removed from the day. */
  source: TripDayConditionsSource | undefined;
  /** The person's own review, as saved now. */
  review: TripConditionsReview | undefined;
  mode: ReviewMode;
  onSaved: (message: string) => Promise<void>;
  /** Reloads the trip, so the source and review props are what's saved now. */
  onReload: () => Promise<void>;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [note, setNote] = useState(mode === "correct" ? review?.current.note ?? "" : "");
  const [original] = useState(note);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationId = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const errors = useFieldErrors(form, busy);
  const sheet = useEditorClose(note !== original, busy, false, () => {});

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !source) return;
    mutationId.current ??= crypto.randomUUID();
    setBusy(true); errors.clear();
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/days/${date}/conditions/reviews`, "POST", {
        action: mode, day_id: dayId, source_id: source.id, expected_entry_id: review?.current.id ?? null,
        mutation_id: mutationId.current,
        ...(mode === "withdraw" ? {} : { note: note.trim() || null }),
        ...(mode === "record" ? { context_key: source.context_key } : {}),
      });
      await onSaved(mode === "record" ? "Review recorded." : mode === "correct" ? "Note saved." : "Review withdrawn.");
      sheet.close();
    } catch (err) { errors.show(err); }
    finally { setBusy(false); }
  };
  const reload = async () => {
    setBusy(true); errors.clear();
    try {
      await onReload();
      setNotice("The day's plan, the source or your review changed. Check the source again; your note is still here.");
      errors.resolve();
      mutationId.current = null;
    } catch (err) { errors.show(err); }
    finally { setBusy(false); }
  };

  const title = sheet.discarding ? "Discard changes?" : mode === "record" ? "Record my review" : mode === "correct" ? "Edit review note" : "Withdraw review?";
  const action = mode === "record" ? "Save review" : mode === "correct" ? "Save note" : "Withdraw review";
  return (
    <TripSheet open={!sheet.closed} busy={busy} onClose={sheet.requestClose}
      onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
      header={<>
        <TripSheetTitle>{title}</TripSheetTitle>
        <TripSheetDescription>{sheet.discarding ? "Your note won't be saved." : `${source?.name ?? "Source removed"} · ${dateLabel}`}</TripSheetDescription>
      </>}
      footer={sheet.discarding ? <>
        <Button type="button" onClick={(event) => { event.preventDefault(); sheet.keepEditing(); }}>Keep editing</Button>
        <Button type="button" variant="outline" onClick={sheet.close}>Discard changes</Button>
      </> : errors.conflict ? <>
        <Button type="button" loading={busy} onClick={() => void reload()}>Check the latest</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={sheet.requestClose}>Cancel</Button>
      </> : <>
        {source && <Button type="submit" form="conditions-review-form" variant={mode === "withdraw" ? "destructive" : "default"} loading={busy}>{action}</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={sheet.requestClose}>{mode === "withdraw" ? "Keep review" : "Cancel"}</Button>
      </>}
    >
      {!sheet.discarding && <div className="space-y-4 text-base text-foreground">
        {notice && <p className="rounded-control border border-warning p-3">{notice}</p>}
        {errors.error && <p id="conditions-review-error" role="alert" className="text-destructive">{errors.error}</p>}
        {!source ? (
          <p>This source isn&apos;t listed for {dateLabel} any more, so there&apos;s nothing to record.</p>
        ) : (
          <form id="conditions-review-form" ref={form} onSubmit={send} className="space-y-3" aria-busy={busy}>
            {mode === "record" && <>
              <p className="break-words">
                Records that you reviewed {source.name} for {dateLabel}, with the time you save it. Opening the link doesn&apos;t record anything.
              </p>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className={externalLink}>{CATEGORY[source.category].open} (new tab)</a>
            </>}
            {mode === "withdraw" && (
              <p className="break-words">Your review of {source.name} for {dateLabel} will show as withdrawn. Its history is kept.</p>
            )}
            {mode !== "withdraw" && (
              <div className="min-w-0 space-y-1">
                <label className="block space-y-1">
                  <span>Note (optional)</span>
                  <textarea name="note" rows={3} maxLength={1000} value={note} disabled={busy}
                    onChange={(event) => { setNote(event.target.value); mutationId.current = null; errors.clear(); }}
                    className={cn(fieldClassName, "h-auto py-2")} aria-invalid={errors.field === "note" || undefined}
                    aria-describedby={errors.field === "note" ? "conditions-review-error" : "note-hint"} />
                </label>
                <p id="note-hint" className="text-sm text-muted-foreground">The crew sees it. Say if you checked earlier, or what to watch for.</p>
              </div>
            )}
          </form>
        )}
        {busy && <p role="status" className="text-muted-foreground">{errors.conflict ? "Loading the latest…" : "Saving…"}</p>}
      </div>}
    </TripSheet>
  );
}
