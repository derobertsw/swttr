import { IDBFactory } from "fake-indexeddb";
import type { OfflineBriefDay, TripOfflineBrief, TripOfflineBriefResponse } from "@/types/trip-offline-brief";

/** A fresh, empty IndexedDB for each test. */
export function resetDeviceStorage() {
  globalThis.indexedDB = new IDBFactory();
  window.localStorage.clear();
}

const day = (date: string, label: string, extra: Partial<OfflineBriefDay> = {}): OfflineBriefDay => ({
  date, date_label: label, position_label: "Day 1 of 2", activity_label: "Backcountry skiing", destination: "Rogers Pass",
  participation_note: null,
  meet: { label: "6:30 AM PST · Sat Feb 13", time_zone_label: "Rogers Pass time (PST)" },
  meeting_point: {
    label: "Rogers Pass lot", address: "Trans-Canada Hwy", latitude: 51.301234, longitude: -117.52,
    coordinates: "51.301234, -117.520000", precision_label: "Exact location", attribution: null,
  },
  notes: "Park at the far end",
  starting_from: { yours: "Glacier Park Lodge", crew: null },
  getting_there: {
    from: "Glacier Park Lodge", to: "Rogers Pass lot", summary: "5 min · 3 mi by road", detail: "Calculated Tue Feb 9 · typical traffic, not live",
    credit: "Powered by Geoapify · © OpenStreetMap contributors", closures: [],
    directions: [{ label: "Directions in Google Maps", url: "https://www.google.com/maps/dir/?api=1" }],
  },
  tonight: { yours: "Glacier Park Lodge", crew: null, moving: null, stay: null },
  tour_plan: {
    objective: "Asulkan Valley", metrics: null, approach_notes: null, access_notes: null, backup_plan: "Glacier Crest trees",
    return_label: "Back by 3:00 PM PST · Sat Feb 13", checkin_notes: null, pickup_notes: null, time_zone_label: null,
    updated_label: "Last changed Mon Feb 8 by the organizer · revision 3", links: [{ label: "Route link", url: "https://example.com/asulkan" }],
  },
  conditions: [],
  kit: { kind: "checklist", summary: "Checklist · Steady effort", items: ["Shell"] },
  equipment: [],
  day_checks: [],
  missing: [],
  ...extra,
});

/** Ana's brief of Saturday and Sunday at Rogers Pass, saved Wednesday. */
export function offlineBrief(extra: Partial<TripOfflineBrief> = {}): TripOfflineBrief {
  return {
    version: 1,
    kind: "swttr.trip-offline-brief",
    trip: { id: "trip-1", name: "Rogers Pass", start_date: "2027-02-13", end_date: "2027-02-14", dates_label: "Sat Feb 13 – Sun Feb 14" },
    viewer: { user_id: "user_1", member_id: "m-ana" },
    covered: { dates: ["2027-02-13", "2027-02-14"], label: "Sat Feb 13 – Sun Feb 14" },
    saved_at: "2027-02-10T17:00:00.000Z",
    revision: "rev-1",
    days: [day("2027-02-13", "Sat Feb 13"), day("2027-02-14", "Sun Feb 14", { tour_plan: null, missing: ["No kit saved"] })],
    shared_gear: [{ description: "Group first aid kit", assignee: "You", status_label: "Accepted · not packed", mine: true }],
    contents: {
      included: ["Day logistics for 2 days: meet, where you start, getting there and tonight's stay"],
      absent: ["Sun Feb 14: No kit saved"],
      omitted: ["Weather forecasts: check the forecast when you have a connection.", "Invitation links."],
    },
    ...extra,
  };
}

export function briefResponse(brief: TripOfflineBrief = offlineBrief()): TripOfflineBriefResponse {
  return {
    brief,
    trip_days: [
      { date: "2027-02-13", date_label: "Sat Feb 13", activity_label: "Backcountry skiing" },
      { date: "2027-02-14", date_label: "Sun Feb 14", activity_label: "Backcountry skiing" },
    ],
    default_dates: ["2027-02-13", "2027-02-14"],
  };
}
