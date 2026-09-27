import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatZonedIsoTime,
  formatZonedTime,
  isLocalDateTime,
  isTimeZone,
  zonedTimeToInstant,
} from "./timeZones";

const at = (iso: string) => Date.parse(iso);

describe("isTimeZone", () => {
  it("accepts time zone names Intl knows", () => {
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
  });

  it("rejects anything else, including a missing zone Intl would read as the machine's", () => {
    for (const value of [undefined, null, 42, "", "Mars/Olympus"]) {
      expect(isTimeZone(value)).toBe(false);
    }
  });
});

describe("isLocalDateTime", () => {
  it("accepts a real date and time", () => {
    expect(isLocalDateTime("2026-10-15T14:00")).toBe(true);
    expect(isLocalDateTime("2028-02-29T23:59")).toBe(true);
  });

  it("rejects other formats and impossible values", () => {
    for (const value of ["2026-10-15", "2026-10-15T14:00:00", "2026-10-15T14:00Z", "2026-02-30T10:00", "2026-02-29T10:00", "2026-10-15T24:00", "soon"]) {
      expect(isLocalDateTime(value)).toBe(false);
    }
  });
});

describe("zonedTimeToInstant", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the time on the place's clock", () => {
    expect(zonedTimeToInstant("2026-10-15T14:00", "America/New_York")).toBe(at("2026-10-15T18:00Z"));
    expect(zonedTimeToInstant("2026-10-15T14:00", "Asia/Kolkata")).toBe(at("2026-10-15T08:30Z"));
  });

  it("doesn't depend on the time zone of the device or server", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    expect(zonedTimeToInstant("2026-10-15T14:00", "America/New_York")).toBe(at("2026-10-15T18:00Z"));
    vi.stubEnv("TZ", "Pacific/Honolulu");
    expect(zonedTimeToInstant("2026-10-15T14:00", "America/New_York")).toBe(at("2026-10-15T18:00Z"));
  });

  it("uses the new offset after clocks go forward", () => {
    // Sydney moves from UTC+10 to UTC+11 at 2:00 on October 4, 2026.
    expect(zonedTimeToInstant("2026-10-04T01:00", "Australia/Sydney")).toBe(at("2026-10-03T15:00Z"));
    expect(zonedTimeToInstant("2026-10-04T14:00", "Australia/Sydney")).toBe(at("2026-10-04T03:00Z"));
  });

  it("moves a time the clocks skip past the jump", () => {
    expect(zonedTimeToInstant("2026-10-04T02:30", "Australia/Sydney")).toBe(at("2026-10-03T16:30Z"));
    expect(formatZonedTime(at("2026-10-03T16:30Z"), "Australia/Sydney")).toBe("2026-10-04T03:30");
    // New York skips 2:00-3:00 on March 8, 2026.
    expect(zonedTimeToInstant("2026-03-08T02:30", "America/New_York")).toBe(at("2026-03-08T07:30Z"));
  });

  it("takes the first of a time the clocks repeat", () => {
    // New York repeats 1:00-2:00 on November 1, 2026, first at UTC-4, then at UTC-5.
    expect(zonedTimeToInstant("2026-11-01T01:30", "America/New_York")).toBe(at("2026-11-01T05:30Z"));
    expect(zonedTimeToInstant("2026-11-01T03:00", "America/New_York")).toBe(at("2026-11-01T08:00Z"));
    // Sydney repeats 2:00-3:00 on April 5, 2026, east of Greenwich.
    expect(zonedTimeToInstant("2026-04-05T02:30", "Australia/Sydney")).toBe(at("2026-04-04T15:30Z"));
  });
});

describe("formatZonedTime and formatZonedIsoTime", () => {
  it("show an instant on the place's clock", () => {
    expect(formatZonedTime(at("2026-10-15T18:00Z"), "America/New_York")).toBe("2026-10-15T14:00");
    expect(formatZonedIsoTime(at("2026-10-15T18:00Z"), "America/New_York")).toBe("2026-10-15T14:00-04:00");
    expect(formatZonedIsoTime(at("2026-12-15T19:00Z"), "America/New_York")).toBe("2026-12-15T14:00-05:00");
    expect(formatZonedIsoTime(at("2026-10-15T08:30Z"), "Asia/Kolkata")).toBe("2026-10-15T14:00+05:30");
    expect(formatZonedIsoTime(at("2026-10-15T14:00Z"), "UTC")).toBe("2026-10-15T14:00+00:00");
  });

  it("show both readings of a repeated hour with their own offsets", () => {
    expect(formatZonedIsoTime(at("2026-11-01T05:30Z"), "America/New_York")).toBe("2026-11-01T01:30-04:00");
    expect(formatZonedIsoTime(at("2026-11-01T06:30Z"), "America/New_York")).toBe("2026-11-01T01:30-05:00");
  });
});
