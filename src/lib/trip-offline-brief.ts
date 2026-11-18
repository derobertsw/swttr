import "server-only";
import { createHash } from "crypto";
import { canonical } from "@/lib/trip-conditions";
import { checkTimeLabel, dayTimeZone, destinationToday } from "@/lib/trip-day-checks";
import { dateLabel, isCalendarDate } from "@/lib/trip-lodging";
import { accessPointFor, GEOAPIFY_CREDIT, OSM_CREDIT } from "@/lib/trip-location";
import { TOUR_ACTIVITY, tripActivityLabel, tripActivityNeedsClothing } from "@/lib/trip-activities";
import { kitAdvice, kitWear } from "@/lib/trip-saved-kits";
import { sharedGearStatus } from "@/lib/shared-gear-status";
import { BODY_PART_LABELS, BODY_PARTS } from "@/lib/layers";
import type { PackingChecks, PackingEquipmentItem } from "@/types/trip-packing";
import type { SavedKit } from "@/types/savedKit";
import type { Recommendation } from "@/types/recommendations";
import type {
  OfflineBriefDay, OfflineBriefDrive, OfflineBriefKit, OfflineBriefKitPart, OfflineBriefPlace, OfflineBriefSource,
  OfflineBriefStay, TripOfflineBrief, TripOfflineBriefResponse,
} from "@/types/trip-offline-brief";
import type {
  TripConditionsCategory, TripDay, TripDriveDay, TripDriveEstimates, TripDriveRoute, TripFull, TripLocation, TripMember,
  TripMemberDayKit, TripStaySummary,
} from "@/types/trips";

/** Days in one saved brief. A trip is at most this long, so a whole trip always fits. */
const MAX_BRIEF_DAYS = 62;

/**
 * What a saved copy never holds, whatever the days. Provider maps and route
 * lines aren't saved (trip-maps.md), forecasts aren't, nor anything private to
 * someone else or that would work as a credential.
 */
const OMITTED = [
  "Weather forecasts: check the forecast when you have a connection.",
  "Maps and route lines: the copy has place names, addresses and coordinates, not a map.",
  "Other people's kits and packing lists.",
  "Stay notes and booking links.",
  "Invitation links.",
  "Changes: the saved copy is read-only, and nothing you do offline is sent later.",
];

const CATEGORY_LABEL: Record<TripConditionsCategory, { label: string; open: string }> = {
  avalanche: { label: "Avalanche forecast", open: "Open avalanche forecast" },
  weather: { label: "Mountain weather", open: "Open mountain weather" },
  access: { label: "Access and closures", open: "Open access information" },
};

const CHECK_LABEL = { plan_review: "Tour and backup plan reviewed", transceiver: "Transceiver check" } as const;
const PHASE_LABEL = { outing: "Outing", climb: "Climb", descent: "Descent", morning: "Morning", midday: "Midday", evening: "Evening" } as const;
const KIT_SLOT_LABEL: Record<string, string> = {
  shirt: "Shirt", midlayer: "Midlayer", jacket: "Jacket", shell: "Shell", pants: "Pants", gloves: "Gloves",
};

/** The dates asked for in `?dates=`: valid calendar dates, without repeats, in order. Null when it's malformed. */
export function parseBriefDates(value: string | null): string[] | null {
  if (value === null) return [];
  const dates = value.split(",").map((date) => date.trim()).filter(Boolean);
  if (dates.length === 0 || dates.length > MAX_BRIEF_DAYS || !dates.every(isCalendarDate)) return null;
  return [...new Set(dates)].sort();
}

/**
 * The days a brief covers when none were chosen: from today at each day's
 * destination on, or every day once the trip is over or before it starts.
 */
export function defaultBriefDates(full: TripFull, now: number): string[] {
  const all = full.days.map((day) => day.date).sort();
  const ahead = full.days.filter((day) => day.date >= destinationToday(full, day, now)).map((day) => day.date).sort();
  return ahead.length > 0 ? ahead : all;
}

