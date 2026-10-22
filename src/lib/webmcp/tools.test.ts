import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { gearUpTools } from "./tools";
import type { CurrentOutingSnapshot } from "@/types/outingAction";
const place = { id: 1, name: "Stowe", region: "Vermont", country: "United States", latitude: 44.47, longitude: -72.69, timeZone: "America/New_York" };
const snapshot: CurrentOutingSnapshot = { status: "empty", pending: null, request: { status: "idle" }, displayed: null, limitations: [] };
const input = { activity: "running", exertion: "easy", place, when: { mode: "later", date: "2026-10-22", time: "09:00", durationDays: 1 } };
const submitOuting = vi.fn(async () => ({ status: "completed" as const, snapshot }));
const getCurrentOuting = vi.fn(() => snapshot);
const fetchMock = vi.fn();
const execute = (name: string, input: unknown, signal = new AbortController().signal, signedIn = true) =>
  gearUpTools({ signedIn, submitOuting, getCurrentOuting }).find(t => t.name === `swttr_${name}`)!.execute(input as Record<string, unknown>, { signal });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("Gear up WebMCP contract", () => {
  it("exposes exactly four bounded tools and marks only read/search tools read-only", () => {
    const tools = gearUpTools({ signedIn: true, submitOuting, getCurrentOuting });
    expect(tools).toHaveLength(4);
    tools.forEach(t => expect(t.inputSchema).toMatchObject({ type: "object", additionalProperties: false }));
    expect(tools.filter(t => t.annotations?.readOnlyHint).map(t => t.name)).toEqual(["swttr_get_capabilities", "swttr_search_locations", "swttr_get_current_outing"]);
  });
  it.each([true, false])("reports all six activity engines for signedIn=%s without claiming hiking biophysics", async signedIn => {
    const result = await execute("get_capabilities", {}, undefined, signedIn) as { activities: { id: string; engine: string }[] };
    expect(result.activities).toHaveLength(6);
    for (const activity of result.activities) {
      const expected = activity.id === "hiking_snowshoeing" ? "static" : signedIn ? "biophysics" : ["alpine_skiing", "xc_skiing"].includes(activity.id) ? "static" : "none";
      expect(activity.engine).toBe(expected);
    }
  });
  it("returns separate candidates, bounded to five, including empty searches", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: Array.from({ length: 8 }, (_, id) => ({ ...place, id })) }));
    expect(await execute("search_locations", { query: " Stowe " })).toMatchObject({ selectionRequired: true, candidates: Array.from({ length: 5 }, (_, id) => ({ ...place, id })) });
    expect(fetchMock).toHaveBeenCalledWith("/api/geocode?q=Stowe", { signal: expect.any(AbortSignal) });
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] }));
    expect(await execute("search_locations", { query: "unknown" })).toMatchObject({ candidates: [] });
    expect(submitOuting).not.toHaveBeenCalled();
  });
  it.each([null, {}, { results: [place, { ...place, latitude: NaN }] }, { results: [{ ...place, token: "private" }] }])("rejects malformed search responses: %j", async body => {
    fetchMock.mockResolvedValueOnce(Response.json(body));
    expect(await execute("search_locations", { query: "Stowe" })).toMatchObject({ code: "location_unavailable" });
  });
  it("handles HTTP, parse and network failures without returning raw errors", async () => {
    for (const response of [Response.json({ results: [place] }, { status: 500 }), new Response("<html>unavailable</html>")]) {
      fetchMock.mockResolvedValueOnce(response);
      expect(await execute("search_locations", { query: "Stowe" })).toMatchObject({ code: "location_unavailable" });
    }
    fetchMock.mockRejectedValueOnce(new Error("private internal token"));
    expect(await execute("search_locations", { query: "Stowe" })).toMatchObject({ code: "location_unavailable" });
  });
  it("forwards invocation cancellation and refuses late search data", async () => {
    const held = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(held.promise);
    const controller = new AbortController();
    const pending = execute("search_locations", { query: "Stowe" }, controller.signal);
    controller.abort();
    held.resolve(Response.json({ results: [place] }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(() => execute("get_current_outing", {}, controller.signal)).toThrow();
  });
  it("validates unknown fields, coordinate limits, dates, effort and scope at invocation", async () => {
    const bad = [
      { ...input, surprise: true }, { ...input, activity: "ski" }, { ...input, exertion: "maximum" },
      { ...input, place: { ...place, longitude: 181 } }, { ...input, place: { ...place, latitude: Infinity } },
      { ...input, place: { ...place, timeZone: "bad-zone" } }, { ...input, place: { ...place, name: "x".repeat(201) } },
      { ...input, when: { ...input.when, date: "2026-02-30" } }, { ...input, when: { ...input.when, time: "24:00" } },
      { ...input, when: { ...input.when, durationDays: 7 } }, { ...input, when: { mode: "now", date: "2026-10-22" } },
    ];
    for (const value of bad) expect(await execute("recommend_outing", value)).toMatchObject({ code: "invalid_input" });
    for (const value of [null, [], { unknown: true }]) {
      expect(await execute("get_current_outing", value)).toMatchObject({ code: "invalid_input" });
      expect(await execute("get_capabilities", value)).toMatchObject({ code: "invalid_input" });
    }
    for (const query of [" ", "x", "x".repeat(201), 42]) expect(await execute("search_locations", { query })).toMatchObject({ code: "invalid_input" });
    expect(await execute("search_locations", { query: "Stowe", unknown: true })).toMatchObject({ code: "invalid_input" });
    expect(submitOuting).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("delegates valid Now/Later inputs and readback to the shared controller with the same signal", async () => {
    const signal = new AbortController().signal;
    expect(await execute("recommend_outing", input, signal)).toEqual({ status: "completed", snapshot });
    expect(submitOuting).toHaveBeenLastCalledWith(input, { signal });
    const now = { ...input, when: { mode: "now" } };
    await execute("recommend_outing", now, signal);
    expect(submitOuting).toHaveBeenLastCalledWith(now, { signal });
    expect(await execute("get_current_outing", {})).toEqual({ status: "completed", snapshot });
  });
});
