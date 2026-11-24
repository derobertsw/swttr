"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chipClassName } from "@/components/ui/chip";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { getBodyPart } from "@/components/wardrobe/wardrobe-utils";
import { suggestedWornItems, type SuggestedWornItem } from "@/lib/outing-feedback";
import { errorMessage, timedTripRequest } from "@/lib/trip-requests";
import { cn } from "@/lib/utils";
import {
  BARE_AREAS,
  FEEDBACK_BODY_AREAS,
  FEEDBACK_MOMENTS,
  FEEDBACK_OVERALL,
  GENERIC_WORN_ITEMS,
  type BareArea,
  type FeedbackAnswer,
  type FeedbackBodyArea,
  type FeedbackMoment,
  type FeedbackOverall,
  type GearUpFeedbackRequest,
  type GenericWornItem,
  type OutingFeedbackView,
  type TripDayFeedbackState,
  type WornItem,
} from "@/types/outingFeedback";
import type { TemperatureSensitivity } from "@/types/preferences";
import type { SavedKit, SavedOutfit } from "@/types/savedKit";
import type { WardrobeItem } from "@/types/wardrobe";

const OVERALL_LABELS: Record<FeedbackOverall, string> = { too_cold: "Too cold", just_right: "Just right", too_warm: "Too warm" };
const MOMENT_LABELS: Record<FeedbackMoment, string> = {
  sustained: "While moving", start: "At the start", stops: "At stops", after: "Afterwards",
};
const AREA_LABELS: Record<FeedbackBodyArea, string> = {
  head_neck: "Head & neck", torso: "Torso", hands: "Hands", legs: "Legs", feet: "Feet",
};
const BARE_LABELS: Record<BareArea, string> = { head_neck: "No hat", hands: "No gloves" };
const WARDROBE_AREA: Record<string, FeedbackBodyArea> = { "head & neck": "head_neck", torso: "torso", legs: "legs", hands: "hands" };

type Worn = "unknown" | "suggested" | "different";

/** The suggested items as worn, to start a correction from. */
const asWorn = (items: SuggestedWornItem[]): WornItem[] => items.map((item) => ({ source: "suggested", ...item }));

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

interface OutingFeedbackCardProps {
  /** What the layers suggested wearing, to confirm or correct. */
  suggested: SuggestedWornItem[];
  /** An answer given before, for a saved kit. */
  initial?: OutingFeedbackView | null;
  /** Saves the answer; resolves with it as saved, or throws why it wasn't. */
  onSave: (answer: FeedbackAnswer) => Promise<OutingFeedbackView>;
}

/**
 * How did it go? (#8): one tap says whether the layers were too cold, just
 * right or too warm, and saves. When, where and what was actually worn are
 * optional details. Nothing said about clothing is read as wearing the
 * suggestion. See docs/outing-feedback.md.
 */