const place = (location: TripLocation): OfflineBriefPlace => ({
  label: location.label,
  address: location.address,
  latitude: location.latitude,
  longitude: location.longitude,
  coordinates: `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`,
  precision_label: location.precision === "exact" ? "Exact location" : "Approximate: a town or area",
  attribution: location.attribution,
});

/** "Fri Feb 12" for a stored timestamp's UTC date, which is how other trip labels read dates. */
const dayOf = (iso: string) => dateLabel(iso.slice(0, 10));

/** The covered dates as one label: a range when they're consecutive, else each date. */
function coveredLabel(dates: string[]): string {
  if (dates.length === 0) return "No days";
  const consecutive = dates.every((date, i) => i === 0 || Date.parse(date) - Date.parse(dates[i - 1]) === 86_400_000);
  if (dates.length === 1) return dateLabel(dates[0]);
  return consecutive ? `${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}` : dates.map(dateLabel).join(", ");
}

/**
 * Drives whose `detail` only says when a calculated estimate was made and on
 * what assumptions, and whether it's stale. The date changes on every
 * recalculation, so it's left out of the revision, but staleness isn't; nor
 * is the organizer's own estimate's note.
 */
const calculatedDetail = new WeakMap<OfflineBriefDrive, { stale: boolean }>();

/** The drive this member takes: their own departure, or the crew's, as the day page shows it. */
function driveFor(day: TripDriveDay | undefined, memberId: string | null): OfflineBriefDrive | null {
  if (!day) return null;
  const route: TripDriveRoute = (memberId && day.departures.find((departure) => departure.member_ids.includes(memberId))) || day;
  if (route.state === "no_destination") return null;
  const calculated = route.estimate && (route.state === "available" || route.state === "stale");
  let summary: string;
  let detail: string | null = null;
  switch (route.state) {
    case "available":
    case "stale":
      summary = `${route.estimate!.duration_label} · ${route.estimate!.distance_label} by road`;
      detail = `Calculated ${dayOf(route.estimate!.calculated_at)} · typical traffic, not live${route.state === "stale" ? " · not updated since" : ""}`;
      break;
    case "manual":
      summary = `${route.manual!.duration_label} · the organizer's estimate`;
      detail = [route.manual!.note, `Entered ${dayOf(route.manual!.entered_at)}`].filter(Boolean).join(" · ");
      break;
    case "no_route": summary = "No road route found"; break;
    case "no_drive": summary = "No drive planned"; break;
    case "unavailable": summary = "Drive time not available"; break;
    case "missing_origin": summary = "Starting point not set"; break;
    case "origin_not_located":
    case "approximate_origin": summary = "Drive time not available: the starting stay has no exact location"; break;
    default: summary = "Drive time not available: the access point has no exact location";
  }
  const drive: OfflineBriefDrive = {
    from: route.origin?.label ?? null,
    to: route.destination?.label ?? null,
    summary,
    detail,
    credit: calculated || route.state === "no_route" ? `${GEOAPIFY_CREDIT.label} · ${OSM_CREDIT.label}` : null,
    closures: route.closures,
    directions: route.directions && route.origin && route.destination ? [
      { label: "Directions in Apple Maps", url: route.directions.apple },
      { label: "Directions in Google Maps", url: route.directions.google },
    ] : [],
  };
  if (calculated) calculatedDetail.set(drive, { stale: route.state === "stale" });
  return drive;
}

function stayOf(stay: TripStaySummary | undefined): OfflineBriefStay | null {
  if (!stay) return null;
  const times = [
    stay.check_in_time && `Check-in from ${stay.check_in_time.slice(0, 5)}`,
    stay.check_out_time && `Check-out by ${stay.check_out_time.slice(0, 5)}`,
  ].filter(Boolean).join(" · ");
  return {
    name: stay.name,
    dates_label: stay.check_in ? stay.date_label : null,
    booking_label: stay.booking_status === "booked" ? "Booked" : "Booking not confirmed",
    times_label: times ? `${times} · property local time` : null,
    place: stay.location ? place(stay.location) : null,
  };
}

