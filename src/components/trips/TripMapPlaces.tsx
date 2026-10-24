"use client";

import Link from "next/link";
import { locationMapUrl } from "@/lib/trip-location";
import type { TripMap, TripMapDay, TripMapPlace } from "@/types/trip-map";
import { placeDates, placeRoles, placeStatus, roleLabels, roleSymbols } from "./trip-map-presentation";
import { cn } from "@/lib/utils";

export function PlaceLabel({ place, date = "", day = null }: { place: TripMapPlace; date?: string; day?: TripMapDay | null }) {
  const roles = placeRoles(place, date, day);
  return <><span aria-hidden="true">{roleSymbols[roles[0]]} </span>{roles.map((role) => roleLabels[role]).join(" · ")} · {place.name}</>;
}

export function TripMapPlaceList({ places, date, day = null, selectedId, onSelect }: {
  places: TripMapPlace[]; date: string; day?: TripMapDay | null; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return <ul className="space-y-2" aria-label="Itinerary places">
    {places.map((place) => <li key={place.id}>
      <button type="button" aria-pressed={selectedId === place.id} onClick={() => onSelect(place.id)} className={cn("min-h-11 w-full rounded-control border p-3 text-left text-base wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", selectedId === place.id ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-accent")}>
        <span className="block font-semibold"><PlaceLabel place={place} date={date} day={day} /></span>
        <span className="mt-1 block text-muted-foreground">{placeStatus(place)}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{placeDates(place).length ? placeDates(place).join(" · ") : "Not assigned to a day"}</span>
      </button>
    </li>)}
  </ul>;
}

export function TripMapPlaceDetail({ tripId, place, date, day = null, canEdit }: { tripId: string; place: TripMapPlace; date: string; day?: TripMapDay | null; canEdit: boolean }) {
  const days = date ? placeDates(place).filter((d) => d === date) : placeDates(place);
  const stayHref = `/trips/${tripId}/stays#stay-${encodeURIComponent(place.source.id)}`;
  const editHref = place.source.type === "stay" ? stayHref : place.source.type === "stop" ? `/trips/${tripId}/stops` : `/trips/${tripId}/days/${days[0] ?? placeDates(place)[0] ?? ""}`;
  return <section aria-labelledby="selected-place-heading" className="min-w-0 rounded-card border border-primary bg-card p-4 text-base wrap-anywhere">
    <h2 id="selected-place-heading" tabIndex={-1} className="font-semibold focus-visible:outline-2 focus-visible:outline-ring"><PlaceLabel place={place} date={date} day={day} /></h2>
    {place.address && <p className="mt-2">{place.address}</p>}
    <p className="mt-2 text-muted-foreground">{placeStatus(place)}</p>
    <p className="mt-2">Dates: {placeDates(place).length ? placeDates(place).join(" · ") : "Not assigned to a day"}</p>
    {!!place.nights.length && <p className="mt-2">Assigned nights: {place.nights.join(" · ")}</p>}
    {place.night_range?.check_in && <p className="mt-2">Stay: {place.night_range.check_in} – {place.night_range.check_out ?? "Checkout not set"}</p>}
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
      {place.source.type === "stay" && <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline" href={stayHref}>View stay</Link>}
      {days.map((day) => <Link key={day} className="inline-flex min-h-11 items-center font-semibold text-primary underline" href={`/trips/${tripId}/days/${day}`}>View day · {day}</Link>)}
      {/* Shows the place itself; Directions in the day summary drive between the saved endpoints. */}
      {place.coordinates && <a className="inline-flex min-h-11 items-center font-semibold text-primary underline" href={locationMapUrl(place.coordinates)} target="_blank" rel="noopener noreferrer">Open place in maps (new tab)</a>}
      {canEdit && <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline" href={editHref}>Edit in trip plan</Link>}
    </div>
    {place.provenance?.attribution && <p className="mt-2 text-sm text-muted-foreground">{place.provenance?.attribution}</p>}
  </section>;
}

export function TripMapAttribution({ provider, places }: { provider: TripMap["provider"]; places: TripMapPlace[] }) {
  return <footer aria-label="Map and place attribution" className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground wrap-anywhere">
    {provider.attribution.map((credit) => <a key={credit.url} href={credit.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{credit.label}</a>)}
    {[...new Set(places.flatMap((place) => place.provenance?.attribution ? [place.provenance?.attribution] : []))].map((credit) => <span key={credit} className="py-2">{credit}</span>)}
  </footer>;
}
