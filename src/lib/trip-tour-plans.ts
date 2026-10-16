import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateLabel, shiftDate } from "@/lib/trip-lodging";
import { hasTripCoordinates } from "@/lib/trip-forecast";
import { isTimeZone, zonedTimeToInstant } from "@/lib/timeZones";
import type { TripDay, TripStop, TripTourPlan, TripTourPlanInput, TripTourPlanSummary } from "@/types/trips";

type FieldError = { error: string; field: string };

const TEXT_LIMITS = {
  objective: 200, route_url: 2000, metrics_source: 200, metrics_source_url: 2000, approach_notes: 4000,
  access_notes: 4000, access_url: 2000, backup_plan: 4000, checkin_notes: 2000, pickup_notes: 2000,
} as const;
const LINKS = ["route_url", "metrics_source_url", "access_url"] as const;
const LABELS: Record<string, string> = {
  objective: "route or objective", route_url: "route link", metrics_source: "source", metrics_source_url: "source link",
  approach_notes: "approach notes", access_notes: "access and permit notes", access_url: "access link",
  backup_plan: "backup plan", checkin_notes: "check-in plan", pickup_notes: "exit or pickup notes",
};

const minutesOf = (time: string, offset: number) => offset * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** The organizer's tour plan, or the first field to fix. Every field but the objective is optional. */
export function parseTourPlan(value: unknown): TripTourPlanInput | FieldError {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Enter a route or objective.", field: "objective" };
  const input = value as Record<string, unknown>;
  const text: Partial<Record<keyof typeof TEXT_LIMITS, string | null>> = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS) as Array<[keyof typeof TEXT_LIMITS, number]>) {
    const entry = input[key];
    if (entry == null || entry === "") { text[key] = null; continue; }
    if (typeof entry !== "string" || entry.trim().length > max) return { error: `Use up to ${max.toLocaleString("en-US")} characters for the ${LABELS[key]}.`, field: key };
    text[key] = entry.trim() || null;
  }
  if (!text.objective) return { error: "Enter a route or objective.", field: "objective" };
  for (const key of LINKS) {
    const url = text[key];
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    } catch { return { error: `Use a complete http or https ${LABELS[key]}.`, field: key }; }
  }

  const time = (key: string) => input[key] == null || input[key] === "" ? null
    : typeof input[key] === "string" && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(input[key]) ? input[key].slice(0, 5) : undefined;
  const meet = time("meet_time"), back = time("return_time");
  if (meet === undefined) return { error: "Choose a valid meet time.", field: "meet_time" };
  if (back === undefined) return { error: "Choose a valid return time.", field: "return_time" };
  const meetOffset = input.meet_day_offset ?? 0, returnOffset = input.return_day_offset ?? 0;
  if (meetOffset !== 0 && meetOffset !== -1) return { error: "Choose the day you meet.", field: "meet_day_offset" };
  if (returnOffset !== 0 && returnOffset !== 1) return { error: "Choose the day you return.", field: "return_day_offset" };
  if (meet && back && minutesOf(back, returnOffset) <= minutesOf(meet, meetOffset)) {
    return { error: "The return target must be after the meet time. Choose the next day for an overnight return.", field: "return_time" };
  }

  const number = (key: string, min: number, max: number, integer: boolean) => {
    const entry = input[key];
    if (entry == null || entry === "") return null;
    const parsed = typeof entry === "number" ? entry : typeof entry === "string" ? Number(entry) : NaN;
    if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) return undefined;
    return integer ? parsed : Math.round(parsed * 10) / 10;
  };
  const distance = number("distance", 0.1, 99999, false);
  if (distance === undefined) return { error: "Enter a distance from 0.1 to 99,999.", field: "distance" };
  const ascent = number("ascent", 0, 30000, true);
  if (ascent === undefined) return { error: "Enter an ascent as a whole number up to 30,000.", field: "ascent" };
  const duration = number("duration_minutes", 1, 4320, true);
  if (duration === undefined) return { error: "Enter an expected duration of up to 72 hours.", field: "duration_hours" };
  const unit = <T extends string>(key: string, options: readonly T[], present: boolean): T | null | undefined =>
    !present ? null : options.includes(input[key] as T) ? input[key] as T : undefined;
  const distanceUnit = unit("distance_unit", ["km", "mi"] as const, distance !== null);
  if (distanceUnit === undefined) return { error: "Choose kilometers or miles.", field: "distance_unit" };
  const ascentUnit = unit("ascent_unit", ["m", "ft"] as const, ascent !== null);
  if (ascentUnit === undefined) return { error: "Choose meters or feet.", field: "ascent_unit" };

  return {
    objective: text.objective, route_url: text.route_url ?? null,
    meet_time: meet, meet_day_offset: meetOffset, return_time: back, return_day_offset: returnOffset,
    distance, distance_unit: distanceUnit, ascent, ascent_unit: ascentUnit, duration_minutes: duration,
    metrics_source: text.metrics_source ?? null, metrics_source_url: text.metrics_source_url ?? null,
    approach_notes: text.approach_notes ?? null, access_notes: text.access_notes ?? null, access_url: text.access_url ?? null,
    backup_plan: text.backup_plan ?? null, checkin_notes: text.checkin_notes ?? null, pickup_notes: text.pickup_notes ?? null,
  };
}

