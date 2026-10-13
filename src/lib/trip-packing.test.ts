import { describe, expect, it } from "vitest";
import { planDay, savedOutfit, WEAR } from "@/test/savedKit";
import {
  kitVersions, packingFromOutfits, packingSeen, packingWithChanges, parsePackingChange,
  readManualItems, readQuantities, readSeen, sameKitVersions, type DayOutfit,
} from "@/lib/trip-packing";
import type { Recommendation } from "@/types/recommendations";
import type { SavedPlanDay } from "@/types/savedKit";
import type { TripMemberDayKit } from "@/types/trips";

const SAT = "2026-10-10";
const SUN = "2026-10-11";
const MON = "2026-10-12";

const withShell = (shell: Recommendation["torso"]["outer"][number]): Recommendation => ({ ...WEAR, torso: { ...WEAR.torso, outer: [shell] } });
const day = (date: string, wear = WEAR, savedAt = `${date}T08:00:00+00:00`): DayOutfit => ({
  date, savedAt, outfit: savedOutfit({ phases: [{ id: "outing", wear, carry: [], decision: null }] }),
});
const planDayKit = (date: string, overrides: Partial<SavedPlanDay["day"]> = {}): DayOutfit => ({
  date, savedAt: "2026-10-09T08:00:00+00:00",
  outfit: { version: 1, kind: "plan_day", outing: { ...savedOutfit().outing, when: { mode: "later", date: SAT, time: "09:00", durationDays: 3 } }, startHour: 6, endHour: 21, day: planDay(date, overrides) },
});
const find = <T extends { name: string }>(items: T[], name: string) => items.find((item) => item.name === name);

