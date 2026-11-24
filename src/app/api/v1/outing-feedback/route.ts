import { NextResponse } from "next/server";
import { jsonError, readJson, requireUser } from "@/lib/api";
import {
  feedbackRecord,
  outingStartedAt,
  readFeedbackAnswer,
  readPreferenceContext,
  readSensitivity,
  saveFeedback,
} from "@/lib/outing-feedback-server";
import { kitDate, readSavedOutfit } from "@/lib/trip-saved-kits";

const NEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * How a Gear up result's layers felt (#8), from a signed-in person once the
 * outing has started. The browser sends the outfit as shown, as Save to trip
 * does, since results aren't stored. Sending the same `key` again replaces the
 * answer, so a repeat or a correction never adds another. See
 * docs/outing-feedback.md.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(request);
  if (!body || typeof body.key !== "string" || !NEW_UUID.test(body.key)) return jsonError("Invalid feedback", 400);
  const outfit = readSavedOutfit(body.outfit);
  if (!outfit) return jsonError("Invalid outfit", 400);
  const sensitivity = readSensitivity(body.sensitivity);
  if (sensitivity === undefined) return jsonError("Invalid temperature sensitivity", 400);
  const answer = readFeedbackAnswer(body.answer);
  if (typeof answer === "string") return jsonError(answer, 400);
  const date = kitDate(outfit);
  if (!date) return jsonError("The outing's date can't be told.", 422);

  const now = Date.now();
  const startedAt = outingStartedAt(outfit, date);
  if (startedAt !== null && startedAt > now) {
    return NextResponse.json({ error: "Tell us how it went once the outing has started.", code: "not_started",
      opens_at: new Date(startedAt).toISOString() }, { status: 409 });
  }

  const record = feedbackRecord({
    userId: auth.userId,
    source: "gear_up",
    sourceKey: `gear_up:${body.key.toLowerCase()}`,
    kit: outfit,
    date,
    answer,
    sensitivityAtRecommendation: sensitivity,
    preferences: await readPreferenceContext(auth.supabase, auth.userId),
    startedAt,
    // An outing for now was planned when its conditions were read.
    recommendedAt: outfit.outing.when.mode === "now" ? startedAt : null,
    now,
  });
  const saved = await saveFeedback(auth.supabase, record);
  if (saved.status === "unavailable") return jsonError("Feedback can't be saved yet. Try again later.", 503);
  if (saved.status === "failed") return jsonError("Couldn't save your feedback. Try again.", 500);
  return NextResponse.json({ feedback: saved.feedback });
}
