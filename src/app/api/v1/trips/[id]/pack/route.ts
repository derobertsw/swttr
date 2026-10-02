import { NextRequest, NextResponse } from "next/server";
import { requireTripAccess, loadTripFull, enumerateDates } from "@/lib/trips";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import { buildPackingListFromDays } from "@/lib/packingList";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import { tripActivityToRecommendationKey } from "@/lib/trip-activities";
import { fetchTripForecast, hasTripCoordinates, resolveTripStop, tripDayForecast } from "@/lib/trip-forecast";
import layerRecommendations from "@/data/layerRecommendations.json";
import type { DailyLayerPlan } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import type { TemperatureSensitivity } from "@/types/preferences";
import type { TripDayCoverage } from "@/types/trip-coverage";

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

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const full = await loadTripFull(supabase, id);
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Read sensitivity preference if it exists (best-effort).
  let sensitivity: TemperatureSensitivity = "neutral";
  try {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("temperature_sensitivity")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefs?.temperature_sensitivity === "hot" || prefs?.temperature_sensitivity === "cold") {
      sensitivity = prefs.temperature_sensitivity;
    }
  } catch {
    // Fall back to neutral if preferences can't be read.
  }

  const dates = enumerateDates(full.trip.start_date, full.trip.end_date);
  const myMember = full.members.find((member) => member.user_id === userId && member.status !== "left");
  const requestedStops = new Map<string, NonNullable<ReturnType<typeof resolveTripStop>>>();
  // One bounded request per stop, independent of activity and non-contiguous return visits.
  for (const date of dates) {
    const day = full.days.find((day) => day.date === date);
    const stop = resolveTripStop(day ?? { stop_id: null }, full.stops);
    if (hasTripCoordinates(stop)) requestedStops.set(stop.id, stop);
  }
  const sources = new Map(await Promise.all([...requestedStops.values()].map(async (stop) =>
    [stop.id, await fetchTripForecast(stop)] as const)));

  const dailyPlans: DailyLayerPlan[] = [];
  const coverage: TripDayCoverage[] = dates.map((date) => {
    const day = full.days.find((day) => day.date === date);
    const stop = resolveTripStop(day ?? { stop_id: null }, full.stops);
    const activity = day?.activity || stop?.activities[0] || null;
    const { forecast, hours } = tripDayForecast(date, stop ? sources.get(stop.id) : undefined);
    const entry: TripDayCoverage = {
      date, activity, stopName: stop?.name ?? null, forecast,
      advice: "unavailable", message: forecast.message, action: "plan_manually",
    };
    if (!day) {
      return { ...entry, advice: "missing_inputs", reason: "no_day", message: "This date has no saved day plan. Review the trip dates and destinations.", action: "review_day" };
    }
    if (activity === "Rest") {
      return { ...entry, advice: "rest", reason: "rest_day", message: "Rest day; review personal items manually." };
    }
    const manualKit = day && myMember && full.kits.find((kit) =>
      kit.trip_day_id === day.id && kit.trip_member_id === myMember.id && kit.items.length > 0);
    if (manualKit) {
      return { ...entry, advice: "manual", reason: "manual_kit", message: "Manual kit saved. Review it on this day; it is not included in automatic packing." };
    }
    if (!activity) {
      return { ...entry, advice: "missing_inputs", reason: "no_activity", message: "Choose an activity for this day.", action: "set_activity" };
    }
    if (!hasTripCoordinates(stop)) {
      return { ...entry, advice: "missing_inputs", reason: stop ? "no_coords" : "no_stop", message: forecast.message, action: "set_location" };
    }
    const activityKey = tripActivityToRecommendationKey(activity);
    // Trips invokes the static table, whose capabilities differ from Gear up's biophysics routes.
    if (!activityKey || !Object.hasOwn(layerRecommendations, activityKey)) {
      return { ...entry, advice: "unsupported", reason: "activity_unsupported", message: `Automatic trip clothing guidance is unavailable for ${activity}. Plan your kit manually.` };
    }
    if (activity === "Climb") entry.approximation = "Climb uses general hiking guidance; climbing-specific equipment is not included.";
    if (hours.length === 0) {
      return { ...entry, reason: forecast.reason, action: forecast.status === "error" || forecast.reason === "no_daytime_hours" ? "retry_weather" : forecast.reason === "past" ? "plan_manually" : "check_later" };
    }
    // Plan each requested date explicitly; the quick-plan builder's seven-day limit does not truncate trips.
    const plan = buildMultiDayLayerPlan({
      startDate: new Date(`${date}T12:00:00`), durationDays: 1,
      hourlyForecast: hours, getRecommendation: makeRecommendationFor(activityKey, sensitivity),
    }).days[0];
    if (!plan?.baseline.recommendation) {
      return { ...entry, reason: "no_recommendation", message: "No clothing guidance is available for these conditions. Plan your kit manually." };
    }
    dailyPlans.push(plan);
    return { ...entry, advice: "available", message: "General clothing guidance available.", action: "review_day" };
  });
  const skipped = coverage.filter((day) => day.advice !== "available")
    .map((day) => ({ date: day.date, reason: day.reason ?? day.advice }));

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
    totalDays: dates.length,
    coverage,
    skipped,
    packingList,
    groupGear: myGear,
  });
}