describe("packingFromOutfits", () => {
  it("lists the same jacket worn on three days once, with each day", () => {
    const items = packingFromOutfits([day(SAT), day(SUN), day(MON)]);
    const shell = find(items, "Ski shell");
    expect(shell).toEqual({
      key: "item:g-3", name: "Ski shell", bodyPart: "torso", layerType: "outer", ownership: "owned",
      days: [SAT, SUN, MON].map((date) => ({ date, uses: ["wear"] })),
    });
    expect(items.filter((item) => item.name === "Ski shell")).toHaveLength(1);
    // Base to outer by body area, as the page lists them.
    expect(items.map((item) => item.name)).toEqual(["Merino crew", "Fleece", "Ski shell", "Long johns", "Ski pants", "Insulated gloves"]);
    expect(find(items, "Merino crew")).toMatchObject({ brand: "Smartwool" });
  });

  it("keeps a substituted jacket apart, each with its own days", () => {
    const items = packingFromOutfits([day(SAT), day(SUN, withShell({ name: "Rain shell", sourceId: "g-9" }))]);
    expect(find(items, "Ski shell")?.days).toEqual([{ date: SAT, uses: ["wear"] }]);
    expect(find(items, "Rain shell")?.days).toEqual([{ date: SUN, uses: ["wear"] }]);
  });

  it("tells your own items from suggestions and general items", () => {
    const items = packingFromOutfits([day(SAT, withShell({ name: "Generic hard shell" }))]);
    expect(find(items, "Merino crew")?.ownership).toBe("owned");
    expect(find(items, "Fleece")?.ownership).toBe("suggested");
    expect(find(items, "Generic hard shell")).toMatchObject({ ownership: "general", key: "general:torso:outer:generic hard shell" });
  });

  it("counts an item as yours once any outfit had it from your wardrobe, and names it as last saved", () => {
    const later = withShell({ name: "Ski shell (blue)", sourceId: "g-3" });
    const items = packingFromOutfits([
      day(SAT, { ...later, torso: { ...later.torso, outer: [{ name: "Ski shell", sourceId: "g-3", isRecommended: true }] } }, "2026-10-01T00:00:00Z"),
      day(SUN, later, "2026-10-05T00:00:00Z"),
    ]);
    expect(find(items, "Ski shell (blue)")).toMatchObject({ ownership: "owned", days: [{ date: SAT, uses: ["wear"] }, { date: SUN, uses: ["wear"] }] });
  });

  it("joins a ski tour's carried layers to the same items worn in the other phase", () => {
    const descent = withShell({ name: "Ski shell", sourceId: "g-3" });
    const climb = withShell({ name: "Wind shirt", sourceId: "g-8" });
    const items = packingFromOutfits([{
      date: SAT, savedAt: null,
      outfit: savedOutfit({
        outing: { ...savedOutfit().outing, activity: "backcountry_skiing" },
        phases: [
          { id: "climb", wear: climb, carry: ["Ski shell"], decision: null },
          { id: "descent", wear: descent, carry: ["Wind shirt"], decision: null },
        ],
      }),
    }]);
    expect(find(items, "Ski shell")?.days).toEqual([{ date: SAT, uses: ["wear", "carry"] }]);
    expect(find(items, "Wind shirt")?.days).toEqual([{ date: SAT, uses: ["wear", "carry"] }]);
    expect(items.some((item) => item.key.startsWith("carry:"))).toBe(false);
  });

  it("lists a plan day's carry advice as carried and joins its general items across days", () => {
    const general: Recommendation = { ...WEAR, torso: { base: [{ name: "Midweight base layer" }], outer: [] } };
    const items = packingFromOutfits([
      planDayKit(SAT, { baseline: { ...planDay(SAT).baseline, recommendation: general }, dayparts: [] }),
      planDayKit(SUN, { baseline: { ...planDay(SUN).baseline, recommendation: general }, dayparts: [] }),
    ]);
    expect(find(items, "Midweight base layer")).toMatchObject({
      ownership: "general", days: [{ date: SAT, uses: ["wear"] }, { date: SUN, uses: ["wear"] }],
    });
    expect(find(items, "Warm gloves and head insulation")).toMatchObject({
      key: "carry:warm gloves and head insulation", bodyPart: null, layerType: null,
      days: [{ date: SAT, uses: ["carry"] }, { date: SUN, uses: ["carry"] }],
    });
    // Carried items come after everything worn.
    expect(items.at(-1)?.name).toBe("Warm gloves and head insulation");
  });

  it("counts a plan's item renamed to one of yours as yours, and as the same item worn under that name elsewhere", () => {
    const named: Recommendation = { ...WEAR, torso: { base: [{ name: "Merino crew" }], outer: [] } };
    const items = packingFromOutfits(
      [day(SAT), planDayKit(SUN, { baseline: { ...planDay(SUN).baseline, recommendation: named }, dayparts: [], carryItems: [] })],
      new Set(["torso:base:Merino crew"]),
    );
    expect(items.filter((item) => item.name === "Merino crew")).toEqual([
      expect.objectContaining({ key: "item:g-1", ownership: "owned", days: [{ date: SAT, uses: ["wear"] }, { date: SUN, uses: ["wear"] }] }),
    ]);
    const alone = packingFromOutfits([planDayKit(SUN, { baseline: { ...planDay(SUN).baseline, recommendation: named }, dayparts: [] })], new Set(["torso:base:Merino crew"]));
    expect(find(alone, "Merino crew")?.ownership).toBe("owned");
  });

  it("includes a plan day's daypart layers", () => {
    const evening: Recommendation = { ...WEAR, headNeck: { base: [{ name: "Neck gaiter" }], outer: [] } };
    const plan = planDay(SAT);
    const items = packingFromOutfits([planDayKit(SAT, { dayparts: [{ ...plan.dayparts[1], recommendation: evening }] })]);
    expect(find(items, "Neck gaiter")?.days).toEqual([{ date: SAT, uses: ["wear"] }]);
  });

  it("keeps names in every script apart", () => {
    const hat: Recommendation = { ...WEAR, headNeck: { base: [{ name: "帽子" }, { name: "Шапка" }], outer: [] } };
    const items = packingFromOutfits([planDayKit(SAT, { baseline: { ...planDay(SAT).baseline, recommendation: hat }, dayparts: [], carryItems: ["手袋", "帽子 ", "!!", "??"] })]);
    expect(items.filter((item) => item.bodyPart === "headNeck").map((item) => item.key)).toEqual(["general:headNeck:base:шапка", "general:headNeck:base:帽子"]);
    // A carried 帽子 is the 帽子 worn that day; the other carried names stay apart.
    expect(find(items, "帽子")?.days).toEqual([{ date: SAT, uses: ["wear", "carry"] }]);
    expect(items.filter((item) => !item.bodyPart).map((item) => item.name).sort()).toEqual(["!!", "??", "手袋"]);
  });

  it("leaves out blank names and copes with an outfit missing its layers", () => {
    const blank = withShell({ name: "   " });
    const broken = { date: SUN, savedAt: null, outfit: { ...savedOutfit(), phases: undefined } } as unknown as DayOutfit;
    const items = packingFromOutfits([day(SAT, blank), broken]);
    expect(items.some((item) => !item.name.trim())).toBe(false);
    expect(items.every((item) => item.days.every((entry) => entry.date === SAT))).toBe(true);
  });
});

