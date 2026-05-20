import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip, loadTripFull } from "@/lib/trips";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import { buildPackingListFromDays } from "@/lib/packingList";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import { tripActivityToRecommendationKey } from "@/lib/trip-activities";
import layerRecommendations from "@/data/layerRecommendations.json";
import type { ForecastHour, DailyLayerPlan } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import type { TemperatureSensitivity } from "@/types/preferences";
import type { TripDay, TripStop } from "@/types/trips";

type RouteContext = { params: Promise<{ id: string }> };

function makeRecommendationFor(activity: string, sensitivity: TemperatureSensitivity) {
  return (effectiveTemp: number): Recommendation | null => {
    const range = getAdjustedTempRange(effectiveTemp, sensitivity);
    const activityData = layerRecommendations[activity as keyof typeof layerRecommendations];
    if (!activityData) return null;
    const legacy = activityData[range as keyof typeof activityData];
    if (!legacy) return null;
    return convertLegacyRecommendation(legacy as LegacyRecommendation);
  };
}

async function fetchHourly(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<ForecastHour[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,precipitation_probability&start_date=${startDate}&end_date=${endDate}&temperature_unit=fahrenheit&wind_speed_unit=mph`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const time: string[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
  const temp: number[] = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
  const wind: number[] = Array.isArray(data?.hourly?.wind_speed_10m) ? data.hourly.wind_speed_10m : [];
  const precip: number[] = Array.isArray(data?.hourly?.precipitation_probability) ? data.hourly.precipitation_probability : [];
  return time
    .map((t, i) => ({
      time: t,
      temperature: Math.round(Number(temp[i] ?? 0)),
      windSpeed: Math.round(Number(wind[i] ?? 0)),
      precipitationProbability: Math.round(Number(precip[i] ?? 0)),
    }))
    .filter(
      (h) =>
        typeof h.time === "string" &&
        Number.isFinite(h.temperature) &&
        Number.isFinite(h.windSpeed) &&
        Number.isFinite(h.precipitationProbability)
    );
}

function chooseStop(day: TripDay, stops: TripStop[]): TripStop | undefined {
  if (day.stop_id) {
    const found = stops.find((s) => s.id === day.stop_id);
    if (found) return found;
  }
  return stops[0];
}

function chooseActivity(day: TripDay, stop: TripStop | undefined): string | null {
  if (day.activity) return day.activity;
  if (stop && stop.activities.length > 0) return stop.activities[0];
  return null;
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const full = await loadTripFull(supabase, id);
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Read sensitivity preference if it exists (best-effort).
  let sensitivity: TemperatureSensitivity = "neutral";
  try {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("sensitivity")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefs?.sensitivity === "hot" || prefs?.sensitivity === "cold") {
      sensitivity = prefs.sensitivity;
    }
  } catch {
    // Table may not exist in this project — fall back to neutral.
  }

  // Group days by (stopId, activityKey) so we can issue one weather fetch per
  // location-range and call the recommendation engine once per group.
  const groups = new Map<
    string,
    { stop: TripStop; activityKey: string; days: TripDay[] }
  >();
  const skipped: { date: string; reason: string }[] = [];
  for (const day of full.days) {
    const stop = chooseStop(day, full.stops);
    const activity = chooseActivity(day, stop);
    if (!stop) {
      skipped.push({ date: day.date, reason: "no_stop" });
      continue;
    }
    if (!stop.latitude || !stop.longitude) {
      skipped.push({ date: day.date, reason: "no_coords" });
      continue;
    }
    if (!activity) {
      skipped.push({ date: day.date, reason: "no_activity" });
      continue;
    }
    const activityKey = tripActivityToRecommendationKey(activity);
    if (!activityKey) {
      skipped.push({ date: day.date, reason: "activity_unsupported" });
      continue;
    }
    const groupKey = `${stop.id}:${activityKey}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.days.push(day);
    } else {
      groups.set(groupKey, { stop, activityKey, days: [day] });
    }
  }

  const dailyPlans: DailyLayerPlan[] = [];
  for (const group of groups.values()) {
    const dates = group.days.map((d) => d.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const hourly = await fetchHourly(
      Number(group.stop.latitude),
      Number(group.stop.longitude),
      startDate,
      endDate
    );
    if (hourly.length === 0) continue;
    const durationDays =
      Math.round(
        (new Date(`${endDate}T00:00:00Z`).getTime() -
          new Date(`${startDate}T00:00:00Z`).getTime()) /
          86400000
      ) + 1;
    const plan = buildMultiDayLayerPlan({
      startDate: new Date(`${startDate}T00:00:00`),
      durationDays,
      hourlyForecast: hourly,
      getRecommendation: makeRecommendationFor(group.activityKey, sensitivity),
    });
    const dayDateSet = new Set(group.days.map((d) => d.date));
    for (const day of plan.days) {
      // Only include days that actually belong to this group (the plan may
      // include extra dates inside the start/end span that belong to other
      // groups).
      if (dayDateSet.has(day.date)) dailyPlans.push(day);
    }
  }

  // Pull this user's item mappings + wardrobe so the engine can resolve
  // standard layer slots to the specific gear they own.
  const [mappingsRes, wardrobeItems] = await Promise.all([
    supabase
      .from("user_item_mappings")
      .select("body_part, layer_type, standard_option, custom_name")
      .eq("user_id", userId),
    fetchUserWardrobeItems(supabase, userId),
  ]);
  const itemMappings = new Map<string, string>();
  for (const row of mappingsRes.data ?? []) {
    itemMappings.set(
      `${row.body_part}:${row.layer_type}:${row.standard_option}`,
      row.custom_name
    );
  }

  const packingList = buildPackingListFromDays(dailyPlans, itemMappings, wardrobeItems);

  // Find the requesting user's TripMember row and any group gear assigned to them.
  const myMember = full.members.find((m) => m.user_id === userId);
  const myGear = myMember
    ? full.gear
        .filter((g) => g.assignee_member_id === myMember.id)
        .map((g) => g.description)
    : [];

  return NextResponse.json({
    trip: {
      id: full.trip.id,
      name: full.trip.name,
      start_date: full.trip.start_date,
      end_date: full.trip.end_date,
    },
    coveredDays: dailyPlans.length,
    totalDays: full.days.length,
    skipped,
    packingList,
    groupGear: myGear,
  });
}
