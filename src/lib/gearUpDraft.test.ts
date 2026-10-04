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
    saveGearUpDraft(null, DRAFT);
    expect(readGearUpDraft(null)).toEqual(DRAFT);

    const empty = { ...DRAFT, place: null, inputMode: "now", date: null, lastOuting: null } as const;
    saveGearUpDraft(null, empty);
    expect(readGearUpDraft(null)).toEqual(empty);
  });

  it("has nothing when nothing was saved, or what was saved can't be read", () => {
    expect(readGearUpDraft(null)).toBeNull();
    sessionStorage.setItem(STORAGE_KEYS.GEAR_UP_DRAFT, "{not json");
    expect(readGearUpDraft(null)).toBeNull();
    // How a draft was kept before each account had its own.
    store(DRAFT);
    expect(readGearUpDraft(null)).toBeNull();
  });

  it("keeps each account's draft from every other account, and from guests", () => {
    saveGearUpDraft("user_a", DRAFT);

    expect(readGearUpDraft("user_a")).toEqual(DRAFT);
    expect(readGearUpDraft("user_b")).toBeNull();
    expect(readGearUpDraft(null)).toBeNull();
  });

  it("carries a guest's outing into the account they sign in to, ahead of its own draft", () => {
    const own = { ...DRAFT, activity: "running" };
    saveGearUpDraft("user_a", own);
    saveGearUpDraft(null, DRAFT);

    expect(readGearUpDraft("user_a")).toEqual(DRAFT);
    saveGearUpDraft("user_a", DRAFT);
    // The account has taken it over, so the next guest in the tab starts afresh.
    expect(readGearUpDraft(null)).toBeNull();
  });

  it("keeps an account's own draft over a guest's that has no place or result", () => {
    const own = { ...DRAFT, activity: "running" };
    saveGearUpDraft("user_a", own);
    // After signing out, the page starts over as a guest.
    saveGearUpDraft(null, { ...DRAFT, place: null, lastOuting: null });

    expect(readGearUpDraft("user_a")).toEqual(own);
    expect(readGearUpDraft("user_b")).toEqual({ ...DRAFT, place: null, lastOuting: null });
  });

  it.each([
    ["an unknown activity", { ...DRAFT, activity: "parasailing" }],
    ["an unknown effort", { ...DRAFT, exertion: "extreme" }],
    ["a place without coordinates", { ...DRAFT, place: { name: "Stowe", country: "United States" } }],
    ["a malformed date", { ...DRAFT, date: "Oct 8" }],
    ["a date that isn't on the calendar", { ...DRAFT, date: "2026-02-31" }],
    ["a malformed time", { ...DRAFT, time: "7:30am" }],
    ["a time that isn't on the clock", { ...DRAFT, time: "25:99" }],
    [
      "a last outing on a date that isn't on the calendar",
      { ...DRAFT, lastOuting: { ...DRAFT.lastOuting, when: { ...DRAFT.lastOuting!.when, date: "2026-99-99" } } },
    ],
    ["too many days", { ...DRAFT, durationDays: 8 }],
    ["a malformed last outing", { ...DRAFT, lastOuting: { ...DRAFT.lastOuting, when: { mode: "later" } } }],
  ])("ignores a draft with %s", (_, draft) => {
    store({ guest: draft });
    expect(readGearUpDraft(null)).toBeNull();
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

    expect(() => saveGearUpDraft(null, DRAFT)).not.toThrow();
    expect(readGearUpDraft(null)).toBeNull();
  });
});
