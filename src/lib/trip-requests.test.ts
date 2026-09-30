import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeTripApi, reply } from "@/test/tripApi";
import { tripRequest } from "./trip-requests";

describe("tripRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the body as JSON and returns the response", async () => {
    const fetchMock = fakeTripApi({
      "POST /api/v1/trips/trip-1/gear": reply(201, { gear: { id: "gear-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      tripRequest("/api/v1/trips/trip-1/gear", "POST", { description: "Tent" })
    ).resolves.toEqual({ gear: { id: "gear-1" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/trips/trip-1/gear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Tent" }),
    });
  });

  it("sends no body when there isn't one", async () => {
    const fetchMock = fakeTripApi({ "DELETE /api/v1/trips/trip-1/gear/gear-1": reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await tripRequest("/api/v1/trips/trip-1/gear/gear-1", "DELETE");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/trips/trip-1/gear/gear-1", { method: "DELETE" });
  });

  it("fails with the route's reason when the request is refused", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({ "PATCH /api/v1/trips/trip-1": reply(403, { error: "Organizer only" }) })
    );

    await expect(tripRequest("/api/v1/trips/trip-1", "PATCH", { name: "Stowe" })).rejects.toThrow(
      "Organizer only"
    );
  });

  it("fails with the status when the error page isn't JSON", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "POST /api/v1/trips": reply(401) }));

    await expect(tripRequest("/api/v1/trips", "POST", { name: "Stowe" })).rejects.toThrow(
      "Request failed (401)"
    );
  });

  it("fails with a connection hint when the request can't be sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(tripRequest("/api/v1/trips/trip-1")).rejects.toThrow(
      "Check your connection and try again."
    );
  });
});
