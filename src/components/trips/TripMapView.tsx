"use client";

import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { placeDates } from "./trip-map-presentation";
import type { TripMap } from "@/types/trip-map";
import { TripMapAttribution, TripMapPlaceDetail, TripMapPlaceList, PlaceLabel } from "./TripMapPlaces";

const Canvas = dynamic(() => import("./TripMapCanvas"), { ssr: false, loading: () => <p role="status" className="min-h-64 p-4">Loading map… The list is ready.</p> });

class CanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function subscribeConnection(change: () => void) {
  window.addEventListener("online", change); window.addEventListener("offline", change);
  return () => { window.removeEventListener("online", change); window.removeEventListener("offline", change); };
}
function subscribeDesktop(change: () => void) {
  const media = window.matchMedia("(min-width: 1024px)"); media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}

/** The shared map/list presentation can also be entered with ?date=YYYY-MM-DD. */
export function TripMapView({ data, canEdit }: { data: TripMap; canEdit: boolean }) {
  const params = useSearchParams();
  const date = params.get("date") ?? "";
  const selectedId = params.get("place");
  const view = params.get("view") === "list" ? "list" : "map";
  const validDate = !date || data.dates.some((day) => day.date === date);
  const places = useMemo(() => validDate ? data.places.filter((place) => !date || placeDates(place).includes(date)) : [], [data.places, date, validDate]);
  const selected = places.find((place) => place.id === selectedId);
  const shown = places.filter((place) => place.mapping === "mapped").length;
  const offline = useSyncExternalStore(subscribeConnection, () => !navigator.onLine, () => false);
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.innerWidth >= 1024, () => false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const [group, setGroup] = useState<{ date: string; revision: string; ids: string[] } | null>(null);
  const groupPlaces = group?.date === date && group.revision === data.revision ? places.filter((place) => group.ids.includes(place.id)) : [];
  const list = useRef<HTMLDivElement>(null);
  const revealSelection = useRef(false);
  const scrollSave = useRef<{ timer: number | null; frame: number | null }>({ timer: null, frame: null });
  const historyKey = `tripMapScroll:${data.trip.id}`;

  /** Scroll restoration is best effort; browser history limits must not break selection. */
  function writeScroll() {
    const top = list.current?.scrollTop;
    if (top === undefined || window.history.state?.[historyKey] === top) return;
    try { window.history.replaceState({ ...window.history.state, [historyKey]: top }, ""); }
    catch { /* Safari/WKWebView can throttle history writes. */ }
  }
  function cancelScrollSave() {
    if (scrollSave.current.timer !== null) window.clearTimeout(scrollSave.current.timer);
    if (scrollSave.current.frame !== null) cancelAnimationFrame(scrollSave.current.frame);
    scrollSave.current = { timer: null, frame: null };
  }
  function saveScroll() {
    if (scrollSave.current.timer !== null || scrollSave.current.frame !== null) return;
    const url = window.location.href;
    // A frame alone can still exceed Safari's history quota during long scrolls.
    scrollSave.current.timer = window.setTimeout(() => {
      scrollSave.current.timer = null;
      scrollSave.current.frame = requestAnimationFrame(() => {
        scrollSave.current.frame = null;
        if (window.location.href === url) writeScroll();
      });
    }, 500);
  }
  useEffect(() => cancelScrollSave, [date, selectedId, view, historyKey]);

  function navigate(patch: Record<string, string | null>) {
    cancelScrollSave();
    // Preserve the outgoing entry even if its throttled save hasn't run yet.
    writeScroll();
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) { if (value) search.set(key, value); else search.delete(key); }
    // Next copies its own routing fields. Passing __NA from history.state
    // would bypass its URL/search-param synchronization entirely.
    window.history.pushState({ [historyKey]: "date" in patch || patch.place ? 0 : list.current?.scrollTop ?? 0 }, "", `${window.location.pathname}${search.size ? `?${search}` : ""}`);
  }
  useEffect(() => {
    if (list.current) list.current.scrollTop = Number(window.history.state?.[historyKey]) || 0;
  }, [date, selectedId, view, historyKey]);
  useEffect(() => {
    if (!revealSelection.current) return;
    revealSelection.current = false;
    focusSelectedPlace();
  }, [selectedId]);
  useEffect(() => {
    if (!group) return;
    const heading = document.getElementById("map-group-heading");
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [group]);
  function selectPlace(id: string) {
    if (id === selectedId) { focusSelectedPlace(); return; }
    revealSelection.current = true;
    navigate({ place: id });
  }

  const showList = () => {
    navigate({ view: "list" });
    requestAnimationFrame(() => document.getElementById("map-place-list-heading")?.focus());
  };
  const failure = <Card className="space-y-3">
    <h2 className="font-semibold">Map unavailable</h2>
    <p className="text-base">Your saved places and trip plan are still available in List.</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Retry map</Button><Button variant="outline" onClick={showList}>Use list</Button></div>
  </Card>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="block min-w-0 flex-1 text-base font-semibold" htmlFor="map-date">Trip dates
        <select id="map-date" value={date} onChange={(event) => navigate({ date: event.target.value, place: null })} className="mt-1 block min-h-11 w-full max-w-sm rounded-control border border-input bg-card px-3 text-base font-normal text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <option value="">All days</option>
          {!validDate && <option value={date}>Day no longer available</option>}
          {data.dates.map((day) => <option key={day.date} value={day.date}>{day.label}</option>)}
        </select>
      </label>
      <div className="flex gap-2 lg:hidden" role="group" aria-label="Places view">
        <Button variant={view === "map" ? "default" : "outline"} aria-pressed={view === "map"} onClick={() => navigate({ view: "map" })}>Map</Button>
        <Button variant={view === "list" ? "default" : "outline"} aria-pressed={view === "list"} onClick={() => navigate({ view: "list" })}>List</Button>
      </div>
      <Button variant="outline" disabled={!shown} className={cn(view === "list" && "hidden lg:inline-flex")} onClick={() => setFitRequest((value) => value + 1)}>Show all places</Button>
    </div>
    <p className="text-base text-muted-foreground">{shown} of {places.length} places shown{date ? ` · ${data.dates.find((day) => day.date === date)?.label ?? date}` : " · All days"}</p>
    {!validDate && <p role="alert">This day is no longer in the itinerary. <Button variant="link" onClick={() => navigate({ date: null, place: null })}>Show all days</Button></p>}
    {selectedId && !selected && <p role="status" className="text-base">This place is no longer available in this date scope. <Button variant="link" onClick={() => navigate({ place: null })}>Clear selection</Button></p>}
    {places.length === 0 && validDate && <Card>
      <p className="text-base">{date ? "No places assigned to this day yet." : "Add a destination to see it on the map."}</p>
      {date && <Link href={`/trips/${data.trip.id}/days/${date}`} className="inline-flex min-h-11 items-center text-primary underline">View day</Link>}
      {canEdit && <Link href={`/trips/${data.trip.id}/stops`} className="ml-3 inline-flex min-h-11 items-center text-primary underline">Add destination</Link>}
      {!canEdit && <p className="mt-2 text-muted-foreground">The organizer can add places in the trip plan.</p>}
    </Card>}
    <Button variant="link" className="px-0" onClick={showList}>Skip map</Button>
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div ref={list} onScroll={saveScroll} className="order-3 min-w-0 space-y-4 lg:order-1 lg:max-h-[48rem] lg:overflow-y-auto lg:p-1">
        {selected ? <TripMapPlaceDetail tripId={data.trip.id} place={selected} date={date} canEdit={canEdit} /> : <p className="text-base text-muted-foreground">Select a place to read its details.</p>}
        {!!groupPlaces.length && <section className="rounded-card border border-border p-3" aria-label="Places in selected group">
          <h2 id="map-group-heading" tabIndex={-1} className="font-semibold focus-visible:outline-2 focus-visible:outline-ring">{groupPlaces.length} places in this group</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose an individual place. All itinerary rows remain below.</p>
          {groupPlaces.map((place) => <button key={place.id} type="button" className="block min-h-11 w-full py-2 text-left text-base text-primary underline wrap-anywhere" onClick={() => selectPlace(place.id)}><PlaceLabel place={place} date={date} /></button>)}
        </section>}
        <section className={cn(view !== "list" && "hidden lg:block")}>
          <h2 id="map-place-list-heading" tabIndex={-1} className="mb-3 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring">Place list</h2>
          <TripMapPlaceList places={places} date={date} selectedId={selectedId} onSelect={selectPlace} />
        </section>
      </div>
      <section aria-label="Map view" className={cn("order-1 min-w-0 space-y-3 lg:order-2", view === "list" && "hidden lg:block")}>
        {offline ? <Card><h2 className="font-semibold">Map needs a connection</h2><p className="mt-2 text-base">Use List for places already loaded. Offline maps and a saved offline brief are not available here.</p><Button variant="outline" className="mt-3" onClick={showList}>Use list</Button></Card>
          : !shown ? <Card><p className="text-base">No mapped places in this scope. The list includes places with missing or invalid locations.</p><Button variant="outline" className="mt-3" onClick={showList}>Use list</Button></Card>
          : failed ? failure : (view === "map" || desktop) && <CanvasBoundary key={attempt} fallback={failure}>
            <Canvas places={places} date={date} provider={data.provider} scope={`${data.trip.id}:${date}`} selectedId={selectedId} fitRequest={fitRequest} onSelect={selectPlace} onGroup={(ids) => setGroup({ date, revision: data.revision, ids })} onError={() => setFailed(true)} />
          </CanvasBoundary>}
      </section>
      <div className="order-2 min-w-0 lg:order-3 lg:col-span-2"><TripMapAttribution provider={data.provider} places={places} /></div>
    </div>
    <p role="status" aria-live="polite" className="sr-only">{selected ? `Selected ${selected.name}. ${placeAnnouncement(selected.id, places)}` : groupPlaces.length ? `${groupPlaces.length} named places in selected group.` : "No place selected."}</p>
  </div>;
}

function focusSelectedPlace() {
  const heading = document.getElementById("selected-place-heading");
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ block: "nearest", behavior: "instant" });
}

function placeAnnouncement(id: string, places: TripMap["places"]) {
  const place = places.find((item) => item.id === id);
  return place ? `Dates: ${placeDates(place).join(", ") || "not assigned"}.` : "";
}
