import { describe, expect, it } from "vitest";
import { detectNativeShell } from "./native-shell";

describe("detectNativeShell", () => {
  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15", null],
    ["Mozilla/5.0 (iPhone) AppleWebKit/605.1.15", null],
    ["Mozilla/5.0 SWTTRNativeTabs", "ios"],
    ["Mozilla/5.0 SWTTRNativeMac/1", "mac"],
    ["SWTTRNativeMac/1", "mac"],
    ["Mozilla/5.0 SWTTRNativeMac/1 Safari/605.1.15", "mac"],
    ["SWTTRNativeTabs SWTTRNativeMac/1", "mac"],
    ["SWTTRNativeMac/1 SWTTRNativeTabs", "mac"],
    ["SWTTRNativeMac/10", null],
    ["SWTTRNativeMac/2", null],
    ["OtherSWTTRNativeMac/1", null],
  ] as const)("detects %s as %s", (userAgent, expected) => {
    expect(detectNativeShell(userAgent)).toBe(expected);
  });
});
