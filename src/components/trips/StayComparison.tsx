"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/input";
import { BackLink } from "@/components/trips/trip-primitives";
import { RoutingAttribution } from "@/components/trips/DriveEstimate";
import { StayOptionEditor } from "@/components/trips/StayOptionEditor";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "@/components/trips/TripSheet";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { errorMessage, timedTripRequest, tripRequest, TripRequestError } from "@/lib/trip-requests";
import { cn } from "@/lib/utils";
import type { TripFull, TripStayCandidate, TripStayCandidates, TripStayComparison, TripStayComparisonOption } from "@/types/trips";

/** Up to three stays side by side: more don't fit beside each other on a phone or in one look. */
const MAX_OPTIONS = 3;

/** The comparison's starting point, from the page's address. */
interface ComparisonSelection {
  options: string[];
  first_night: string | null;
  checkout: string | null;
}

/** The trip's options, loaded again after each change to them. */
function useStayOptions(tripId: string) {
  const [state, setState] = useState<{ list: TripStayCandidates | null; error: string | null }>({ list: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    tripRequest<TripStayCandidates>(`/api/v1/trips/${tripId}/stay-candidates`, "GET", undefined, { signal: controller.signal })
      .then((list) => { if (!controller.signal.aborted) setState({ list, error: null }); })
      .catch((err) => { if (!controller.signal.aborted) setState((prev) => ({ list: prev.list, error: errorMessage(err) })); });
    return () => controller.abort();
  }, [tripId, attempt]);
  return { ...state, reload: useCallback(() => setAttempt((n) => n + 1), []) };
}

/**
 * The comparison for one request, fetched again when the trip's plan or the
 * options change. An answer is kept with the request it was for, so an older
 * one never shows against a newer choice.
 */
function useComparison(tripId: string, query: string | null, plan: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; comparison: TripStayComparison | null; error: string | null } | null>(null);
  const key = query && `${query}|${plan}`;
  useEffect(() => {
    if (!query || !key) return;
    const controller = new AbortController();
    const requested = attempt;
    tripRequest<TripStayComparison>(`/api/v1/trips/${tripId}/stay-candidates/compare?${query}`, "GET", undefined, { signal: controller.signal })
      .then((comparison) => { if (!controller.signal.aborted) setResult({ key, attempt: requested, comparison, error: null }); })
      .catch((err) => { if (!controller.signal.aborted) setResult({ key, attempt: requested, comparison: null, error: errorMessage(err) }); });
    return () => controller.abort();
  }, [tripId, query, key, attempt]);
  const current = key && result?.key === key && result.attempt === attempt ? result : null;
  return { comparison: current?.comparison ?? null, error: current?.error ?? null, loading: !!query && !current, retry: () => setAttempt((n) => n + 1) };
}

const optionKey = (kind: "stay" | "candidate", id: string) => `${kind}:${id}`;

/**
 * Compare stays (#213): two or three saved stays or options over the same
 * nights, by the drives on the mornings after them. Choosing, comparing and
 * saving options never changes who's staying where. Selection and nights are
 * kept in the page's address, so a reload or a property page opened in a new
 * tab leaves them as they were. See docs/trip-stays.md#comparing-stays-213.
 */