export function OutingFeedbackCard({ suggested, initial = null, onSave }: OutingFeedbackCardProps) {
  const headingId = useId();
  const [saved, setSaved] = useState<OutingFeedbackView | null>(initial);
  const [overall, setOverall] = useState<FeedbackOverall | null>(initial?.overall ?? null);
  const [moments, setMoments] = useState<FeedbackMoment[]>(initial?.moments ?? []);
  const [areas, setAreas] = useState<FeedbackBodyArea[]>(initial?.body_areas ?? []);
  const [worn, setWorn] = useState<Worn>(!initial?.worn ? "unknown" : initial.worn.as_suggested ? "suggested" : "different");
  const [items, setItems] = useState<WornItem[]>(initial?.worn && !initial.worn.as_suggested ? initial.worn.items : asWorn(suggested));
  const [bare, setBare] = useState<BareArea[]>(initial?.worn && !initial.worn.as_suggested ? initial.worn.bare : []);
  const [state, setState] = useState<{ status: "idle" | "saving" | "saved" } | { status: "error"; message: string }>({ status: "idle" });
  const [detailsSaved, setDetailsSaved] = useState(false);

  const answerFor = (next: FeedbackOverall): FeedbackAnswer => ({
    overall: next,
    moments: next === "just_right" ? [] : moments,
    body_areas: next === "just_right" ? [] : areas,
    worn: worn === "unknown" ? null : worn === "suggested" ? { as_suggested: true } : { as_suggested: false, items, bare },
  });

  const save = async (answer: FeedbackAnswer, details: boolean) => {
    if (state.status === "saving") return;
    setState({ status: "saving" });
    try {
      setSaved(await onSave(answer));
      setDetailsSaved(details);
      setState({ status: "saved" });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  };

  const pickOverall = (next: FeedbackOverall) => {
    setOverall(next);
    void save(answerFor(next), false);
  };

  const addItem = (item: WornItem) => {
    setItems((current) => current.some((entry) => entry.area === item.area && entry.name === item.name) ? current : [...current, item]);
    setBare((current) => current.filter((area) => area !== item.area));
  };
  const toggleBare = (area: BareArea) => {
    setBare((current) => toggle(current, area));
    if (!bare.includes(area)) setItems((current) => current.filter((item) => item.area !== area));
  };
  const differentIsEmpty = worn === "different" && items.length === 0 && bare.length === 0;
  const saving = state.status === "saving";

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-lg font-semibold text-foreground">How did it go?</h3>
        <p className="text-sm text-muted-foreground">
          Once you&apos;re back, tell us how these layers felt. It helps us improve the advice, and doesn&apos;t change your settings.
        </p>
      </div>

      <div role="group" aria-label="How the layers felt" className={cn(segmentedGroupClassName, "grid-cols-3")}>
        {FEEDBACK_OVERALL.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={overall === option}
            aria-disabled={saving || undefined}
            onClick={() => !saving && pickOverall(option)}
            className={cn(segmentedItemClassName, "aria-disabled:cursor-progress")}
          >
            {OVERALL_LABELS[option]}
          </button>
        ))}
      </div>

      {/* Only there once there's something to say, so the result page's own status stays the only one before then. */}
      {(state.status === "saving" || state.status === "saved" || (state.status === "idle" && saved)) && (
        <p role="status" className="text-sm">
          {state.status === "saving" && <span className="text-muted-foreground">Saving…</span>}
          {state.status === "saved" && (detailsSaved ? "Details saved. Thanks." : "Saved. Thanks. Add details below if you like.")}
          {state.status === "idle" && saved && <span className="text-muted-foreground">You told us: {OVERALL_LABELS[saved.overall]}.</span>}
        </p>
      )}
      {state.status === "error" && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          <p className="text-destructive">Couldn&apos;t save your feedback: {state.message}</p>
          {overall && <Button type="button" variant="outline" size="sm" onClick={() => void save(answerFor(overall), detailsSaved)}>Try again</Button>}
        </div>
      )}

      {saved && overall && (
        <div className="flex flex-col gap-4">
          {overall !== "just_right" && (
            <>
              <ChipGroup
                label="When did you notice it?"
                options={FEEDBACK_MOMENTS}
                labels={MOMENT_LABELS}
                selected={moments}
                onToggle={(moment) => setMoments((current) => toggle(current, moment))}
              />
              <ChipGroup
                label="Where?"
                options={FEEDBACK_BODY_AREAS}
                labels={AREA_LABELS}
                selected={areas}
                onToggle={(area) => setAreas((current) => toggle(current, area))}
              />
            </>
          )}

          <div className="flex flex-col gap-2">
            <p id={`${headingId}-worn`} className="text-sm font-medium text-foreground">What did you wear?</p>
            <div role="radiogroup" aria-labelledby={`${headingId}-worn`} className="flex flex-wrap gap-2">
              {(["suggested", "different"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={worn === option}
                  onClick={() => setWorn(worn === option ? "unknown" : option)}
                  className={chipClassName}
                >
                  {option === "suggested" ? "What was suggested" : "Something different"}
                </button>
              ))}
            </div>
            {worn === "different" && (
              <WornEditor items={items} bare={bare} onRemove={(item) => setItems((current) => current.filter((entry) => entry !== item))}
                onAdd={addItem} onToggleBare={toggleBare} />
            )}
          </div>

          <div className="flex flex-col items-start gap-1.5">
            <Button type="button" variant="outline" size="sm" disabled={differentIsEmpty} loading={saving}
              onClick={() => void save(answerFor(overall), true)}>
              Save details
            </Button>
            {differentIsEmpty && <p className="text-sm text-muted-foreground">Add what you wore, or pick No hat or No gloves.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function ChipGroup<T extends string>({ label, options, labels, selected, onToggle }: {
  label: string; options: readonly T[]; labels: Record<T, string>; selected: T[]; onToggle: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="text-sm font-medium text-foreground">{label} <span className="font-normal text-muted-foreground">Optional</span></p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => onToggle(option)} className={chipClassName}>
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What was worn instead: the suggested items to take off, generic and wardrobe items to add, and no hat or gloves. */
function WornEditor({ items, bare, onRemove, onAdd, onToggleBare }: {
  items: WornItem[]; bare: BareArea[]; onRemove: (item: WornItem) => void; onAdd: (item: WornItem) => void; onToggleBare: (area: BareArea) => void;
}) {
  const addId = useId();
  return (
    <div className="flex flex-col gap-3 rounded-control bg-muted p-3">
      {items.length > 0 ? (
        <ul aria-label="What you wore" className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={`${item.area}:${item.name}`} className="flex min-h-11 items-center justify-between gap-2 text-sm text-foreground">
              <span className="min-w-0 break-words">{item.name} <span className="text-muted-foreground">· {AREA_LABELS[item.area]}</span></span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Didn't wear ${item.name}`} onClick={() => onRemove(item)}>
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing listed yet.</p>
      )}

      <div className="flex flex-col gap-2">
        <p id={addId} className="text-sm font-medium text-foreground">Add</p>
        <div role="group" aria-labelledby={addId} className="flex flex-wrap gap-2">
          {(Object.keys(GENERIC_WORN_ITEMS) as GenericWornItem[]).map((generic) => (
            <button key={generic} type="button" className={chipClassName}
              onClick={() => onAdd({ source: "generic", generic, ...GENERIC_WORN_ITEMS[generic] })}>
              {GENERIC_WORN_ITEMS[generic].name}
            </button>
          ))}
          {BARE_AREAS.map((area) => (
            <button key={area} type="button" aria-pressed={bare.includes(area)} className={chipClassName} onClick={() => onToggleBare(area)}>
              {BARE_LABELS[area]}
            </button>
          ))}
        </div>
      </div>

      <WardrobePicker onAdd={onAdd} />
    </div>
  );
}

/** Adds an item from the person's wardrobe, loaded when it's first needed. */
function WardrobePicker({ onAdd }: { onAdd: (item: WornItem) => void }) {
  const id = useId();
  const [wardrobe, setWardrobe] = useState<WardrobeItem[] | "loading" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/wardrobe/gear")
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as { items?: WardrobeItem[] };
        if (!cancelled) setWardrobe(body.items ?? []);
      })
      .catch(() => { if (!cancelled) setWardrobe("error"); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    if (!Array.isArray(wardrobe)) return [];
    return FEEDBACK_BODY_AREAS.map((area) => ({
      area,
      items: wardrobe.filter((item) => WARDROBE_AREA[getBodyPart(item)] === area),
    })).filter((group) => group.items.length > 0);
  }, [wardrobe]);

  if (wardrobe === "loading") return <p className="text-sm text-muted-foreground">Loading your wardrobe…</p>;
  if (wardrobe === "error") return <p className="text-sm text-muted-foreground">Couldn&apos;t load your wardrobe. You can still add the items above.</p>;
  if (groups.length === 0) return null;
  const name = (item: WardrobeItem) => item.nickname || item.details.model_name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">From your wardrobe</label>
      <select
        id={id}
        value=""
        onChange={(event) => {
          const item = Array.isArray(wardrobe) ? wardrobe.find((entry) => entry.id === event.target.value) : undefined;
          if (!item) return;
          onAdd({ source: "wardrobe", area: WARDROBE_AREA[getBodyPart(item)], name: name(item).slice(0, 200),
            ...(/^[\w.:-]{1,100}$/.test(item.item_id) && { item_id: item.item_id }) });
        }}
        className="h-11 w-full rounded-control border border-input bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <option value="">Pick an item…</option>
        {groups.map((group) => (
          <optgroup key={group.area} label={AREA_LABELS[group.area]}>
            {group.items.map((item) => <option key={item.id} value={item.id}>{name(item)}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/**
 * How did it go? on a Gear up result for now (#8). Results aren't stored, so
 * the outfit as shown goes with the answer, and the answer stays with this
 * result: answering again changes it rather than adding one.
 */
export function GearUpFeedback({ outfit, sensitivity }: { outfit: SavedOutfit; sensitivity?: TemperatureSensitivity }) {
  const [key] = useState(() => crypto.randomUUID());
  const suggested = useMemo(() => suggestedWornItems(outfit), [outfit]);
  return (
    <OutingFeedbackCard
      suggested={suggested}
      onSave={async (answer) => (await timedTripRequest<{ feedback: OutingFeedbackView }>("/api/v1/outing-feedback", "POST",
        { key, outfit, ...(sensitivity && { sensitivity }), answer } satisfies GearUpFeedbackRequest)).feedback}
    />
  );
}

/**
 * How did it go? on a trip day's own saved kit (#8), once its outing has
 * started, as the server judges on the destination's clock. Nothing shows
 * before then, or when it can't be checked.
 */
export function TripDayFeedback({ tripId, date, kit, savedAt }: { tripId: string; date: string; kit: SavedKit; savedAt?: string | null }) {
  const url = `/api/v1/trips/${tripId}/days/${date}/feedback`;
  const [state, setState] = useState<{ url: string; savedAt?: string | null; result: TripDayFeedbackState } | null>(null);
  const suggested = useMemo(() => suggestedWornItems(kit), [kit]);
  useEffect(() => {
    let cancelled = false;
    timedTripRequest<TripDayFeedbackState>(url, "GET")
      .then((result) => { if (!cancelled) setState({ url, savedAt, result }); })
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, [url, savedAt]);
  const current = state?.url === url && state.savedAt === savedAt ? state.result : null;
  if (current?.status !== "open") return null;
  return (
    <OutingFeedbackCard
      key={`${url}:${savedAt}`}
      suggested={suggested}
      initial={current.feedback}
      onSave={async (answer) => (await timedTripRequest<{ feedback: OutingFeedbackView }>(url, "PUT", { answer })).feedback}
    />
  );
}
