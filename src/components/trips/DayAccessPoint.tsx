"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { sectionLabelClassName } from "@/components/trips/trip-primitives";
import { LocationPicker, LocationSummary } from "@/components/trips/LocationPicker";
import { ItineraryChangeSheet } from "@/components/trips/ItineraryChangeSheet";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { accessPointFor } from "@/lib/trip-location";
import type { TripDay, TripFull, TripItineraryOption, TripLocation } from "@/types/trips";

const ACCESS_EXACT = "the exact entrance or parking";

/**
 * The day's Getting there (#208): where the crew parks or meets. It's the
 * destination's access point, shared by every day there, or the day's own.
 * The organizer picks a place, then a review asks whether it's only for this
 * day or for every day at the stop, with their dates, before saving.
 */
export function DayAccessPoint({ data, day, dateLabel, canEdit, onSaved, children }: {
  data: TripFull;
  day: TripDay;
  dateLabel: string;
  /** The organizer manages logistics; everyone else reads them. */
  canEdit: boolean;
  onSaved: () => void;
  /** The drive to the access point (#209), at the end of the card. */
  children?: ReactNode;
}) {
  const stop = data.stops.find((candidate) => candidate.id === day.stop_id) ?? data.stops[0];
  const point = accessPointFor(data.stops, day);
  const daysAtStop = data.days.filter((candidate) => (data.stops.find((s) => s.id === candidate.stop_id) ?? data.stops[0]) === stop).length;
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<TripLocation | null>(null);
  // The place under review, or null while removing the day's point.
  const [reviewing, setReviewing] = useState<{ location: TripLocation | null } | null>(null);
  const [status, setStatus] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const reviewFocus = useReturnFocus();
  const focusSoon = (find: () => Element | null | undefined) => setTimeout(() => (find() as HTMLElement | null | undefined)?.focus(), 0);

  const startEditing = () => {
    setEditing(true); setStatus("");
    focusSoon(() => form.current?.elements.namedItem("access_point") as Element | null);
  };
  const stopEditing = () => {
    setEditing(false); setPicked(null);
    focusSoon(() => document.getElementById("access-point-change"));
  };
  const review = (location: TripLocation | null) => {
    reviewFocus.remember(() => document.getElementById("access-point-change"));
    setReviewing({ location });
  };
  const chooseDays = (event: FormEvent) => {
    event.preventDefault();
    if (picked) review(picked);
  };
  const unchangedText = ({ changes, unchanged }: TripItineraryOption) => changes.length === 0
    ? `Every day at ${stop?.name} keeps its access point.`
    : unchanged === 1 ? `1 other day at ${stop?.name} keeps its access point.` : `${unchanged} other days at ${stop?.name} keep their access points.`;

  return (
    <Card>
      <h2 id={`getting-there-${day.date}`} tabIndex={-1} className={sectionLabelClassName}>Getting there</h2>
      {point ? <div className="mt-1 space-y-2">
        <p className="text-sm text-muted-foreground">{point.scope === "day" ? `Only ${dateLabel}` : `Every day at ${stop?.name}`}</p>
        <LocationSummary location={point.location} exactTarget={ACCESS_EXACT} />
      </div> : <p className="mt-2 text-base text-muted-foreground">{stop ? "Access point not set" : "Choose a destination first"}</p>}
      {!canEdit && <p className="mt-1 text-sm text-muted-foreground">Managed by the organizer</p>}
      <p aria-live="polite" className="text-sm text-success">{status}</p>
      {canEdit && stop && !editing && <div className="mt-3 flex flex-wrap gap-2">
        <Button id="access-point-change" type="button" size="sm" variant={point ? "outline" : "default"} onClick={startEditing}>
          {point ? "Change access point" : "Set access point"}
        </Button>
        {point && <Button type="button" size="sm" variant="outline" onClick={() => review(null)}>Remove access point</Button>}
      </div>}
      {canEdit && stop && editing && (
        <form ref={form} onSubmit={chooseDays} className="mt-3 space-y-3 border-t border-border pt-3">
          <LocationPicker tripId={data.trip.id} heading="Where will you park or meet?" exactTarget={ACCESS_EXACT}
            value={picked} name="access_point" onChange={setPicked} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!picked}>Choose days</Button>
            <Button type="button" variant="outline" onClick={stopEditing}>Cancel</Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {daysAtStop > 1 ? `Next, choose ${dateLabel} only or every day at ${stop.name}, and review the dates before saving.` : "Next, review the change before saving."}
          </p>
        </form>
      )}
      {reviewing && stop && (
        <ItineraryChangeSheet
          tripId={data.trip.id}
          url={`/api/v1/trips/${data.trip.id}/access-points`}
          change={{ action: "set_access_point", date: day.date, location: reviewing.location }}
          unchangedText={unchangedText}
          title={reviewing.location ? "Change access point" : "Remove access point"}
          description={`${(reviewing.location ?? point?.location)?.label} ${reviewing.location ? "for" : "on"} ${dateLabel}. Nothing changes until you save.`}
          question={reviewing.location ? `Which days use ${reviewing.location.label}?` : "Remove it from which days?"}
          saveLabel={reviewing.location ? "Save access point" : "Remove access point"}
          onSaved={() => {
            setStatus(reviewing.location ? "Access point saved." : "Access point removed.");
            setEditing(false); setPicked(null);
            onSaved();
          }}
          onClose={() => setReviewing(null)}
          onCloseAutoFocus={reviewFocus.restore}
        />
      )}
      {children}
    </Card>
  );
}
