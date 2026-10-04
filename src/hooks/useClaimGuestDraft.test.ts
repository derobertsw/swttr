import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { readGearUpDraft, saveGearUpDraft, type GearUpDraft } from "@/lib/gearUpDraft";
import { useClaimGuestDraft } from "./useClaimGuestDraft";

let mockUserId: string | null = null;
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => mockUserId }));

const STOWE = { id: 1, name: "Stowe", country: "United States", latitude: 44.47, longitude: -72.69 };
const GUEST_OUTING: GearUpDraft = {
  activity: "running",
  exertion: "moderate",
  place: STOWE,
  inputMode: "now",
  date: null,
  time: "12:00",
  durationDays: 1,
  lastOuting: { activity: "running", exertion: "moderate", place: STOWE, when: { mode: "now" } },
};

describe("useClaimGuestDraft", () => {
  afterEach(() => {
    sessionStorage.clear();
    mockUserId = null;
  });

  it("gives a guest's outing to the account that signs in on any page, so the next account can't read it", () => {
    saveGearUpDraft(null, GUEST_OUTING);
    const { rerender } = renderHook(() => useClaimGuestDraft());
    expect(readGearUpDraft(null)).toEqual(GUEST_OUTING);

    mockUserId = "user_a";
    rerender();
    mockUserId = null;
    rerender();
    mockUserId = "user_b";
    rerender();

    expect(readGearUpDraft("user_a")).toEqual(GUEST_OUTING);
    expect(readGearUpDraft("user_b")).toBeNull();
    expect(readGearUpDraft(null)).toBeNull();
  });
});
