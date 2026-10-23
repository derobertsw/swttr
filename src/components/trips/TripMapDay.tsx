"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Directions, driveSummary } from "./DriveEstimate";
import { placeStatus } from "./trip-map-presentation";
import type { TripMapDay, TripMapPlace } from "@/types/trip-map";

const linkClass = "inline-flex min-h-11 items-center font-semibold text-primary underline";
const noteClass = "block text-sm text-muted-foreground";

function Row({ term, children }: { term: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-muted-foreground">{term}</dt><dd className="break-words text-foreground">{children}</dd></div>;
}

/**
 * The canonical editor that gives the drive what it's missing (#209). Only the
 * organizer edits; anyone can open the day plan, which checks a stale or
 * failed estimate again.
 */
function driveFix(tripId: string, day: TripMapDay, canEdit: boolean): { label: string; href: string } | null {
  const gettingThere = `/trips/${tripId}/days/${day.date}#getting-there-${day.date}`;
  const { state, origin } = day.drive;
  if (state === "unavailable" || state === "stale") return { label: "Check the drive time on the day plan", href: gettingThere };
  if (!canEdit) return null;
  switch (state) {
    case "missing_origin": return { label: "Set starting point", href: gettingThere };
    case "origin_not_located":
    case "approximate_origin": return origin?.stay_id
      ? { label: `Set the exact location of ${origin.label}`, href: `/trips/${tripId}/stays#stay-${encodeURIComponent(origin.stay_id)}` }
      : { label: "Change starting point", href: gettingThere };
    case "missing_access_point": return { label: "Set access point", href: gettingThere };
    case "approximate_access_point": return { label: "Choose the exact entrance or parking", href: gettingThere };
    case "no_route": return { label: "Check access point", href: gettingThere };
    case "no_destination": return { label: "Add destination", href: `/trips/${tripId}/stops` };
    default: return null;
  }
}

/**
 * A selected day's logistics in words (#234): where the day starts, the access
 * point and its drive, the meeting time, notes and tonight's stay, with
 * Directions to the access point. All of it reads without the map canvas.
 */
export function TripMapDaySummary({ tripId, day, places, canEdit }: {
  tripId: string; day: TripMapDay; places: TripMapPlace[]; canEdit: boolean;
}) {
  const place = (id: string | null) => id ? places.find((candidate) => candidate.id === id) ?? null : null;
  const origin = place(day.origin_place_id), access = place(day.access_place_id), tonight = place(day.tonight_place_id);
  const destination = place(day.destination_place_id);
  const { drive, tour } = day;
  const dayHref = `/trips/${tripId}/days/${day.date}`;
  const fix = driveFix(tripId, day, canEdit);
  const calculated = drive.estimate && (drive.state === "available" || drive.state === "stale") ? drive.estimate : null;
  return <section aria-labelledby="map-day-heading" className="min-w-0 rounded-card border border-border bg-card p-4 text-base">
    <h2 id="map-day-heading" className="font-semibold wrap-anywhere">{[day.date_label, day.activity, destination?.name].filter(Boolean).join(" · ")}</h2>
    <dl className="mt-3 space-y-3">
      <Row term="Starting from">
        {day.starting_from}{drive.origin?.own ? " · only this day" : ""}
        {origin ? <span className={noteClass}>{placeStatus(origin)}</span>
          : <span className={noteClass}>No crew stay {drive.night_label} night</span>}
      </Row>
      <Row term="Getting there">
        {access ? access.name : destination ? "Access point not set" : "No destination planned"}
        {access && <span className={noteClass}>{placeStatus(access)}</span>}
        {drive.state !== "no_destination" && <span className="block">{driveSummary(drive, canEdit)}</span>}
        {calculated && <span className={noteClass}>Calculated {calculated.age_label} · typical traffic, not live</span>}
        {/* An estimate is never a promise the road is open (#209). */}
        {drive.closures.map((closure) => <span key={closure} className={noteClass}>Avoids {closure}</span>)}
        {(calculated || drive.state === "manual") && <span className={noteClass}>Check road conditions before you drive.</span>}
      </Row>
      {tour?.meet_label && <Row term="Meet">
        {tour.meet_label} · {day.meeting_place_id ? place(day.meeting_place_id)?.name ?? "Meeting point not set" : "Meeting point not set"}
        {tour.time_zone_label && <span className={noteClass}>{tour.time_zone_label}</span>}
      </Row>}
      {day.pickup.state === "notes_only" && <Row term="Pickup">
        <span className="whitespace-pre-wrap">{day.pickup.notes}</span>
        <span className={noteClass}>Notes only · not on the map</span>
      </Row>}
      {tour?.approach_notes && <Row term="Approach (ski or walk)">
        <span className="whitespace-pre-wrap">{tour.approach_notes}</span>
        <span className={noteClass}>From the tour plan · not a calculated route or time</span>
      </Row>}
      {tour?.access_notes && <Row term="Access notes"><span className="whitespace-pre-wrap">{tour.access_notes}</span></Row>}
      <Row term="Staying tonight">
        {day.staying_tonight}
        {tonight && <span className={noteClass}>{placeStatus(tonight)}</span>}
      </Row>
    </dl>
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Directions day={drive} label={`Directions to ${drive.destination?.label}`} />
      {tour?.route_url && <a href={tour.route_url} target="_blank" rel="noopener noreferrer" className={linkClass}>Open tour route (new tab)</a>}
      <Link href={dayHref} className={linkClass}>View day</Link>
      {fix && <Link href={fix.href} className={linkClass}>{fix.label}</Link>}
    </div>
    {canEdit && <p className="mt-1 flex flex-wrap gap-x-4">
      <Link href={`${dayHref}#getting-there-${day.date}`} className={linkClass}>Edit Getting there</Link>
      {tour && <Link href={`${dayHref}#tour-plan-heading`} className={linkClass}>Edit tour plan</Link>}
      <Link href={tonight?.source.type === "stay" ? `/trips/${tripId}/stays#stay-${encodeURIComponent(tonight.source.id)}` : `/trips/${tripId}/stays#trip-stays-heading`} className={linkClass}>Edit tonight&apos;s stay</Link>
    </p>}
  </section>;
}
