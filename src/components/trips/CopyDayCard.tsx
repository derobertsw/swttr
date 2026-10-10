"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ItineraryChangeSheet } from "@/components/trips/ItineraryChangeSheet";
import { DayChecklist, dayPlanLabel } from "@/components/trips/TripDaysEditor";
import { sectionLabelClassName } from "@/components/trips/trip-primitives";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import type { TripDay, TripItineraryRequest, TripStop } from "@/types/trips";

const plural = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/**
 * Copy this day (#176): gives the days picked this day's destination and
 * activity, and with "Also copy my kit" the member's own kit. The server
 * reviews the copy first, with each day's kits; crew kits are never copied.
 */
export function CopyDayCard({ tripId, day, dayLabel, stops, days, kit, onSaved }: {
  tripId: string;
  day: TripDay;
  dayLabel: string;
  /** In position order: the first is the base for days without a stop. */
  stops: TripStop[];
  days: TripDay[];
  /** The member's kit on this day, which they can copy too; null when they have none. */
  kit: "outfit" | "checklist" | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [withKit, setWithKit] = useState(false);
  const [reviewing, setReviewing] = useState<Extract<TripItineraryRequest, { action: "copy_day" }> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reviewFocus = useReturnFocus();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  // After a save the form closes, so focus goes to the heading.
  const saved = useRef(false);

  const others = days.filter((candidate) => candidate.date !== day.date);
  // Days removed by a reload drop out of the selection.
  const chosen = selected.filter((date) => others.some((candidate) => candidate.date === date)).sort();
  const copyKit = withKit && kit !== null;
  if (others.length === 0) return null;

  const review = () => {
    if (chosen.length === 0) return;
    setAnnouncement("");
    reviewFocus.remember(() => document.getElementById(`${formId}-review`));
    setReviewing({ action: "copy_day", from: day.date, dates: chosen, kit: copyKit });
  };

  return (
    <Card>
      <h2 ref={headingRef} tabIndex={-1} className={sectionLabelClassName}>Copy this day</h2>
      <p className="mt-1 break-words text-sm text-muted-foreground">
        Give other days this day&apos;s plan: {dayPlanLabel(stops, day)}.
      </p>
      <Button type="button" variant="outline" className="mt-3" aria-expanded={open} aria-controls={formId}
        onClick={() => { setAnnouncement(""); setOpen((value) => !value); }}>
        {open ? "Cancel copy" : "Copy to other days"}
      </Button>
      {open && (
        <div id={formId}>
          <DayChecklist legend="Days to copy to" stops={stops} days={others} selected={chosen} onChange={setSelected} />
          {kit && (
            <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 border-t border-border pt-2 text-sm">
              <input type="checkbox" checked={withKit} onChange={(event) => setWithKit(event.target.checked)} className="mt-0.5 size-5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">Also copy my {kit}</span>
                <span className="block text-muted-foreground">
                  {kit === "outfit" ? "It keeps the forecast it was planned for. " : ""}Each day keeps its note, and crew kits aren&apos;t copied.
                </span>
              </span>
            </label>
          )}
          <Button id={`${formId}-review`} type="button" className="mt-3" disabled={chosen.length === 0} onClick={review}>
            Review copy{chosen.length > 0 ? ` to ${plural(chosen.length)}` : ""}
          </Button>
        </div>
      )}
      <p role="status" className="text-sm text-muted-foreground">{announcement && <span className="mt-2 block">{announcement}</span>}</p>

      {reviewing && (
        <ItineraryChangeSheet
          tripId={tripId}
          change={reviewing}
          title={`Copy ${dayLabel}`}
          description={`${plural(reviewing.dates.length)} selected. Nothing changes until you save.`}
          question="Replace or keep the kit you already have there?"
          saveLabel="Copy day"
          onSaved={() => {
            saved.current = true;
            reviewFocus.forget();
            setAnnouncement(`Copied to ${plural(reviewing.dates.length)}.`);
            setSelected([]);
            setWithKit(false);
            setOpen(false);
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