export function StayComparison({ data, canEdit, initial }: { data: TripFull; canEdit: boolean; initial: ComparisonSelection }) {
  const tripId = data.trip.id;
  const options = useStayOptions(tripId);
  const [selected, setSelected] = useState<string[]>(initial.options.slice(0, MAX_OPTIONS));
  const [nights, setNights] = useState<{ first_night: string; checkout: string } | null>(
    initial.first_night && initial.checkout ? { first_night: initial.first_night, checkout: initial.checkout } : null);
  const [editor, setEditor] = useState<{ candidate: TripStayCandidate | null } | null>(null);
  const [removing, setRemoving] = useState<TripStayCandidate | null>(null);
  const [status, setStatus] = useState("");
  const focus = useReturnFocus();

  const stays = data.lodging?.stays ?? [];
  const candidates = useMemo(() => options.list?.candidates ?? [], [options.list]);
  // A saved option that's become a stay is listed with the stays.
  const listedCandidates = candidates.filter((candidate) => !stays.some((stay) => stay.id === candidate.id));
  const known = new Set([...stays.map((stay) => optionKey("stay", stay.id)), ...listedCandidates.map((candidate) => optionKey("candidate", candidate.id))]);
  // Until the options load, a candidate in the address may still exist.
  const chosen = selected.filter((key) => known.has(key) || (!options.list && key.startsWith("candidate:")));
  const range = nights ?? options.list?.default_window ?? null;
  const loaded = !!options.list;
  const chosenKeys = chosen.join(",");

  // The address keeps the selection and nights for reloads and returning to the page.
  useEffect(() => {
    if (!loaded) return;
    const params = new URLSearchParams();
    if (chosenKeys) params.set("options", chosenKeys);
    if (nights) { params.set("first_night", nights.first_night); params.set("checkout", nights.checkout); }
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    // With null state Next adopts the new address; with its own state it would keep the old one.
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [loaded, chosenKeys, nights]);

  // The request names the plan it compares, so any change to the trip's stays, nights or days asks again.
  const plan = useMemo(() => JSON.stringify([data.trip.start_date, data.trip.end_date, data.lodging?.revision, data.lodging?.people_key,
    data.stops.map((stop) => [stop.id, stop.access_point]), data.days.map((day) => [day.date, day.stop_id, day.access_point, day.origin, day.origin_stay_id, day.no_drive]),
    (data.member_origins ?? []).map((row) => [row.trip_day_id, row.member_id, row.no_drive]), candidates.map((candidate) => [candidate.id, candidate.revision])]),
  [data, candidates]);
  const query = options.list && range && chosen.length >= 2 && chosen.every((key) => known.has(key))
    ? new URLSearchParams({ options: chosenKeys, first_night: range.first_night, checkout: range.checkout }).toString() : null;
  const result = useComparison(tripId, query, plan);

  const toggle = (key: string, on: boolean) => setSelected((prev) => on ? [...prev.filter((entry) => entry !== key), key].slice(0, MAX_OPTIONS) : prev.filter((entry) => entry !== key));
  const openEditor = (candidate: TripStayCandidate | null) => {
    focus.remember(() => document.getElementById("stay-options-heading"));
    setEditor({ candidate });
  };
  const full = chosen.length >= MAX_OPTIONS;
  const choices = options.list;

  return <section aria-labelledby="compare-stays-heading" className="@container min-w-0">
    <BackLink href={`/trips/${tripId}/stays`}>Stays</BackLink>
    <h1 id="compare-stays-heading" tabIndex={-1} className="text-title font-semibold text-foreground md:text-title-lg">Compare stays</h1>
    <p className="mt-1 max-w-3xl text-base text-muted-foreground">See how each place would change the drives to the days you&apos;ve planned. Comparing doesn&apos;t change who&apos;s staying where, and an option isn&apos;t a booking.</p>
    {!canEdit && <p className="mt-1 text-base text-muted-foreground">Options are managed by the organizer</p>}
    <p aria-live="polite" className="text-sm text-success">{status}</p>
    {options.error && !choices && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-base text-destructive">
      <p>{options.error}</p><Button type="button" variant="outline" onClick={options.reload}>Try again</Button>
    </div>}

    {choices && range && <fieldset className="mt-6 max-w-3xl min-w-0">
      <legend className="text-lg font-semibold text-foreground">Nights to compare</legend>
      <p className="text-base text-muted-foreground">The drives compared are on the mornings after these nights, check-out morning included.</p>
      <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1 text-base text-foreground"><span>First night</span>
          <select name="first_night" value={range.first_night} className={fieldClassName} onChange={(event) => {
            const first = event.target.value;
            setNights({ first_night: first, checkout: range.checkout > first ? range.checkout : choices.checkouts.find((morning) => morning.date > first)!.date });
          }}>{choices.first_nights.map((night) => <option key={night.date} value={night.date}>{night.label}</option>)}</select></label>
        <label className="block min-w-0 space-y-1 text-base text-foreground"><span>Check-out morning</span>
          <select name="checkout" value={range.checkout} className={fieldClassName} onChange={(event) => setNights({ first_night: range.first_night, checkout: event.target.value })}>
            {choices.checkouts.filter((morning) => morning.date > range.first_night).map((morning) => <option key={morning.date} value={morning.date}>{morning.label}</option>)}
          </select></label>
      </div>
    </fieldset>}

    {choices && <section aria-labelledby="stay-options-heading" className="mt-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="stay-options-heading" tabIndex={-1} className="text-lg font-semibold text-foreground">Stays to compare</h2>
        {canEdit && choices.available && <Button type="button" variant="outline" onClick={() => openEditor(null)}>Add a stay to compare</Button>}
      </div>
      <p className="text-base text-muted-foreground">Choose two or three. They&apos;re shown in the order you choose them.{full ? " Three are chosen: clear one to choose another." : ""}</p>
      {!choices.available && <p className="mt-1 text-base text-muted-foreground">Options can&apos;t be added yet. Saved stays can still be compared.</p>}
      <fieldset className="mt-2 min-w-0">
        <legend className="sr-only">Stays to compare</legend>
        {!!stays.length && <p className="mt-2 text-sm font-medium text-muted-foreground">Saved stays</p>}
        <ul className="divide-y divide-border">
          {stays.map((stay) => <OptionCheck key={stay.id} name={stay.name} chosen={chosen.indexOf(optionKey("stay", stay.id))} disabled={full}
            facts={[stay.date_label, stay.booking_status === "booked" ? "Booked" : "Booking not confirmed", !stay.location && "Location needed for drive times"]}
            onChange={(on) => toggle(optionKey("stay", stay.id), on)} />)}
        </ul>
        {!!listedCandidates.length && <p className="mt-4 text-sm font-medium text-muted-foreground">Options you&apos;re considering</p>}
        <ul className="divide-y divide-border">
          {listedCandidates.map((candidate) => <OptionCheck key={candidate.id} name={candidate.name} chosen={chosen.indexOf(optionKey("candidate", candidate.id))} disabled={full}
            facts={[candidate.cost_label ?? candidate.date_label, !candidate.location && "Location needed for drive times", candidate.location?.precision === "approximate" && "Approximate location"]}
            onChange={(on) => toggle(optionKey("candidate", candidate.id), on)}
            actions={canEdit && <>
              <Button type="button" variant="ghost" onClick={() => openEditor(candidate)} aria-label={`Change ${candidate.name}`}>Change</Button>
              <Button type="button" variant="ghost" onClick={() => { focus.remember(() => document.getElementById("stay-options-heading")); setRemoving(candidate); }}
                aria-label={`Remove ${candidate.name} from the options`}>Remove</Button>
            </>} />)}
        </ul>
      </fieldset>
    </section>}

    <section aria-labelledby="comparison-heading" className="mt-8 min-w-0">
      <h2 id="comparison-heading" className="text-lg font-semibold text-foreground">Comparison</h2>
      {choices && chosen.length < 2 && <div className="max-w-3xl">
        <p className="text-base text-foreground">{chosen.length ? "Choose one more stay to compare." : "Choose two or three stays to compare."}</p>
        <p className="text-base text-muted-foreground">A comparison puts each stay&apos;s drives to the same planned days side by side. Each needs a location for its drive times.</p>
        {stays.length + listedCandidates.length < 2 && (canEdit && choices.available
          ? <Button type="button" className="mt-2" onClick={() => openEditor(null)}>Add another stay</Button>
          : <p className="text-base text-muted-foreground">{canEdit ? "Save another stay first." : "The organizer can add stays to compare."}</p>)}
      </div>}
      {result.loading && <p role="status" className="text-base text-muted-foreground">Comparing the drives…</p>}
      {result.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-base text-destructive">
        <p>{result.error}</p><Button type="button" variant="outline" onClick={result.retry}>Try again</Button>
      </div>}
      {result.comparison && <ComparisonView comparison={result.comparison} />}
    </section>

    {editor && <StayOptionEditor key={editor.candidate?.id ?? "new"} tripId={tripId} candidate={editor.candidate}
      onClose={() => setEditor(null)} onCloseAutoFocus={focus.restore}
      onSaved={async (saved, added) => {
        options.reload();
        if (added && chosen.length < MAX_OPTIONS) {
          setSelected((prev) => [...prev, optionKey("candidate", saved.id)]);
          setStatus(`${saved.name} saved and added to the comparison.`);
        } else setStatus(`${saved.name} saved.`);
      }} />}
    {removing && <RemoveOption tripId={tripId} candidate={removing} onClose={() => setRemoving(null)} onCloseAutoFocus={focus.restore}
      onRemoved={(message) => {
        setSelected((prev) => prev.filter((key) => key !== optionKey("candidate", removing.id)));
        setStatus(message);
        options.reload();
      }} />}
  </section>;
}

function OptionCheck({ name, chosen, disabled, facts, onChange, actions }: {
  name: string; chosen: number; disabled: boolean; facts: Array<string | null | false | undefined>; onChange: (on: boolean) => void; actions?: ReactNode;
}) {
  const on = chosen >= 0;
  // On a phone the actions go under the name, so a long name keeps the width.
  return <li className="flex flex-wrap items-start justify-between gap-x-3 py-2">
    <label className="flex min-h-11 min-w-0 basis-full items-start gap-3 py-1 text-base text-foreground @lg:basis-0 @lg:grow">
      <input type="checkbox" checked={on} disabled={disabled && !on} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-5 shrink-0" />
      <span className="min-w-0">
        <span className="block font-semibold wrap-anywhere">{name}{on && <span className="font-normal text-muted-foreground"> · {["First", "Second", "Third"][chosen]} in the comparison</span>}</span>
        <span className="block text-muted-foreground">{facts.filter(Boolean).join(" · ")}</span>
      </span>
    </label>
    {actions && <div className="flex shrink-0 gap-1 pl-6 @lg:pl-0">{actions}</div>}
  </li>;
}

function RemoveOption({ tripId, candidate, onClose, onCloseAutoFocus, onRemoved }: {
  tripId: string; candidate: TripStayCandidate; onClose: () => void; onCloseAutoFocus: (event: Event) => void; onRemoved: (message: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    try {
      await timedTripRequest(`/api/v1/trips/${tripId}/stay-candidates/${candidate.id}`, "DELETE", { expected_revision: candidate.revision });
      onRemoved(`${candidate.name} removed from the options.`);
      setOpen(false);
    } catch (err) {
      setError(err instanceof TripRequestError && err.status === 409 ? "It changed since this page loaded. Close this and check it again before removing it." : errorMessage(err));
    } finally { setBusy(false); }
  };
  return <TripSheet open={open} busy={busy} onClose={() => setOpen(false)} className="sm:max-w-md"
    onCloseAutoFocus={(event) => { onCloseAutoFocus(event); onClose(); }}
    header={<><TripSheetTitle>Remove this option?</TripSheetTitle><TripSheetDescription>Your stays, nights and bookings don&apos;t change.</TripSheetDescription></>}
    footer={<><Button type="button" loading={busy} onClick={remove}>Remove option</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></>}>
    <p className="break-words text-base text-foreground">{candidate.name} · {candidate.date_label}</p>
    {error && <p role="alert" className="mt-2 text-base text-destructive">{error}</p>}
    {busy && <p role="status" className="mt-2 text-base text-muted-foreground">Removing option…</p>}
  </TripSheet>;
}

type Cell = { main: ReactNode; detail?: ReactNode };
type Row = { key: string; heading: ReactNode; sub?: string | null; shared?: string | null; notes?: string[]; cells: Cell[] };
type Group = { key: string; title: string; caption: string; rows: Row[] };

const tag = (text: string) => <span className="block text-sm font-medium text-foreground">{text}</span>;

/** The server's comparison laid out: per-day drives and totals first, then cost and details. */
function ComparisonView({ comparison }: { comparison: TripStayComparison }) {
  const { options, window: compared } = comparison;
  const drives: Group = {
    key: "drives", title: "Drive each morning", caption: "One-way drive from each stay to each morning's destination", rows: comparison.days.map((day) => ({
      key: day.date, heading: `${day.date_label}${day.checkout ? " · check-out morning" : ""}`,
      sub: [day.activity_label, day.stop_label, day.destination_label && `to ${day.destination_label}`].filter(Boolean).join(" · ") || null,
      shared: day.shared, notes: day.notes,
      cells: day.drives.map((drive) => ({
        main: <span className={cn(!drive.known && "text-muted-foreground")}>{drive.label}</span>,
        detail: <>{drive.shortest && tag("Shortest that morning")}{drive.longest && tag("Its longest drive")}{drive.detail}</>,
      })),
    })),
  };
  const totals: Group = {
    key: "totals", title: "Totals", caption: "Each stay's drives over these mornings", rows: [
      { key: "longest", heading: "Longest known drive", cells: options.map((option) => ({ main: option.longest_label ?? "None known yet" })) },
      { key: "coverage", heading: "Drives known", cells: options.map((option) => ({ main: option.coverage_label })) },
      { key: "sum", heading: "Sum of planned outbound drives", sub: "One way, each morning compared, repeat visits counted. Not total trip travel.",
        cells: options.map((option) => ({ main: <span className={cn(!option.sum_complete && "text-muted-foreground")}>{option.sum_label}</span> })) },
    ],
  };
  const details: Group = {
    key: "details", title: "Cost and details", caption: "Each stay's cost estimate and details", rows: [
      { key: "cost", heading: "Estimated lodging cost", sub: "Entered by the organizer. Not a live price; fees and availability aren't checked.",
        cells: options.map((option) => ({ main: option.cost?.label ?? "Not entered", detail: option.cost?.note })) },
      { key: "booking", heading: "Booking", cells: options.map((option) => ({ main: option.booking_label })) },
      { key: "link", heading: "Property", cells: options.map((option) => ({
        main: option.property_url ? <a href={option.property_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary underline"
          aria-label={`Open ${option.name}'s website (new tab)`}>Open website (new tab)</a> : "No link saved",
        detail: option.address,
      })) },
      { key: "notes", heading: "Notes", cells: options.map((option) => ({ main: option.notes ? <span className="whitespace-pre-wrap">{option.notes}</span> : "None" })) },
    ],
  };
  return <div className="mt-2 min-w-0 space-y-6">
    <div className="max-w-3xl text-base">
      <p className="font-semibold text-foreground">{compared.label}</p>
      <p className="text-muted-foreground">{compared.mornings_label}</p>
      <h3 className="mt-3 text-base font-semibold text-foreground">The plan for these nights now</h3>
      <ul className="mt-1 space-y-1">{compared.nights.map((night) => <li key={night.date} className="break-words text-foreground">
        <span className="text-muted-foreground">Night of {night.date_label}:</span> {night.current}{night.booked.length ? ` · Booked: ${night.booked.join(", ")}` : ""}
      </li>)}</ul>
    </div>
    <OptionsList options={options} />
    <Layout options={options} groups={[drives, totals]} />
    <p className={cn("max-w-3xl text-base", comparison.comparable ? "text-foreground" : "text-muted-foreground")}>{comparison.summary}</p>
    <Layout options={options} groups={[details]} />
    {comparison.cost_note && <p className="max-w-3xl text-base text-muted-foreground">{comparison.cost_note}</p>}
    <div className="max-w-3xl space-y-1 text-sm text-muted-foreground">
      <p>Drives are one way, by car, with typical traffic rather than live traffic, and no departure time. Return drives aren&apos;t included. Check road conditions before you drive.</p>
      {comparison.closures.map((closure) => <p key={closure}>Avoids {closure}.</p>)}
      {comparison.credit && <RoutingAttribution />}
    </div>
  </div>;
}

/** Each stay's name, status for these nights and dates, above the figures on phones and in the table's heading on wider screens. */
function OptionFacts({ option }: { option: TripStayComparisonOption }) {
  return <>
    <span className="block text-base font-normal text-foreground">{option.status_label}</span>
    <span className="block text-sm font-normal text-muted-foreground">{option.date_label}</span>
    {option.dates_note && <span className="block text-sm font-normal text-warning">{option.dates_note}</span>}
    {option.location_note && <span className="block text-sm font-normal text-warning">{option.location_note}</span>}
  </>;
}

function OptionsList({ options }: { options: TripStayComparisonOption[] }) {
  return <div className="@3xl:hidden">
    <h3 className="text-base font-semibold text-foreground">Stays compared</h3>
    <ol className="mt-1 divide-y divide-border border-y border-border">
      {options.map((option) => <li key={option.key} className="py-2">
        <span className="block font-semibold text-foreground wrap-anywhere">{option.name}</span>
        <OptionFacts option={option} />
      </li>)}
    </ol>
  </div>;
}

/**
 * On phones each day or figure comes first with every stay's named value
 * beneath it, so nothing is hidden in another card; wider screens line the
 * stays up in columns, their names heading each table.
 */
function Layout({ options, groups }: { options: TripStayComparisonOption[]; groups: Group[] }) {
  return <>
    <div className="space-y-6 @3xl:hidden">
      {groups.map((group) => <section key={group.key} aria-labelledby={`compare-${group.key}-narrow`}>
        <h3 id={`compare-${group.key}-narrow`} className="text-base font-semibold text-foreground">{group.title}</h3>
        <div className="divide-y divide-border border-y border-border">
          {group.rows.map((row) => <div key={row.key} role="group" aria-labelledby={`compare-${group.key}-${row.key}-narrow`} className="py-3">
            <h4 id={`compare-${group.key}-${row.key}-narrow`} className="text-base font-semibold text-foreground">{row.heading}</h4>
            {row.sub && <p className="text-sm text-muted-foreground">{row.sub}</p>}
            {row.shared ? <p className="mt-1 text-base text-foreground">{row.shared} · the same for every stay</p>
              : <ul className="mt-1 space-y-2">{row.cells.map((cell, index) => <li key={options[index].key} className="min-w-0 text-base">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 font-medium text-foreground wrap-anywhere">{options[index].name}</span>
                  <span className="text-foreground">{cell.main}</span>
                </span>
                {cell.detail && <span className="block text-sm text-muted-foreground">{cell.detail}</span>}
              </li>)}</ul>}
            {row.notes?.map((note) => <p key={note} className="mt-1 text-sm text-muted-foreground">{note}</p>)}
          </div>)}
        </div>
      </section>)}
    </div>
    <div className="hidden @3xl:block">
      <table className="w-full table-fixed border-collapse text-base">
        <caption className="sr-only">{groups.map((group) => group.caption).join(". ")}</caption>
        <colgroup><col className="w-[28%]" />{options.map((option) => <col key={option.key} />)}</colgroup>
        <thead><tr className="border-b border-border">
          <td className="py-2 pr-4" />
          {options.map((option) => <th key={option.key} scope="col" className="px-3 py-2 text-left align-bottom font-semibold text-foreground">
            <span className="block wrap-anywhere">{option.name}</span>
            {groups[0].key === "drives" && <OptionFacts option={option} />}
          </th>)}
        </tr></thead>
        {groups.map((group) => <tbody key={group.key} className="divide-y divide-border border-b border-border">
          <tr><th scope="rowgroup" colSpan={options.length + 1} className="pt-5 pb-1 text-left text-base font-semibold text-foreground">{group.title}</th></tr>
          {group.rows.map((row) => <tr key={row.key}>
            <th scope="row" className="py-3 pr-4 text-left align-top font-normal">
              <span className="block font-semibold text-foreground">{row.heading}</span>
              {row.sub && <span className="block text-sm text-muted-foreground">{row.sub}</span>}
              {row.notes?.map((note) => <span key={note} className="block text-sm text-muted-foreground">{note}</span>)}
            </th>
            {row.shared ? <td colSpan={options.length} className="px-3 py-3 align-top text-foreground">{row.shared} · the same for every stay</td>
              : row.cells.map((cell, index) => <td key={options[index].key} className="min-w-0 px-3 py-3 align-top wrap-anywhere">
                <span className="block text-foreground">{cell.main}</span>
                {cell.detail && <span className="block text-sm text-muted-foreground">{cell.detail}</span>}
              </td>)}
          </tr>)}
        </tbody>)}
      </table>
    </div>
  </>;
}
