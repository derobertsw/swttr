import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readGearUpDraft, saveGearUpDraft, type GearUpDraft } from "./gearUpDraft";
import { STORAGE_KEYS } from "./storage";

const STOWE = { id: 1, name: "Stowe", region: "Vermont", country: "United States", latitude: 44.47, longitude: -72.69 };
const DRAFT: GearUpDraft = {
  activity: "xc_skiing",
  exertion: "hard",
  place: STOWE,
  inputMode: "later",
  date: "2026-10-08",
  time: "07:30",
  durationDays: 3,
  lastOuting: {
    activity: "xc_skiing",
    exertion: "hard",
    place: STOWE,
    when: { mode: "later", date: "2026-10-08", time: "07:30", durationDays: 3 },
  },
};

const store = (value: unknown) => sessionStorage.setItem(STORAGE_KEYS.GEAR_UP_DRAFT, JSON.stringify(value));

describe("gearUpDraft", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("reads back what was saved", () => {
    saveGearUpDraft(DRAFT);
    expect(readGearUpDraft()).toEqual(DRAFT);

    const empty = { ...DRAFT, place: null, inputMode: "now", date: null, lastOuting: null } as const;
    saveGearUpDraft(empty);
    expect(readGearUpDraft()).toEqual(empty);
  });

  it("has nothing when nothing was saved, or what was saved can't be read", () => {
    expect(readGearUpDraft()).toBeNull();
    sessionStorage.setItem(STORAGE_KEYS.GEAR_UP_DRAFT, "{not json");
    expect(readGearUpDraft()).toBeNull();
  });

  it.each([
    ["an unknown activity", { ...DRAFT, activity: "parasailing" }],
    ["an unknown effort", { ...DRAFT, exertion: "extreme" }],
    ["a place without coordinates", { ...DRAFT, place: { name: "Stowe", country: "United States" } }],
    ["a malformed date", { ...DRAFT, date: "Oct 8" }],
    ["a malformed time", { ...DRAFT, time: "7:30am" }],
    ["too many days", { ...DRAFT, durationDays: 8 }],
    ["a malformed last outing", { ...DRAFT, lastOuting: { ...DRAFT.lastOuting, when: { mode: "later" } } }],
  ])("ignores a draft with %s", (_, draft) => {
    store(draft);
    expect(readGearUpDraft()).toBeNull();
  });

  it("does without storage when the browser won't allow it", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });

    expect(() => saveGearUpDraft(DRAFT)).not.toThrow();
    expect(readGearUpDraft()).toBeNull();
  });
});
