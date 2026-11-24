import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import {
  feedbackRecord,
  loadFeedback,
  outingStartedAt,
  readFeedbackAnswer,
  readPreferenceContext,
  saveFeedback,
  tripKitSourceKey,
} from "@/lib/outing-feedback-server";
import { tripDayTimeZone } from "@/lib/trip-day-outing";
import { isCalendarDate } from "@/lib/trip-lodging";
import { kitTimeZone } from "@/lib/trip-saved-kits";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import type { TripDayFeedbackState } from "@/types/outingFeedback";

type Context = { params: Promise<{ id: string; date: string }> };

/**
 * The signed-in person's own saved outfit on the trip day, and when its
 * outing started; a response to return instead when there's no such day.
 */
async function ownKit(id: string, date: string) {
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  let full;
  try { full = await loadTripFull(auth.supabase, auth.trip); }
  catch { return jsonError("Couldn't load the trip. Try again.", 500); }
  const day = full?.days.find((entry) => entry.date === date);
  if (!full || !day) return jsonError("This day is no longer on the trip. Reload the trip.", 404);
  const member = full.members.find((entry) => entry.user_id === auth.userId && entry.status !== "left");
  if (!member) return jsonError("Not found", 404);
  const kit = full.kits.find((entry) => entry.trip_day_id === day.id && entry.trip_member_id === member.id);
  if (!kit?.outfit) return { auth, kit: null, startedAt: null };
  // The kit's own time zone when it has one; otherwise the day's, as far as it can be told.
  const zone = kitTimeZone(kit.outfit) ? null : await tripDayTimeZone(full, day);
  return { auth, kit: { ...kit, outfit: kit.outfit }, startedAt: outingStartedAt(kit.outfit, date, zone) };
}

const notStarted = (startedAt: number | null, now: number) => startedAt !== null && startedAt > now;

/**
 * Whether the person can say how their kit for the day felt (#8): once its
 * outing has started, with their answer when they've given one. Only their
 * own kit, and only a saved outfit, not a category checklist.
 */
export async function GET(_request: Request, context: Context) {
  const { id, date } = await context.params;
  const found = await ownKit(id, date);
  if (found instanceof NextResponse) return found;
  const { auth, kit, startedAt } = found;
  if (!kit) return NextResponse.json({ status: "no_kit" } satisfies TripDayFeedbackState);
  if (notStarted(startedAt, Date.now())) {
    return NextResponse.json({ status: "not_started", opens_at: new Date(startedAt!).toISOString() } satisfies TripDayFeedbackState);
  }
  const read = await loadFeedback(auth.supabase, auth.userId, tripKitSourceKey(kit.id, kit.outfit_saved_at));
  if (read.status === "unavailable") return jsonError("Feedback isn't available yet.", 503);
  if (read.status === "failed") return jsonError("Couldn't load your feedback. Try again.", 500);
  return NextResponse.json({ status: "open", feedback: read.feedback } satisfies TripDayFeedbackState);
}

/** Saves how the person's kit for the day felt, or replaces their earlier answer about the same kit. */
export async function PUT(request: Request, context: Context) {
  const { id, date } = await context.params;
  const body = await readJson(request);
  const answer = readFeedbackAnswer(body?.answer);
  if (typeof answer === "string") return jsonError(answer, 400);
  const found = await ownKit(id, date);
  if (found instanceof NextResponse) return found;
  const { auth, kit, startedAt } = found;
  if (!kit) return jsonError("There's no saved outfit for you on this day.", 404);
  const now = Date.now();
  if (notStarted(startedAt, now)) {
    return NextResponse.json({ error: "Tell us how it went once the outing has started.", code: "not_started",
      opens_at: new Date(startedAt!).toISOString() }, { status: 409 });
  }
  const savedAt = kit.outfit_saved_at ? Date.parse(kit.outfit_saved_at) : NaN;
  const record = feedbackRecord({
    userId: auth.userId,
    source: "trip_kit",
    sourceKey: tripKitSourceKey(kit.id, kit.outfit_saved_at),
    kit: kit.outfit,
    date,
    tripId: id,
    answer,
    // A saved kit doesn't record the preference it was planned with.
    sensitivityAtRecommendation: null,
    preferences: await readPreferenceContext(auth.supabase, auth.userId),
    startedAt,
    recommendedAt: Number.isFinite(savedAt) ? savedAt : null,
    now,
  });
  const saved = await saveFeedback(auth.supabase, record);
  if (saved.status === "unavailable") return jsonError("Feedback can't be saved yet. Try again later.", 503);
  if (saved.status === "failed") return jsonError("Couldn't save your feedback. Try again.", 500);
  return NextResponse.json({ feedback: saved.feedback });
}