describe("packingWithChanges", () => {
  const before = packingFromOutfits([day(SAT), day(SUN)]);
  const seen = packingSeen(before);

  it("flags nothing before the first acknowledgement, and applies chosen quantities", () => {
    const { items, removed } = packingWithChanges(before, { "item:g-1": 3 }, null);
    expect(items.every((item) => !item.change)).toBe(true);
    expect(removed).toEqual([]);
    expect(find(items, "Merino crew")?.quantity).toBe(3);
    expect(find(items, "Ski shell")?.quantity).toBe(1);
  });

  it("marks a substituted jacket as replacing the one it took the place of", () => {
    const after = packingFromOutfits([day(SAT, withShell({ name: "Rain shell", sourceId: "g-9" })), day(SUN, withShell({ name: "Rain shell", sourceId: "g-9" }))]);
    const { items, removed } = packingWithChanges(after, {}, seen);
    expect(items.find((item) => item.name === "Rain shell")?.change).toEqual({ kind: "replaced", replaces: ["Ski shell"] });
    expect(items.filter((item) => item.change)).toHaveLength(1);
    expect(removed).toEqual([]);
  });

  it("lists items that left without a replacement, and new items as added", () => {
    const noGloves: Recommendation = { ...WEAR, hands: { base: [], outer: [] }, headNeck: { base: [{ name: "Beanie", sourceId: "hw-1" }], outer: [] } };
    const { items, removed } = packingWithChanges(packingFromOutfits([day(SAT, noGloves), day(SUN, noGloves)]), {}, seen);
    expect(removed).toEqual([{ key: "item:h-1", name: "Insulated gloves", dates: [SAT, SUN] }]);
    expect(find(items, "Beanie")?.change).toEqual({ kind: "added" });
  });

  it("keeps an item's quantity when it comes back", () => {
    const { items } = packingWithChanges(before, { "item:g-3": 2, "item:gone": 4 }, seen);
    expect(find(items, "Ski shell")?.quantity).toBe(2);
  });

  it("keeps a quantity and acknowledgement saved under an item that joined another", () => {
    const general: Recommendation = { ...WEAR, torso: { base: [{ name: "Merino crew" }], outer: [] } };
    const planOnly = [planDayKit(SUN, { baseline: { ...planDay(SUN).baseline, recommendation: general }, dayparts: [], carryItems: ["Ski shell"] })];
    const seenBefore = packingSeen(packingFromOutfits(planOnly));
    const quantities = { "general:torso:base:merino crew": 3, "carry:ski shell": 2 };
    const joined = packingFromOutfits([day(SAT), ...planOnly]);
    expect(find(joined, "Merino crew")).toMatchObject({ key: "item:g-1", aliases: ["general:torso:base:merino crew"] });
    expect(find(joined, "Ski shell")).toMatchObject({ key: "item:g-3", aliases: ["carry:ski shell"] });

    const { items, removed } = packingWithChanges(joined, quantities, seenBefore);
    expect(find(items, "Merino crew")).toMatchObject({ quantity: 3 });
    expect(find(items, "Merino crew")?.change).toBeUndefined();
    expect(find(items, "Ski shell")).toMatchObject({ quantity: 2 });
    expect(find(items, "Ski shell")?.change).toBeUndefined();
    expect(removed).toEqual([]);
    // A quantity chosen for the item it joined wins, one included.
    expect(find(packingWithChanges(joined, { ...quantities, "item:g-1": 1 }, null).items, "Merino crew")?.quantity).toBe(1);
  });

  it("records carried items without slots, so they're added or removed rather than replaced", () => {
    const carry = packingSeen(packingFromOutfits([planDayKit(SAT)]))["carry:warm gloves and head insulation"];
    expect(carry).toEqual({ name: "Warm gloves and head insulation", dates: [SAT], slots: [] });
    expect(seen["item:g-3"]).toEqual({ name: "Ski shell", dates: [SAT, SUN], slots: [`${SAT}:torso:outer`, `${SUN}:torso:outer`] });
  });
});

