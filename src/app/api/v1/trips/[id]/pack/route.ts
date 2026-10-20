import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { requireTripAccess, loadTripFull, enumerateDates } from "@/lib/trips";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import { buildPackingListFromDays } from "@/lib/packingList";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import { tripActivityToRecommendationKey } from "@/lib/trip-activities";
import { fetchTripForecast, hasTripCoordinates, resolveTripStop, tripDayForecast, tripForecastDateOutsideWindow } from "@/lib/trip-forecast";
import { outfitMismatches } from "@/lib/trip-kit-fit";
import {
  kitVersions, packingSeen, packingWithChanges, parsePackingChange,
  readManualItems, readPackingChecks, readQuantities, readSeen, sameKitVersions,
} from "@/lib/trip-packing";
import {
  itemsFromKits, mappedNames, myKits, myMemberOf, readMappings, readMemberPacking, touringDates, updatePacking, type MappingRow,
} from "@/lib/trip-member-packing";
import { buildTouringEquipment, equipmentKey, isTemplateId, readEquipment } from "@/lib/touring-equipment";
import layerRecommendations from "@/data/layerRecommendations.json";
import type { DailyLayerPlan } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import type { TemperatureSensitivity } from "@/types/preferences";
import type { TripDayCoverage } from "@/types/trip-coverage";
import type { PackingChoices, PackingChange, PackingChecklist, TripPackResponse } from "@/types/trip-packing";

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

  const full = await loadTripFull(supabase, auth.trip).catch(() => null);
  if (!full) return jsonError("Couldn't load the packing list. Reload and try again.", 503);

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
  const myMember = myMemberOf(full, userId);
  const kits = myKits(full, myMember?.id);
  const daysForCoverage = dates.map((date) => {
    const day = full.days.find((day) => day.date === date);
    const stop = resolveTripStop(day ?? { stop_id: null }, full.stops);
    const activity = day?.activity || stop?.activities[0] || null;
    const activityKey = tripActivityToRecommendationKey(activity);
    const kit = day ? kits.find((entry) => entry.date === date)?.kit : undefined;
    const outfit = kit?.outfit ?? null;
    // An older category checklist, without a saved outfit.
    const manualKit = !outfit && !!kit && kit.items.length > 0 ? kit : undefined;
    const outsideWindow = tripForecastDateOutsideWindow(date);
    const needsForecast = !!day && activity !== "Rest" && !outfit && !manualKit && !!activityKey
      && Object.hasOwn(layerRecommendations, activityKey) && hasTripCoordinates(stop) && !outsideWindow;
    return { date, day, stop, activity, activityKey, outfit, manualKit, outsideWindow, needsForecast };
  });
  const requestedStops = new Map<string, NonNullable<ReturnType<typeof resolveTripStop>>>();
  for (const { stop, needsForecast } of daysForCoverage) {
    if (stop && needsForecast) requestedStops.set(stop.id, stop);
  }
  // Fetch only stops used by automatic guidance, once each, with at most three
  // requests in flight. Each provider request also has a 15-second timeout.
  const stops = [...requestedStops.values()];
  const sources = new Map<string, Awaited<ReturnType<typeof fetchTripForecast>>>();
  let nextStop = 0;
  await Promise.all(Array.from({ length: Math.min(3, stops.length) }, async () => {
    while (nextStop < stops.length) {
      const stop = stops[nextStop++];
      sources.set(stop.id, await fetchTripForecast(stop));
    }
  }));

  const dailyPlans: DailyLayerPlan[] = [];
  const coverage: TripDayCoverage[] = daysForCoverage.map(({ date, day, stop, activity, activityKey, outfit, manualKit, outsideWindow }) => {
    const { forecast, hours } = tripDayForecast(date,
      outsideWindow ? undefined : stop ? sources.get(stop.id) : undefined,
      outsideWindow ?? (hasTripCoordinates(stop) ? "not_needed" : "no_location"));
    const entry: TripDayCoverage = {
      date, activity, stopName: stop?.name ?? null, forecast,
      advice: "unavailable", message: forecast.message, action: "plan_manually",
    };
    if (!day) {
      return { ...entry, advice: "missing_inputs", reason: "no_day", message: "This date has no saved day plan. Open this day to create one.", action: "review_day" };
    }
    if (outfit) {
      const notes = outfitMismatches(outfit, { date, activity: day.activity, stop: stop ?? null });
      return notes.length > 0
        ? { ...entry, advice: "saved", reason: "saved_kit", message: "Your saved outfit doesn't match this day's plan now. Review it on this day.", action: "review_day", notes }
        : { ...entry, advice: "saved", reason: "saved_kit", message: "Packed from your saved outfit.", action: "review_day" };
    }
    if (manualKit) {
      return { ...entry, advice: "manual", reason: "manual_kit", message: "Older checklist saved. It names layers, not your items, so it isn't in your list. Save an outfit from Gear up to add them." };
    }
    if (activity === "Rest") {
      return { ...entry, advice: "rest", reason: "rest_day", message: "Rest day; review personal items manually." };
    }
    if (!activity) {
      return { ...entry, advice: "missing_inputs", reason: "no_activity", message: "Choose an activity for this day.", action: "set_activity" };
    }
    if (!hasTripCoordinates(stop)) {
      return { ...entry, advice: "missing_inputs", reason: stop ? "no_coords" : "no_stop", message: forecast.message, action: "set_location" };
    }
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
    return { ...entry, advice: "available", message: "No outfit saved. General suggestions for this day are below.", action: "review_day" };
  });
  const skipped = coverage.filter((day) => day.advice !== "available" && day.advice !== "saved")
    .map((day) => ({ date: day.date, reason: day.reason ?? day.advice }));

  // Pull this user's item mappings + wardrobe so the engine can resolve
  // standard layer slots to the specific gear they own.
  const [mappingsRes, wardrobeItems] = await Promise.all([
    readMappings(supabase, userId),
    fetchUserWardrobeItems(supabase, userId),
  ]);
  const mappingRows = (mappingsRes.data ?? []) as MappingRow[];
  const itemMappings = new Map<string, string>();
  for (const row of mappingRows) {
    itemMappings.set(
      `${row.body_part}:${row.layer_type}:${row.standard_option}`,
      row.custom_name
    );
  }

  // A wardrobe that couldn't be read leaves every slot unmatched, as before.
  const suggestions = buildPackingListFromDays(dailyPlans, itemMappings, wardrobeItems ?? []);

  // The person's own choices: a list that can't be read (before its
  // migration) still shows, without them, and can't be changed.
  const packing = myMember ? await readMemberPacking(supabase, myMember.id) : { saved: null, readable: false, equipment: false };
  const editable = packing.readable;
  const saved = packing.saved;
  const derived = itemsFromKits(kits, mappedNames(mappingRows));
  const versions = kitVersions(kits.map(({ kit }) => kit));
  const seen = readSeen(saved?.seen);
  // The first list seen is the one changes are flagged against.
  if (editable && !seen && derived.length > 0) {
    await updatePacking(supabase, id, userId, { op: "acknowledge", seen: packingSeen(derived), kits: versions });
  }
  const { items, removed } = packingWithChanges(derived, readQuantities(saved?.quantities), seen);
  const checklists: PackingChecklist[] = kits
    .filter(({ kit }) => !kit.outfit && kit.items.length > 0)
    .map(({ date, kit }) => ({ date, items: kit.items }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Find the requesting user's TripMember row and any group gear assigned to them.
  const myGear = myMember
    ? full.gear
        .filter((g) => g.assignee_member_id === myMember.id)
    : [];

  return NextResponse.json({
    trip: {
      id: full.trip.id,
      name: full.trip.name,
      start_date: full.trip.start_date,
      end_date: full.trip.end_date,
    },
    totalDays: dates.length,
    coverage,
    items,
    removed,
    kitVersions: versions,
    checklists,
    manual: readManualItems(saved?.items),
    checks: readPackingChecks(saved?.checks),
    editable,
    equipment: buildTouringEquipment({
      dates: touringDates(full),
      saved: readEquipment(saved?.equipment),
      names: [...derived.map((item) => item.name), ...readManualItems(saved?.items).map((item) => item.name)],
      editable: editable && packing.equipment,
    }),
    suggestions,
    suggestedDays: dailyPlans.length,
    skipped,
    groupGear: myGear,
  } satisfies TripPackResponse, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Applies one change to the signed-in member's own list: an item added by
 * hand, its quantity or removal, the quantity of an item from their kits, or
 * acknowledging the changes to their kits. Returns their saved choices.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const change = parsePackingChange(await readJson(request));
  if (typeof change === "string") return jsonError(change, 400);
  if ((change.op === "add_equipment" && !change.ids.every(isTemplateId))
    || ((change.op === "equipment_quantity" || change.op === "remove_equipment") && !isTemplateId(change.id))) {
    return jsonError("That item isn't in the touring equipment list.", 400);
  }

  let op: Record<string, unknown> = change;
  if (change.op === "acknowledge" || change.op === "set_packed") {
    const full = await loadTripFull(supabase, id);
    if (!full) return jsonError("Not found", 404);
    const kits = myKits(full, myMemberOf(full, userId)?.id);
    const versions = kitVersions(kits.map(({ kit }) => kit));
    if (!sameKitVersions(versions, change.kits)) return kitsChanged();
    const { data: mappings } = await readMappings(supabase, userId);
    const derived = itemsFromKits(kits, mappedNames((mappings ?? []) as MappingRow[]));
    if (change.op === "acknowledge") {
      op = { op: "acknowledge", seen: packingSeen(derived), kits: versions };
    } else {
      // A caller cannot create checks for another person's kit, group gear,
      // decorative suggestions, or an item that has left their outfits.
      const item = derived.find((item) => item.key === change.key);
      const equipment = change.key.startsWith(equipmentKey("")) && isTemplateId(change.key.slice(equipmentKey("").length));
      if (!item && !equipment && !/^manual:[0-9a-f-]{36}$/.test(change.key)) return jsonError("That item is no longer in your list. Refresh and try again.", 404);
      op = { ...change, aliases: item?.aliases ?? [] };
    }
  }

  const { data, error } = await updatePacking(supabase, id, userId, op);
  if (error) return packingError(error, change);
  return NextResponse.json({
    manual: readManualItems(data?.items),
    quantities: readQuantities(data?.quantities),
    checks: readPackingChecks(data?.checks),
    equipment: readEquipment(data?.equipment),
  } satisfies PackingChoices, { headers: { "Cache-Control": "private, no-store" } });
}

function kitsChanged() {
  return NextResponse.json({ error: "Your saved outfits changed. Here's your list now.", code: "kits_changed" }, { status: 409 });
}

function packingError(error: { code?: string; message?: string }, change: PackingChange) {
  switch (error.code) {
    case "42501": return jsonError("Not found", 404);
    case "P0002": return jsonError("That item was removed in another session. Reload your list.", 404);
    case "PT409":
    case "40001": return kitsChanged();
    case "P0409": return NextResponse.json({ error: "This item changed in another session. Review its saved state and try again.", code: "packing_changed" }, { status: 409 });
    case "22023":
      // The template's ids are checked here, so a refused equipment change
      // means the function doesn't know it yet (before migration 032).
      if (change.op === "add_equipment" || change.op === "equipment_quantity" || change.op === "remove_equipment") {
        return jsonError("Touring equipment can't be saved yet. Try again later.", 503);
      }
      return jsonError(change.op === "add_item" ? "You can add up to 50 items. Remove one first." : "Check the change and try again.", 400);
    // Before its migration, the list's choices can't be saved.
    case "42883": case "42P01": case "42703": case "PGRST202": return jsonError("Packing changes can't be saved yet. Try again later.", 503);
    default: return jsonError("Couldn't save the change. Try again.", 500);
  }
}
