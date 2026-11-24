/**
 * How an outing's layers felt (#8): what a signed-in person says after a
 * Gear up outing for now, or after a trip day with a saved kit. See
 * docs/outing-feedback.md.
 */
import type { TemperatureSensitivity } from "@/types/preferences";
import type { SavedOutfit } from "@/types/savedKit";

export const FEEDBACK_OVERALL = ["too_cold", "just_right", "too_warm"] as const;
export type FeedbackOverall = (typeof FEEDBACK_OVERALL)[number];

/** When it felt that way: steady activity, the start, stops, or afterwards. */
export const FEEDBACK_MOMENTS = ["sustained", "start", "stops", "after"] as const;
export type FeedbackMoment = (typeof FEEDBACK_MOMENTS)[number];

/** Where it felt that way. Feet aren't in the layers, but they're asked about. */
export const FEEDBACK_BODY_AREAS = ["head_neck", "torso", "hands", "legs", "feet"] as const;
export type FeedbackBodyArea = (typeof FEEDBACK_BODY_AREAS)[number];

/** Clothing anyone might have worn that isn't in the catalog. */
export const GENERIC_WORN_ITEMS = {
  t_shirt: { name: "T-shirt", area: "torso" },
  long_sleeve: { name: "Long-sleeve top", area: "torso" },
  light_jacket: { name: "Light jacket", area: "torso" },
  shorts: { name: "Shorts", area: "legs" },
  tights: { name: "Tights or leggings", area: "legs" },
  pants: { name: "Pants", area: "legs" },
  hat: { name: "Hat or headband", area: "head_neck" },
  gloves: { name: "Gloves", area: "hands" },
} as const satisfies Record<string, { name: string; area: FeedbackBodyArea }>;
export type GenericWornItem = keyof typeof GENERIC_WORN_ITEMS;

/** Body areas someone can say they wore nothing on: no hat, no gloves. */
export const BARE_AREAS = ["head_neck", "hands"] as const;
export type BareArea = (typeof BARE_AREAS)[number];

/**
 * One thing worn: from the suggested layers, the wardrobe (with its catalog
 * item's ID when it has one), or a generic entry.
 */
export interface WornItem {
  source: "suggested" | "wardrobe" | "generic";
  area: FeedbackBodyArea;
  name: string;
  item_id?: string;
  /** For a generic entry, which one. */
  generic?: GenericWornItem;
}

/**
 * What was actually worn, as the person confirmed it. `as_suggested` says they
 * wore the suggested layers; otherwise `items` lists what they wore instead.
 */
export type WornOutfit =
  | { as_suggested: true }
  | { as_suggested: false; items: WornItem[]; bare: BareArea[] };

/** What the person says. Only `overall` is required; anything left out is unknown. */
export interface FeedbackAnswer {
  overall: FeedbackOverall;
  moments: FeedbackMoment[];
  body_areas: FeedbackBodyArea[];
  /** Null until they say what they wore: never assumed to be the suggestion. */
  worn: WornOutfit | null;
}

/** Feedback as the API returns it. */
export interface OutingFeedbackView extends FeedbackAnswer {
  updated_at: string;
}

/** POST /api/v1/outing-feedback: a Gear up result for now, as shown. */
export interface GearUpFeedbackRequest {
  /** Generated in the browser for the result shown, so answering again changes the same feedback. */
  key: string;
  outfit: SavedOutfit;
  /** The warm/cold preference the result was asked with (#251), when known. */
  sensitivity?: TemperatureSensitivity;
  answer: FeedbackAnswer;
}

/** GET /api/v1/trips/:id/days/:date/feedback: whether the day's own kit can be rated yet. */
export type TripDayFeedbackState =
  | { status: "open"; feedback: OutingFeedbackView | null }
  /** The outing hasn't started yet; `opens_at` is when it does. */
  | { status: "not_started"; opens_at: string }
  /** No saved outfit to rate on this day. */
  | { status: "no_kit" };
