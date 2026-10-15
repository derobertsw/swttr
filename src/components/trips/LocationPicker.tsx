"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GEOAPIFY_CREDIT, OSM_CREDIT, isUsableCoordinate, locationMapUrl, roundCoordinate } from "@/lib/trip-location";
import type { TripLocation } from "@/types/trips";

const MIN_QUERY = 3;
const DEBOUNCE_MS = 350;
const SEARCH_UNAVAILABLE = "Location search isn't available right now.";

type Search =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "done"; results: TripLocation[] }
  | { state: "unavailable"; message: string };

const linkClass = "text-primary underline";

/** The credit a search provider requires wherever its places appear. */
function LocationCredit({ location }: { location?: TripLocation }) {
  if (location && location.provider !== "geoapify") return null;
  const data = location?.attribution && location.attribution !== OSM_CREDIT.label ? location.attribution : null;
  return <p className="text-sm text-muted-foreground">
    <a href={GEOAPIFY_CREDIT.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{GEOAPIFY_CREDIT.label}</a>
    {" · "}
    {data ?? <a href={OSM_CREDIT.url} target="_blank" rel="noopener noreferrer" className={linkClass}>{OSM_CREDIT.label}</a>}
  </p>;
}

/** A chosen place in words, so it stays usable when a map isn't. */
export function LocationSummary({ location, exactTarget }: { location: TripLocation; exactTarget: string }) {
  return <div className="min-w-0 space-y-1 break-words text-base">
    <p className="font-medium text-foreground">{location.label}</p>
    {location.address && <p className="text-muted-foreground">{location.address}</p>}
    <p className={location.precision === "approximate" ? "text-warning" : "text-muted-foreground"}>
      {location.precision === "approximate" ? `Approximate area — choose ${exactTarget} for drive times.`
        : location.source === "manual" ? "Exact location · entered coordinates" : "Exact location"}
    </p>
    <a href={locationMapUrl(location)} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "inline-flex min-h-11 items-center")}>Open map (new tab)</a>
    <LocationCredit location={location} />
  </div>;
}

/**
 * Finds and confirms a precise place (#208): search, check one result, then
 * Use this location. It returns the choice to the parent editor and saves
 * nothing itself. Entering coordinates is the fallback when search can't help.
 */