const wearOf = (wear: Recommendation) => BODY_PARTS.flatMap((part) => {
  const layers = wear[part];
  const items = [...layers.base, ...(layers.mid ?? []), ...layers.outer].map((item) => item.name).filter(Boolean);
  return items.length > 0 ? [{ area: BODY_PART_LABELS[part], items }] : [];
});

function kitParts(outfit: SavedKit): OfflineBriefKitPart[] {
  if (outfit.kind === "plan_day") {
    // The day's layers, then each part of the day that wears something else.
    const [day, ...dayparts] = kitWear(outfit);
    if (!day) return [];
    const baseline = wearOf(day.wear);
    const same = JSON.stringify(baseline);
    return [
      { label: "Day", wear: baseline, carry: outfit.day.carryItems ?? [] },
      ...dayparts.flatMap((part) => {
        const wear = wearOf(part.wear);
        return JSON.stringify(wear) === same ? [] : [{ label: PHASE_LABEL[part.id], wear, carry: [] }];
      }),
    ];
  }
  return kitWear(outfit).map((part) => ({
    label: PHASE_LABEL[part.id],
    wear: wearOf(part.wear),
    carry: outfit.phases.find((phase) => phase.id === part.id)?.carry ?? [],
  }));
}

function kitOf(kit: TripMemberDayKit | undefined): OfflineBriefKit {
  if (kit?.outfit) {
    const advice = kitAdvice(kit.outfit).kind === "personalized" ? "Personalized" : "General guide";
    const saved = kit.outfit_saved_at ? ` · saved ${dayOf(kit.outfit_saved_at)} for the forecast then` : "";
    return { kind: "outfit", summary: `Outfit · ${advice}${saved}`, parts: kitParts(kit.outfit) };
  }
  if (kit && kit.items.length > 0) {
    const flag = kit.state === "warn" ? " · flagged: needs help" : kit.state === "missing" ? " · flagged: missing" : "";
    return { kind: "checklist", summary: `Checklist · ${kit.effort[0].toUpperCase()}${kit.effort.slice(1)} effort${flag}`, items: kit.items.map((item) => KIT_SLOT_LABEL[item] ?? item) };
  }
  return { kind: "none", summary: "No kit saved for this day." };
}

interface BriefInput {
  /** The trip as this person sees it (tripFullFor). */
  full: TripFull;
  userId: string;
  dates: string[];
  /** Stored drive estimates, read without calculating (refresh: false); null when they couldn't be read. */
  drive: TripDriveEstimates | null;
  /** The person's touring equipment and its packing checks; null when they couldn't be read. */
  equipment: { items: PackingEquipmentItem[]; dates: string[]; checks: PackingChecks } | null;
  now: number;
}

/**
 * One member's brief for the chosen trip days (#214), from the same reads the
 * trip pages use. It holds that member's own kit and equipment only, no
 * invitation links, stay notes or booking links, and no provider maps,
 * geometry or forecasts. `revision` hashes everything but when it was saved.
 */
