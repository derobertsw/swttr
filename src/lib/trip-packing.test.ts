import { describe, expect, it } from "vitest";
import { deriveTripPacking, emptyPacking, packingReview, readPackingEdits } from "@/lib/trip-packing";
import { savedOutfit, planDay, savedPlan } from "@/test/savedKit";
import { ORGANIZER } from "@/test/tripApi";
import type { TripFull, TripMemberDayKit } from "@/types/trips";
import { packingTrip } from "@/test/tripPacking";
import type { SavedKit } from "@/types/savedKit";

const derive = (full: TripFull) => deriveTripPacking(full, ORGANIZER.id, [], {});
function replace(full: TripFull, index: number, outfit: SavedKit | null) { full.kits[index].outfit = outfit; }

describe("accepted kits to personal packing", () => {
  it("deduplicates a jacket across three days, retains the garment ID and source purposes", () => {
    const result = derive(packingTrip());
    const shell = result.filter(item => item.name === "Ski shell");
    expect(shell).toHaveLength(1);
    expect(shell[0]).toMatchObject({ id: '["owned","g-3"]', quantity: 1, kind: "owned" });
    expect(shell[0].uses.map(u => [u.date, u.purpose])).toEqual([["2026-10-10", "wear"], ["2026-10-11", "wear"], ["2026-10-12", "wear"]]);
    expect(result.find(item => item.name === "Fleece")?.kind).toBe("suggestion");
  });
  it("reviews a swap and removal without changing the saved list", () => {
    const full = packingTrip();
    const snapshot = { ...emptyPacking, revision: 1, requirements: derive(full) };
    const next = savedOutfit();
    next.phases[0].wear = structuredClone(next.phases[0].wear);
    next.phases[0].wear.torso.outer = [{ name: "New shell", sourceId: "new-shell" }];
    full.kits.forEach((_, i) => replace(full, i, next));
    const review = packingReview(full, ORGANIZER.id, snapshot);
    expect(review.changes.added.map(i => i.name)).toEqual(["New shell"]);
    expect(review.changes.removed.map(i => i.name)).toEqual(["Ski shell"]);
    expect(review.requirements.find(i => i.name === "Ski shell")).toBeDefined();
  });
  it("preserves personal manual additions, quantity choices and separate member kits", () => {
    const full = packingTrip();
    full.kits.push({ ...full.kits[0], id: "other-kit", trip_member_id: "other", outfit: savedOutfit({ phases: [{ id: "outing", wear: { ...savedOutfit().phases[0].wear, torso: { base: [], outer: [{ name: "Other person's jacket", sourceId: "other" }] } }, carry: [], decision: null }] }) });
    const result = deriveTripPacking(full, ORGANIZER.id, [{ id: "manual-1", name: "Spare socks", quantity: 3 }], { '["owned","g-3"]': 2 });
    expect(result.find(i => i.name === "Ski shell")?.quantity).toBe(2);
    expect(result.find(i => i.name === "Spare socks")).toMatchObject({ id: "manual:manual-1", quantity: 3, kind: "manual", uses: [] });
    expect(result.some(i => i.name === "Other person's jacket")).toBe(false);
  });
  it("includes every plan daypart and Carry, merging unambiguous phase clothing", () => {
    const full = packingTrip();
    const next = savedOutfit();
    next.phases = [next.phases[0], { ...next.phases[0], id: "descent", carry: ["Ski shell", "Water"] }];
    replace(full, 0, next);
    const day = planDay("2026-10-11");
    day.dayparts[1].recommendation = structuredClone(day.dayparts[1].recommendation!);
    day.dayparts[1].recommendation.torso.outer.push({ name: "Evening puffy", sourceId: "puffy" });
    replace(full, 1, { version: 1, kind: "plan_day", outing: savedPlan().outing, startHour: 6, endHour: 21, day });
    const result = derive(full);
    expect(result.find(i => i.name === "Ski shell")?.uses).toContainEqual(expect.objectContaining({ date: "2026-10-10", purpose: "carry", phase: "descent" }));
    expect(result.find(i => i.name === "Evening puffy")?.uses).toEqual([expect.objectContaining({ date: "2026-10-11", phase: "evening", purpose: "wear" })]);
    expect(result.find(i => i.name === "Water")?.kind).toBe("unresolved");
  });
  it("never invents garment identities for legacy checklists or name-only saved selections", () => {
    const full = packingTrip();
    full.kits = [{ ...full.kits[0], outfit: null, items: ["shell"] }];
    expect(derive(full)).toEqual([]);
    const outfit = savedOutfit();
    outfit.phases[0].wear = structuredClone(outfit.phases[0].wear);
    outfit.phases[0].wear.torso.outer = [{ name: "My jacket" }];
    replace(full, 0, outfit);
    expect(derive(full).find(i => i.name === "My jacket")).toMatchObject({ kind: "unresolved", id: '["unresolved","torso","outer","my jacket"]' });
  });
  it("reviews quantity and source-day changes and keeps tokens stable across JSON key ordering", () => {
    const full = packingTrip();
    const initial = packingReview(full, ORGANIZER.id, emptyPacking);
    const snapshot = { ...emptyPacking, requirements: initial.proposed, quantities: { '["owned","g-3"]': 4 } };
    const changed = packingReview(full, ORGANIZER.id, snapshot);
    expect(changed.changes.changed.find(c => c.after.name === "Ski shell")?.after.quantity).toBe(4);
    full.kits[0] = Object.fromEntries(Object.entries(full.kits[0]).reverse()) as unknown as TripMemberDayKit;
    expect(packingReview(full, ORGANIZER.id, emptyPacking).source_revision).toBe(initial.source_revision);
    full.kits.splice(0, 1);
    expect(packingReview(full, ORGANIZER.id, snapshot).changes.changed[0].after.uses).toHaveLength(2);
  });
  it.each([0, 101, 1.5, "2"])("refuses invalid quantity %s", quantity => {
    expect(readPackingEdits({ manual_items: [], quantities: { shell: quantity } })).toBeNull();
  });
});