const clock = (time: string) => new Date(Date.UTC(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5))))
  .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** "6:30 AM MDT · Sat Oct 10", on the destination's clock; its zone's abbreviation for that date when known. */
function timeLabel(date: string, time: string | null, offset: number, zone: string | null): string | null {
  if (!time) return null;
  const day = shiftDate(date, offset);
  let suffix = "destination time";
  if (zone) {
    const instant = zonedTimeToInstant(`${day}T${time.slice(0, 5)}`, zone);
    suffix = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? zone;
  }
  const relative = offset < 0 ? ", the day before" : offset > 0 ? ", the day after" : "";
  return `${clock(time.slice(0, 5))} ${suffix} · ${dateLabel(day)}${relative}`;
}

function metricsLabel(plan: TripTourPlanInput): string | null {
  const parts: string[] = [];
  if (plan.distance !== null && plan.distance_unit) parts.push(`${Number(plan.distance).toLocaleString("en-US")} ${plan.distance_unit}`);
  if (plan.ascent !== null && plan.ascent_unit) parts.push(`${plan.ascent.toLocaleString("en-US")} ${plan.ascent_unit} ascent`);
  if (plan.duration_minutes !== null) {
    const hours = Math.floor(plan.duration_minutes / 60), minutes = plan.duration_minutes % 60;
    parts.push([hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" "));
  }
  return parts.length ? parts.join(" · ") : null;
}

/** A saved plan with the labels the day page shows. Every time is the destination's wall clock. */
export function buildTourPlanSummary(plan: TripTourPlan, date: string): TripTourPlanSummary {
  const zone = plan.time_zone && isTimeZone(plan.time_zone) ? plan.time_zone : null;
  const metrics = metricsLabel(plan);
  const hasTimes = !!(plan.meet_time || plan.return_time);
  return {
    ...plan, date,
    meet_label: timeLabel(date, plan.meet_time, plan.meet_day_offset, zone),
    return_label: timeLabel(date, plan.return_time, plan.return_day_offset, zone),
    metrics_label: metrics,
    metrics_source_label: metrics ? plan.metrics_source ? `Source: ${plan.metrics_source}` : "Crew estimate" : null,
    time_zone_label: !hasTimes ? null : zone ? `Times are local to the destination (${zone}).`
      : "Times are local to the destination. Its time zone wasn't confirmed when this plan was saved.",
    updated_label: `Last changed ${dateLabel(plan.updated_at.slice(0, 10))} by the organizer`,
  };
}

/** The trip's saved plans. Plans don't wait for days, so the trip loads in its usual two stages. */
export async function loadTourPlans(supabase: SupabaseClient, tripId: string): Promise<TripTourPlan[]> {
  const { data, error } = await supabase.from("trip_day_tour_plans").select("*").eq("trip_id", tripId);
  // Before migration 026 there's no table, and so no saved plan to hide. Any other failure might hide one.
  if (error && ["42P01", "PGRST205"].includes(error.code)) return [];
  if (error) throw new Error("Couldn't load tour plans. Try again.");
  return (data ?? []) as TripTourPlan[];
}

/** Each plan labelled for its day's date, in date order. */
export function summarizeTourPlans(plans: TripTourPlan[], days: TripDay[]): TripTourPlanSummary[] {
  const dates = new Map(days.map((day) => [day.id, day.date]));
  return plans
    .filter((plan) => dates.has(plan.trip_day_id))
    .map((plan) => buildTourPlanSummary(plan, dates.get(plan.trip_day_id)!))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The destination's IANA time zone, or null without coordinates or an answer. Never blocks a save. */
export async function lookupTimeZone(stop: TripStop | undefined): Promise<string | null> {
  if (!hasTripCoordinates(stop)) return null;
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${stop.latitude}&longitude=${stop.longitude}&timezone=auto&forecast_days=1`, {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    return isTimeZone(data?.timezone) ? data.timezone : null;
  } catch {
    return null;
  }
}