export function buildOfflineBrief({ full, userId, dates, drive, equipment, now }: BriefInput): TripOfflineBrief {
  const me: TripMember | undefined = full.members.find((member) => member.user_id === userId && member.status !== "left");
  const memberId = me?.id ?? null;
  const nameOf = (id: string | null) => id === memberId ? "You" : full.members.find((member) => member.id === id)?.display_name ?? "A former crew member";
  const reviewerOf = (reviewer: string) => reviewer === userId ? "You"
    : full.members.find((member) => member.user_id === reviewer)?.display_name ?? (reviewer === full.trip.owner_user_id ? "Organizer" : "A former crew member");
  const sortedDays = [...full.days].sort((a, b) => a.date.localeCompare(b.date));
  const chosen = sortedDays.filter((day) => dates.includes(day.date));
  const person = full.lodging?.people.find((entry) => entry.member_id === memberId);
  const stayById = (id: string | null | undefined) => full.lodging?.stays.find((stay) => stay.id === id);

  const days = chosen.map((day: TripDay): OfflineBriefDay => {
    const date = day.date;
    const stop = full.stops.find((candidate) => candidate.id === day.stop_id) ?? full.stops[0];
    const activity = day.activity ?? stop?.activities[0] ?? null;
    const tour = activity === TOUR_ACTIVITY;
    const participation = person?.days.find((entry) => entry.date === date)?.participation ?? "participating";
    const taking = participation === "participating";
    const meet = full.meets?.find((entry) => entry.date === date);
    const access = accessPointFor(full.stops, day);
    const context = full.lodging?.days.find((entry) => entry.date === date);
    const mine = person?.days.find((entry) => entry.date === date);
    const plan = tour ? full.tour_plans?.find((entry) => entry.date === date) : undefined;
    const zone = dayTimeZone(full, day);
    const kit = me ? full.kits.find((entry) => entry.trip_day_id === day.id && entry.trip_member_id === me.id) : undefined;
    const needsKit = tripActivityNeedsClothing(activity) && taking;
    const move = person?.changeovers.find((entry) => entry.date === date);

    const conditions = (full.conditions ?? []).filter((source) => source.date === date).map((source): OfflineBriefSource => {
      const reviews = source.reviews.filter((review) => review.current.action !== "withdrawn")
        .sort((a, b) => (a.user_id === userId ? -1 : b.user_id === userId ? 1 : 0))
        .map((review) => ({
          who: reviewerOf(review.user_id),
          label: `Reviewed ${checkTimeLabel(review.current.reviewed_at, zone)}`,
          note: review.current.note,
          stale: review.stale_reasons.length ? `Reviewed before the plan changed: ${review.stale_reasons.join(", ")}` : null,
        }));
      return {
        category_label: CATEGORY_LABEL[source.category].label,
        name: source.name,
        region: source.region,
        link: { label: CATEGORY_LABEL[source.category].open, url: source.url },
        reviews,
        your_review: reviews.some((review) => review.who === "You") ? null : "You haven't recorded a review.",
      };
    });

    const items = equipment && tour && equipment.dates.includes(date) ? equipment.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      status_label: equipment.checks[item.key]?.packed === true && equipment.checks[item.key].quantity === item.quantity ? "Packed" : "Not packed yet",
    })) : [];

    const checks = (full.day_checks?.find((entry) => entry.date === date)?.checks ?? [])
      .filter((check) => check.member_id === memberId)
      .map((check) => ({
        label: CHECK_LABEL[check.kind],
        status_label: check.status === "not_recorded" || !check.current || check.current.action === "withdrawn" ? "Not recorded"
          : check.status === "out_of_date" ? `Out of date: ${check.stale_reasons.join(", ")}` : `Recorded ${check.current.time_label}`,
      }));

    // A Travel or Rest day needn't have a meet or an access point.
    const outing = tripActivityNeedsClothing(activity);
    const missing = [
      !activity && "Activity not set",
      outing && !meet && "No meet time set",
      outing && !access && "No access point set",
      tour && !plan && "No tour plan saved",
      tour && conditions.length === 0 && "No official conditions sources added",
      needsKit && !kit?.outfit && !kit?.items.length && "No kit saved",
    ].filter((entry): entry is string => !!entry);

    // Where the day starts, as its departures work it out (`starts`, #333):
    // a starting point of the member's own, or the day's own, before the stay
    // they slept in. Someone without a departure, such as a person not taking
    // part, keeps the lodging's reason. The live day brief (DayStart) reads it
    // the same way, so both match the drive under them.
    const start = full.starts?.find((entry) => entry.date === date);
    const myStart = start?.people.find((entry) => entry.member_id === memberId);
    const crewFrom = start?.starting_from ?? context?.starting_from ?? "Not set";
    const myFrom = myStart?.starting_from ?? mine?.starting_from;
    const yoursTonight = mine?.staying_tonight ?? context?.staying_tonight ?? null;
    const leaving = move ? stayById(person?.nights[person.nights.findIndex((night) => night.date === date) - 1]?.stay_id) : undefined;
    const arriving = move ? stayById(mine?.tonight_stay_id) : undefined;
    const moveTimes = [
      leaving?.check_out_time && `check out of ${leaving.name} by ${leaving.check_out_time.slice(0, 5)}`,
      arriving?.check_in_time && `check in at ${arriving.name} from ${arriving.check_in_time.slice(0, 5)}`,
    ].filter(Boolean).join(", ");

    return {
      date,
      date_label: dateLabel(date),
      position_label: `Day ${sortedDays.indexOf(day) + 1} of ${sortedDays.length}`,
      activity_label: activity ? tripActivityLabel(activity) : null,
      destination: stop ? `${stop.name}${stop.id !== day.stop_id ? " (base)" : ""}` : null,
      participation_note: participation === "skipping" ? "You're not taking part this day."
        : participation === "not_on_trip" ? "You're not on the trip this day." : null,
      meet: meet ? { label: meet.meet_label, time_zone_label: meet.time_zone_label } : null,
      meeting_point: access ? place(access.location) : null,
      notes: day.notes ?? null,
      starting_from: context ? {
        yours: myFrom ? `${myFrom}${myStart?.own ? " · only this day" : ""}` : crewFrom,
        crew: myFrom && myFrom !== crewFrom ? crewFrom : null,
      } : null,
      getting_there: drive ? driveFor(drive.days.find((entry) => entry.date === date), memberId) : null,
      tonight: yoursTonight ? {
        yours: yoursTonight,
        crew: mine && context && mine.staying_tonight !== context.staying_tonight ? context.staying_tonight : null,
        moving: move ? `${move.from} → ${move.to}${moveTimes ? `: ${moveTimes} (property local time)` : ""}` : null,
        // A personal night with no stay keeps none; the crew's stay is only for someone without one.
        stay: stayOf(stayById(mine ? mine.tonight_stay_id : context?.tonight_stay_id)),
      } : null,
      tour_plan: plan ? {
        objective: plan.objective,
        metrics: plan.metrics_label ? [plan.metrics_label, plan.metrics_source_label].filter(Boolean).join(" · ") : null,
        approach_notes: plan.approach_notes,
        access_notes: plan.access_notes,
        backup_plan: plan.backup_plan,
        return_label: plan.return_label ? `Back by ${plan.return_label}` : null,
        checkin_notes: plan.checkin_notes,
        pickup_notes: plan.pickup_notes,
        time_zone_label: plan.time_zone_label,
        updated_label: `${plan.updated_label} · revision ${plan.revision}`,
        links: [
          plan.route_url && { label: "Route link", url: plan.route_url },
          plan.access_url && { label: "Access information", url: plan.access_url },
          plan.metrics_source_url && { label: plan.metrics_source ? `Figures: ${plan.metrics_source}` : "Where the figures come from", url: plan.metrics_source_url },
        ].filter((link): link is { label: string; url: string } => !!link),
      } : null,
      conditions,
      kit: me && (needsKit || kit) ? kitOf(kit) : null,
      equipment: items,
      day_checks: checks,
      missing,
    };
  });

  const coveredDates = days.map((day) => day.date);
  const dropped = dates.filter((date) => !coveredDates.includes(date));
  const shared_gear = full.gear.map((item) => ({
    description: item.description,
    assignee: item.assignee_member_id ? nameOf(item.assignee_member_id) : "Unassigned",
    status_label: item.assignee_member_id ? sharedGearStatus(item).label : null,
    mine: !!memberId && item.assignee_member_id === memberId,
  })).sort((a, b) => Number(b.mine) - Number(a.mine));

  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const withKit = days.filter((day) => day.kit && day.kit.kind !== "none").length;
  const sources = days.reduce((sum, day) => sum + day.conditions.length, 0);
  const equipmentDays = days.filter((day) => day.equipment.length > 0).length;
  const included = [
    days.length > 0 && `Day logistics for ${count(days.length, "day")}: meet, where you start, getting there and tonight's stay`,
    days.some((day) => day.meeting_point) && `Access point coordinates for ${count(days.filter((day) => day.meeting_point).length, "day")}`,
    days.some((day) => day.notes) && `Day notes for ${count(days.filter((day) => day.notes).length, "day")}`,
    days.some((day) => day.tour_plan) && `Tour plans with route, backup and return for ${count(days.filter((day) => day.tour_plan).length, "day")}`,
    sources > 0 && `${count(sources, "conditions source")} with links and dated reviews`,
    withKit > 0 && `Your kit for ${withKit} of ${count(days.length, "day")}`,
    equipmentDays > 0 && `Your touring equipment for ${count(equipmentDays, "day")}, as packed when saved`,
    shared_gear.length > 0 && `${count(shared_gear.length, "shared item")} and who's bringing them`,
  ].filter((entry): entry is string => !!entry);
  const absent = [
    ...dropped.map((date) => `${dateLabel(date)}: no longer a day of this trip`),
    ...days.filter((day) => day.missing.length > 0).map((day) => `${day.date_label}: ${day.missing.join(", ")}`),
    !drive && days.length > 0 && "Drive times couldn't be read, so they aren't in this copy",
    !equipment && days.some((day) => day.activity_label === tripActivityLabel(TOUR_ACTIVITY)) && "Your touring equipment couldn't be read, so it isn't in this copy",
  ].filter((entry): entry is string => !!entry);

  const content: Omit<TripOfflineBrief, "saved_at" | "revision"> = {
    version: 1,
    kind: "swttr.trip-offline-brief",
    trip: {
      id: full.trip.id, name: full.trip.name, start_date: full.trip.start_date, end_date: full.trip.end_date,
      dates_label: full.trip.start_date === full.trip.end_date ? dateLabel(full.trip.start_date)
        : `${dateLabel(full.trip.start_date)} – ${dateLabel(full.trip.end_date)}`,
    },
    viewer: { user_id: userId, member_id: memberId },
    covered: { dates: coveredDates, label: coveredLabel(coveredDates) },
    days,
    shared_gear,
    contents: { included, absent, omitted: OMITTED },
  };
  // A recalculated drive time changes only its "Calculated …" detail; that
  // alone isn't the trip changing. The organizer's note on their own estimate is.
  const basis = { ...content, days: days.map((day) => ({
    ...day,
    // Without the date, but still saying whether it's stale.
    getting_there: day.getting_there && calculatedDetail.has(day.getting_there)
      ? { ...day.getting_there, detail: calculatedDetail.get(day.getting_there)!.stale ? "stale" : null } : day.getting_there,
  })) };
  return {
    ...content,
    saved_at: new Date(now).toISOString(),
    revision: createHash("sha256").update(canonical(basis)).digest("hex").slice(0, 32),
  };
}

/** The trip's days to choose from, with the default choice. */
export function briefChoices(full: TripFull, now: number): Omit<TripOfflineBriefResponse, "brief"> {
  return {
    trip_days: [...full.days].sort((a, b) => a.date.localeCompare(b.date)).map((day) => {
      const activity = day.activity ?? (full.stops.find((stop) => stop.id === day.stop_id) ?? full.stops[0])?.activities[0] ?? null;
      return { date: day.date, date_label: dateLabel(day.date), activity_label: activity ? tripActivityLabel(activity) : null };
    }),
    default_dates: defaultBriefDates(full, now),
  };
}