describe("reading saved choices", () => {
  it("keeps only well-formed entries", () => {
    expect(readSeen(null)).toBeNull();
    expect(readSeen({ a: { name: "A", dates: [SAT], slots: [] }, b: { name: 1 } })).toEqual({ a: { name: "A", dates: [SAT], slots: [] } });
    expect(readManualItems([{ id: "x", name: "Headlamp", quantity: 2 }, { id: "y", name: "Bad", quantity: 0 }, "z"]))
      .toEqual([{ id: "x", name: "Headlamp", quantity: 2 }]);
    expect(readQuantities({ a: 2, b: 0, c: "3", d: 21 })).toEqual({ a: 2 });
  });

  it("compares kit versions however their times are written", () => {
    const kit = (id: string, at: string, extra: Partial<TripMemberDayKit> = {}) =>
      ({ id, trip_day_id: "d", trip_member_id: "m", effort: "steady", items: [], note: null, state: "ok", updated_at: at, outfit: savedOutfit(), ...extra }) as TripMemberDayKit;
    const versions = kitVersions([kit("a", "2026-10-08T01:00:00.5+00:00"), kit("b", "2026-10-08T02:00:00Z", { outfit: null })]);
    expect(versions).toEqual({ a: "2026-10-08T01:00:00.5+00:00" });
    expect(sameKitVersions(versions, { a: "2026-10-08T01:00:00.500Z" })).toBe(true);
    expect(sameKitVersions(versions, { a: "2026-10-08T01:00:01Z" })).toBe(false);
    expect(sameKitVersions(versions, { a: "2026-10-08T01:00:00.5Z", b: "2026-10-08T02:00:00Z" })).toBe(false);
    expect(sameKitVersions({}, {})).toBe(true);
  });
});

describe("parsePackingChange", () => {
  const id = "0b4b6a7e-9c1d-4f53-a8b2-2f6c1d9e7a10";
  it.each([
    [{ op: "add_item", id: id.toUpperCase(), name: "  Headlamp ", quantity: 2 }, { op: "add_item", id, name: "Headlamp", quantity: 2 }],
    [{ op: "item_quantity", id, quantity: 20 }, { op: "item_quantity", id, quantity: 20 }],
    [{ op: "remove_item", id }, { op: "remove_item", id }],
    [{ op: "quantity", key: "item:g-1", quantity: 1 }, { op: "quantity", key: "item:g-1", quantity: 1 }],
    [{ op: "acknowledge", kits: { a: "2026-10-08T01:00:00Z" } }, { op: "acknowledge", kits: { a: "2026-10-08T01:00:00Z" } }],
  ])("accepts %j", (body, expected) => {
    expect(parsePackingChange(body)).toEqual(expected);
  });

  it.each([
    null, {}, { op: "delete_everything" },
    { op: "add_item", id: "not-a-uuid", name: "Headlamp", quantity: 1 },
    { op: "add_item", id, name: " ", quantity: 1 },
    { op: "add_item", id, name: "x".repeat(81), quantity: 1 },
    { op: "add_item", id, name: "Headlamp", quantity: 0 },
    { op: "item_quantity", id, quantity: 21 },
    { op: "item_quantity", id, quantity: 1.5 },
    { op: "quantity", key: "", quantity: 2 },
    { op: "acknowledge", kits: { a: "yesterday" } },
    { op: "acknowledge", kits: [] },
  ])("refuses %j", (body) => {
    expect(typeof parsePackingChange(body)).toBe("string");
  });
});
