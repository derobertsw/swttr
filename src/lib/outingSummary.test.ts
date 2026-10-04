import { describe, expect, it } from "vitest";
import type { Outing } from "@/types/outing";
import { outingSummary } from "./outingSummary";

const STOWE = { id: 1, name: "Stowe", region: "Vermont", country: "United States", latitude: 44.47, longitude: -72.69 };
const outing = (when: Outing["when"]): Outing => ({ activity: "xc_skiing", exertion: "moderate", place: STOWE, when });

describe("outingSummary", () => {
  it("names the activity, the place and when", () => {
    expect(outingSummary(outing({ mode: "now" }))).toBe("XC Skiing at Stowe, now");
    expect(outingSummary(outing({ mode: "later", date: "2026-10-10", time: "07:30", durationDays: 1 }))).toBe(
      "XC Skiing at Stowe, Sat, Oct 10 at 7:30 AM"
    );
    expect(outingSummary(outing({ mode: "later", date: "2026-10-10", time: "07:30", durationDays: 3 }))).toBe(
      "XC Skiing at Stowe, 3 days from Sat, Oct 10"
    );
  });
});
