"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fieldClassName } from "@/components/ui/input";
import { ItineraryChangeSheet } from "@/components/trips/ItineraryChangeSheet";
import { sectionLabelClassName } from "@/components/trips/trip-primitives";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";
import type { TripDay, TripItineraryRequest, TripStop } from "@/types/trips";

// Select values for "leave each day as it is" and "clear the activity". Saved
// activities are trimmed, so none starts with a space.
const KEEP = "";
const NO_ACTIVITY = " none";

const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** Each day's destination and activity, "<stop>[ (base)] · <activity|No activity>", as the review labels it. */
export function dayPlanLabel(stops: TripStop[], day: TripDay) {
  const stop = day.stop_id ? stops.find((candidate) => candidate.id === day.stop_id) : undefined;
  const destination = stop?.name ?? (stops[0] ? `${stops[0].name} (base)` : "No destination");
  return `${destination} · ${day.activity ?? "No activity"}`;
}

/** Checkboxes for days, each with its destination and activity, and Select all. */
export function DayChecklist({ legend, stops, days, selected, onChange }: {
  legend: string;
  stops: TripStop[];
  days: TripDay[];
  selected: string[];
  onChange: (dates: string[]) => void;
}) {
  const allSelected = days.length > 0 && days.every((day) => selected.includes(day.date));
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">{legend}</legend>
      {days.length > 1 && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onChange(allSelected ? [] : days.map((day) => day.date))}
            className="size-5 shrink-0"
          />
          Select all days
        </label>
      )}
      {days.map((day) => (
        <label key={day.id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
          <input
            type="checkbox"
            checked={selected.includes(day.date)}
            onChange={() => onChange(selected.includes(day.date) ? selected.filter((date) => date !== day.date) : [...selected, day.date])}
            className="mt-0.5 size-5 shrink-0"
          />
          <span className="min-w-0 break-words text-sm">
            <span className="block font-medium text-foreground">{dayLabel(day.date)}</span>
            <span className="block text-muted-foreground">{dayPlanLabel(stops, day)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The trip's days, to give several of them a destination and/or an activity at
 * once. The change is reviewed before it's saved (#176).
 */
export function TripDaysEditor({ tripId, stops, days, onSaved }: {
  tripId: string;
  /** In position order: the first is the base for days without a stop. */
  stops: TripStop[];
  days: TripDay[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState(KEEP);
  const [activity, setActivity] = useState(KEEP);
  const [reviewing, setReviewing] = useState<TripItineraryRequest | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reviewFocus = useReturnFocus();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // After a save the selection is cleared and Review is disabled, so focus goes to the heading.
  const saved = useRef(false);

  const activities = [...new Set<string>([
    ...TRIP_ACTIVITY_OPTIONS,
    ...stops.flatMap((stop) => stop.activities),
    ...days.flatMap((day) => (day.activity ? [day.activity] : [])),
  ])];
  // Days removed by a reload drop out of the selection.
  const chosen = selected.filter((date) => days.some((day) => day.date === date)).sort();
  const changesSomething = destination !== KEEP || activity !== KEEP;

  const review = () => {
    if (chosen.length === 0 || !changesSomething) return;
    setAnnouncement("");
    reviewFocus.remember(() => document.getElementById("trip-days-review"));
    setReviewing({
      action: "assign_days",
      dates: chosen,
      ...(destination !== KEEP ? { stop_id: destination } : {}),
      ...(activity !== KEEP ? { activity: activity === NO_ACTIVITY ? null : activity } : {}),
    });
  };

  return (
    <Card>
      <h2 ref={headingRef} tabIndex={-1} className={sectionLabelClassName}>Days</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select days, then choose a destination, an activity or both. You&apos;ll review the change before it&apos;s saved.
      </p>
      <DayChecklist legend="Days to change" stops={stops} days={days} selected={chosen}
        onChange={(dates) => { setAnnouncement(""); setSelected(dates); }} />
      {days.length === 0 && <p className="text-sm text-muted-foreground">This trip has no days yet.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm text-foreground">
          <span>Destination for selected days</span>
          <select name="destination" value={destination} onChange={(event) => setDestination(event.target.value)} className={fieldClassName}>
            <option value={KEEP}>Keep each day&apos;s destination</option>
            {stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm text-foreground">
          <span>Activity for selected days</span>
          <select name="activity" value={activity} onChange={(event) => setActivity(event.target.value)} className={fieldClassName}>
            <option value={KEEP}>Keep each day&apos;s activity</option>
            <option value={NO_ACTIVITY}>No activity</option>
            {activities.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      {stops.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Add a stop to choose a destination for days.</p>}
      <Button id="trip-days-review" type="button" className="mt-3" disabled={chosen.length === 0 || !changesSomething} onClick={review}>
        Review changes{chosen.length > 0 ? ` to ${chosen.length} ${chosen.length === 1 ? "day" : "days"}` : ""}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">{announcement && <span className="mt-2 block">{announcement}</span>}</p>

      {reviewing && (
        <ItineraryChangeSheet
          tripId={tripId}
          change={reviewing}
          title="Review day changes"
          description={`${chosen.length} ${chosen.length === 1 ? "day" : "days"} selected. Nothing changes until you save.`}
          question="Which change?"
          saveLabel="Save changes"
          onSaved={() => {
            saved.current = true;
            reviewFocus.forget();
            setSelected([]);
            setDestination(KEEP);
            setActivity(KEEP);
            setAnnouncement("Days saved.");
            onSaved();
          }}
          onClose={() => setReviewing(null)}
          onCloseAutoFocus={(event) => {
            if (!saved.current) return reviewFocus.restore(event);
            saved.current = false;
            event.preventDefault();
            headingRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </Card>
  );
}
