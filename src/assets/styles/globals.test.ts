import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the color tokens in globals.css: both appearances define the same
// tokens, the two copies of the dark palette match, and the pairs the
// components rely on meet WCAG AA (4.5:1 for text, 3:1 for control outlines,
// focus rings and selection marks).

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No block for ${selector}`);
  const end = css.indexOf("}", start);
  const tokens: Record<string, string> = {};
  for (const match of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

const light = block(':root,\n[data-appearance="light"]');
const dark = block('[data-appearance="dark"]');
const systemDark = block(':root:not([data-appearance="light"])');

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// A translucent fill, such as hover:bg-primary/90, composited over a surface.
function over(fill: string, surface: string, alpha: number) {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const mixed = [1, 3, 5].map((i) =>
    Math.round(alpha * channel(fill, i) + (1 - alpha) * channel(surface, i))
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const SURFACES = ["background", "card", "popover", "muted", "accent", "primary-soft"];

// Text needs 4.5:1. Control outlines, focus rings and the primary selection mark
// on overlays are non-text and need 3:1.
const PAIRS: { fg: string; on: string[]; min: number }[] = [
  { fg: "foreground", on: SURFACES, min: 4.5 },
  { fg: "muted-foreground", on: SURFACES, min: 4.5 },
  { fg: "card-foreground", on: ["card"], min: 4.5 },
  { fg: "popover-foreground", on: ["popover"], min: 4.5 },
  { fg: "secondary-foreground", on: ["secondary"], min: 4.5 },
  { fg: "accent-foreground", on: ["accent"], min: 4.5 },
  { fg: "primary-foreground", on: ["primary"], min: 4.5 },
  { fg: "primary", on: ["background", "card", "muted", "primary-soft"], min: 4.5 },
  { fg: "destructive-foreground", on: ["destructive"], min: 4.5 },
  { fg: "destructive", on: ["background", "card", "popover", "destructive-soft"], min: 4.5 },
  { fg: "success", on: ["background", "card", "popover", "success-soft"], min: 4.5 },
  { fg: "warning", on: ["background", "card", "popover", "warning-soft"], min: 4.5 },
  { fg: "sidebar-foreground", on: ["sidebar", "sidebar-accent"], min: 4.5 },
  { fg: "sidebar-accent-foreground", on: ["sidebar-accent"], min: 4.5 },
  { fg: "input", on: ["background", "card", "muted", "accent"], min: 3 },
  { fg: "ring", on: ["background", "card", "popover", "muted", "accent"], min: 3 },
  { fg: "primary", on: ["popover", "accent"], min: 3 },
];

describe("design tokens", () => {
  it("keeps the system and pinned dark palettes identical", () => {
    expect(systemDark).toEqual(dark);
  });

  it("defines the same tokens in light and dark", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  describe.each([
    ["light", light],
    ["dark", dark],
  ])("%s palette", (_name, tokens) => {
    it.each(PAIRS)("$fg on $on", ({ fg, on, min }) => {
      for (const bg of on) {
        const ratio = contrast(tokens[fg], tokens[bg]);
        expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
      }
    });

    // Button hover fills are 90% opaque, so their text is checked on the fill
    // composited over each surface a button sits on.
    it.each([
      ["primary-foreground", "primary"],
      ["destructive-foreground", "destructive"],
    ])("%s on %s/90 hover", (fg, fill) => {
      for (const surface of ["background", "card", "popover"]) {
        const ratio = contrast(tokens[fg], over(tokens[fill], tokens[surface], 0.9));
        expect(ratio, `${fg} on ${fill}/90 over ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
