import { describe, expect, it } from "vitest";
import { toCssBackgroundImage } from "./media";

describe("toCssBackgroundImage", () => {
  it("returns undefined without a URL", () => {
    expect(toCssBackgroundImage(undefined)).toBeUndefined();
    expect(toCssBackgroundImage("")).toBeUndefined();
  });

  it("wraps a plain URL unchanged", () => {
    expect(toCssBackgroundImage("https://cdn.example.com/logo.png?w=64")).toBe(
      'url("https://cdn.example.com/logo.png?w=64")'
    );
  });

  it("escapes quotes and backslashes", () => {
    expect(toCssBackgroundImage('a"b\\c')).toBe('url("a\\"b\\\\c")');
  });

  it("keeps a trailing backslash from escaping the closing quote", () => {
    expect(toCssBackgroundImage('x\\"); color: red; --y: ("')).toBe(
      'url("x\\\\\\"); color: red; --y: (\\"")'
    );
  });

  it("hex-escapes newlines", () => {
    expect(toCssBackgroundImage("a\nb\rc\fd")).toBe('url("a\\a b\\d c\\c d")');
  });
});