export function LocationPicker({ tripId, heading, exactTarget, value, initialQuery = "", name = "location", onChange, onSaveLater }: {
  tripId: string;
  /** Says what the place is for, e.g. "Where is the stay?" */
  heading: string;
  /** What an approximate area should be replaced with, e.g. "the exact property". */
  exactTarget: string;
  value: TripLocation | null;
  /** Searched straight away when there's no location yet, e.g. a stay's saved address. */
  initialQuery?: string;
  /** The search field's form name, so the parent can focus it. */
  name?: string;
  onChange: (location: TripLocation | null) => void;
  /** Keeps the typed name or address in the parent so the place can be set later. */
  onSaveLater?: (query: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(!value);
  const [query, setQuery] = useState(value ? "" : initialQuery);
  const [search, setSearch] = useState<Search>(() => !value && initialQuery.trim().length >= MIN_QUERY ? { state: "searching" } : { state: "idle" });
  const [active, setActive] = useState(-1);
  const [candidate, setCandidate] = useState<TripLocation | null>(null);
  const [coordinates, setCoordinates] = useState<{ latitude: string; longitude: string } | null>(null);
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const focusSoon = (ref: { current: HTMLElement | null }) => setTimeout(() => ref.current?.focus(), 0);
  const trimmed = query.trim();
  const results = search.state === "done" ? search.results : [];

  // Each new query aborts the last request, so a slow answer for an older
  // query can never replace newer results or the place being checked.
  useEffect(() => {
    if (!open || trimmed.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/trips/${tripId}/locations?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const body: { results?: unknown; error?: unknown } | null = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (response.ok && Array.isArray(body?.results)) setSearch({ state: "done", results: body.results as TripLocation[] });
        else setSearch({ state: "unavailable", message: response.status === 429 && typeof body?.error === "string" ? body.error : SEARCH_UNAVAILABLE });
      } catch {
        if (!controller.signal.aborted) setSearch({ state: "unavailable", message: SEARCH_UNAVAILABLE });
      }
    }, DEBOUNCE_MS);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, trimmed, tripId]);

  const type = (next: string) => {
    setQuery(next); setActive(-1);
    if (next.trim() === trimmed) return;
    setSearch(next.trim().length >= MIN_QUERY ? { state: "searching" } : { state: "idle" });
  };
  const check = (result: TripLocation) => { setCandidate(result); setActive(-1); focusSoon(previewRef); };
  const backToResults = () => { setCandidate(null); focusSoon(inputRef); };
  const choose = (location: TripLocation) => {
    onChange(location);
    setCandidate(null); setCoordinates(null); setOpen(false);
    focusSoon(changeRef);
  };
  const keepCurrent = () => { setCandidate(null); setCoordinates(null); setOpen(false); focusSoon(changeRef); };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter never submits the surrounding form from here.
    if (event.key === "Enter") {
      event.preventDefault();
      if (results[active]) check(results[active]);
    } else if (results.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setActive((index) => event.key === "ArrowDown" ? (index + 1) % results.length : index <= 0 ? results.length - 1 : index - 1);
    }
  };
  const applyCoordinates = () => {
    if (!coordinates) return;
    // A pasted "44.4939, -72.7392" in the first field fills both.
    const pair = coordinates.longitude.trim() ? null : coordinates.latitude.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    const [latText, lonText] = pair ? [pair[1], pair[2]] : [coordinates.latitude, coordinates.longitude];
    const latitude = latText.trim() ? Number(latText) : NaN, longitude = lonText.trim() ? Number(lonText) : NaN;
    if (!isUsableCoordinate(latitude, longitude)) {
      setCoordinateError("Enter a latitude from -90 to 90 and a longitude from -180 to 180, like 44.4939 and -72.7392. 0, 0 isn't a usable location.");
      focusSoon(latitudeRef);
      return;
    }
    const [lat, lon] = [roundCoordinate(latitude), roundCoordinate(longitude)];
    choose({ label: "Entered coordinates", address: `${lat}, ${lon}`, latitude: lat, longitude: lon, precision: "exact",
      time_zone: null, source: "manual", provider: null, provider_id: null, attribution: null });
  };

  const listboxId = `${id}-results`;
  const status = search.state === "searching" ? "Searching…"
    : search.state === "unavailable" ? `${search.message} Save the address for now and set the location later, or enter coordinates.`
    : search.state === "done" ? results.length ? `${results.length} ${results.length === 1 ? "place" : "places"} found. Choose one to check it.`
      : "No matches. Try the name with its town, or save the address for now and set the location later."
    : "";
  const canSaveLater = onSaveLater && trimmed && (search.state === "unavailable" || (search.state === "done" && !results.length));

  return <fieldset className="min-w-0 space-y-3">
    <legend className="text-base font-semibold text-foreground">{heading}</legend>
    {!open && value ? <>
      <LocationSummary location={value} exactTarget={exactTarget} />
      <div className="flex flex-wrap gap-2">
        <Button ref={changeRef} type="button" variant="outline" onClick={() => { setOpen(true); focusSoon(inputRef); }}>Change location</Button>
        <Button type="button" variant="outline" onClick={() => { onChange(null); setOpen(true); focusSoon(inputRef); }}>Remove location</Button>
      </div>
    </> : candidate ? <section aria-labelledby={`${id}-check`} className="space-y-2 rounded-control border border-border p-3">
      <h3 id={`${id}-check`} ref={previewRef} tabIndex={-1} className="text-base font-semibold text-foreground">Check this location</h3>
      <LocationSummary location={candidate} exactTarget={exactTarget} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => choose(candidate)}>Use this location</Button>
        <Button type="button" variant="outline" onClick={backToResults}>Back to results</Button>
      </div>
    </section> : coordinates ? <div className="space-y-3">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {(["latitude", "longitude"] as const).map((axis) => <label key={axis} className="block min-w-0 space-y-1 text-base text-foreground">
          <span>{axis === "latitude" ? "Latitude" : "Longitude"}</span>
          <Input ref={axis === "latitude" ? latitudeRef : undefined} name={`${name}_${axis}`} autoComplete="off" spellCheck={false}
            placeholder={axis === "latitude" ? "44.4939" : "-72.7392"} value={coordinates[axis]}
            onChange={(event) => { setCoordinates({ ...coordinates, [axis]: event.target.value }); setCoordinateError(null); }}
            aria-invalid={coordinateError ? true : undefined} aria-describedby={coordinateError ? `${id}-coordinate-error` : undefined} />
        </label>)}
      </div>
      {coordinateError && <p id={`${id}-coordinate-error`} role="alert" className="text-base text-destructive">{coordinateError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={applyCoordinates}>Use these coordinates</Button>
        <Button type="button" variant="outline" onClick={() => { setCoordinates(null); setCoordinateError(null); focusSoon(inputRef); }}>Back to search</Button>
      </div>
    </div> : <div className="space-y-2">
      <label htmlFor={`${id}-query`} className="block text-base text-foreground">Search name or address</label>
      <div className="relative">
        {search.state === "searching"
          ? <Loader2 aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          : <MapPin aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />}
        <Input ref={inputRef} id={`${id}-query`} name={name} value={query} onChange={(event) => type(event.target.value)} onKeyDown={keyDown}
          role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls={listboxId}
          aria-activedescendant={active >= 0 ? `${id}-result-${active}` : undefined} aria-describedby={`${id}-status`}
          autoComplete="off" spellCheck={false} className="pl-10" />
      </div>
      <p id={`${id}-status`} aria-live="polite" className="text-base text-muted-foreground">{status}</p>
      {results.length > 0 && <>
        <ul id={listboxId} role="listbox" aria-label="Places found" className="divide-y divide-border rounded-control border border-border">
          {results.map((result, index) => <li key={`${result.provider_id ?? ""}:${result.latitude},${result.longitude}`} id={`${id}-result-${index}`}
            role="option" aria-selected={index === active} onClick={() => check(result)} onMouseDown={(event) => event.preventDefault()}
            className={cn("min-h-11 cursor-pointer break-words px-3 py-2 text-base hover:bg-accent", index === active && "bg-accent text-accent-foreground")}>
            <span className="block font-medium">{result.label}</span>
            {result.address && <span className="block text-muted-foreground">{result.address}</span>}
            {result.precision === "approximate" && <span className="block text-warning">Approximate area</span>}
          </li>)}
        </ul>
        <LocationCredit />
      </>}
      <div className="flex flex-wrap gap-2">
        {canSaveLater && <Button type="button" variant="outline" onClick={() => onSaveLater?.(trimmed)}>Save location later</Button>}
        <Button type="button" variant="outline" onClick={() => { setCoordinates({ latitude: "", longitude: "" }); focusSoon(latitudeRef); }}>Enter coordinates</Button>
        {value && <Button type="button" variant="outline" onClick={keepCurrent}>Keep current location</Button>}
      </div>
    </div>}
  </fieldset>;
}
