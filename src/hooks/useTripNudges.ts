"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { TripNudgeWithSender } from "@/types/trips";

// On mount, fetch unread nudges addressed to the current user for this trip,
// surface one sonner toast per nudge, then mark them read so they don't replay.
//
// Intentionally fire-once-per-mount — replays would be annoying. Switching
// between trip subpages remounts the trip overview, so a user navigating
// around will only re-see nudges if they leave and come back to /trips/[id].
export function useTripNudges(tripId: string | null, tripName?: string) {
  const handledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/v1/trips/${tripId}/nudges`);
        if (!res.ok) return;
        const body = (await res.json()) as { nudges: TripNudgeWithSender[] };
        if (cancelled) return;

        const fresh = body.nudges.filter((n) => !handledIds.current.has(n.id));
        if (fresh.length === 0) return;

        for (const n of fresh) {
          handledIds.current.add(n.id);
          const senderLabel = n.sender_display_name ?? "Someone";
          const tripLabel = tripName ? ` for ${tripName}` : "";
          const summary = n.message
            ? `${senderLabel} nudged you${tripLabel}: ${n.message}`
            : `${senderLabel} nudged you${tripLabel} — finish your kit?`;
          toast(summary, { duration: 8000 });
        }

        await fetch(`/api/v1/trips/${tripId}/nudges/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: fresh.map((n) => n.id) }),
        });
      } catch {
        // Toast on the user's next visit if the network blip is transient.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, tripName]);
}
