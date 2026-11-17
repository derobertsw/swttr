import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSavedBriefs, countSavedBriefs, fetchOfflineBrief, readOfflineBrief, readSavedBrief, readSavedBriefs,
  reconcileSavedBriefs, removeSavedBrief, savedBriefsAccountHint, storeSavedBrief,
} from "@/lib/offline-briefs";
import { fakeTripApi, reply } from "@/test/tripApi";
import { briefResponse, offlineBrief, resetDeviceStorage } from "@/test/offlineBrief";

const forOther = (tripId: string) => offlineBrief({
  trip: { ...offlineBrief().trip, id: tripId, name: "Other trip" }, viewer: { user_id: "user_2", member_id: "m-2" },
});

describe("Trip briefs saved on this device (#214)", () => {
  beforeEach(resetDeviceStorage);
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a brief for the account that saved it, and reads it back whole", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    expect(savedBriefsAccountHint()).toBe("user_1");
    const saved = await readSavedBrief("trip-1", "user_1");
    expect(saved?.brief).toEqual(offlineBrief());
    expect(await readSavedBrief("trip-1", "user_2")).toBeNull();
    expect(await countSavedBriefs("user_1")).toBe(1);
  });

  it("replaces the trip's copy only with a whole brief, so a bad download keeps the last good one", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    const truncated = { ...offlineBrief({ revision: "rev-2" }), days: [offlineBrief().days[0]] };
    await expect(storeSavedBrief("user_1", truncated)).rejects.toThrow("Nothing was saved");
    expect((await readSavedBrief("trip-1", "user_1"))?.brief.revision).toBe("rev-1");
  });

  it("won't keep a brief built for another account than the one saving it", async () => {
    await expect(storeSavedBrief("user_2", offlineBrief())).rejects.toThrow("isn't for the account that's signed in");
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  it("holds one account's briefs: another account saving drops the first account's, in the same write", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    await storeSavedBrief("user_2", forOther("trip-2"));
    const device = await readSavedBriefs();
    expect(device.account).toBe("user_2");
    expect(device.briefs.map((saved) => saved.trip_id)).toEqual(["trip-2"]);
  });

  it("lists a stored copy that no longer reads as a brief as damaged instead of showing it", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("swttr-offline", 1);
      open.onsuccess = () => {
        const tx = open.result.transaction("briefs", "readwrite");
        tx.objectStore("briefs").put({ trip_id: "trip-9", account_id: "user_1", stored_at: "x", brief: { version: 2 } });
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    const device = await readSavedBriefs();
    expect(device.briefs.map((saved) => saved.trip_id)).toEqual(["trip-1"]);
    expect(device.damaged).toEqual(["trip-9"]);
  });

  it("removes one trip's copy, and forgets the account once none are left", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    await storeSavedBrief("user_1", offlineBrief({ trip: { ...offlineBrief().trip, id: "trip-2" } }));
    await removeSavedBrief("trip-1");
    expect((await readSavedBriefs()).briefs.map((saved) => saved.trip_id)).toEqual(["trip-2"]);
    expect(savedBriefsAccountHint()).toBe("user_1");
    await removeSavedBrief("trip-2");
    expect(await readSavedBriefs()).toEqual({ account: null, briefs: [], damaged: [] });
    expect(savedBriefsAccountHint()).toBeNull();
  });

  it("clears every copy on this device", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    await clearSavedBriefs();
    expect((await readSavedBriefs()).briefs).toEqual([]);
    expect(savedBriefsAccountHint()).toBeNull();
  });

  describe("after an account change or sign-out", () => {
    it("clears another account's copies at once", async () => {
      await storeSavedBrief("user_1", offlineBrief());
      expect(await reconcileSavedBriefs("user_2", "user_1")).toBe(true);
      expect((await readSavedBriefs()).briefs).toEqual([]);
    });

    it("clears them when nobody is signed in only once the server agrees", async () => {
      await storeSavedBrief("user_1", offlineBrief());
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
      expect(await reconcileSavedBriefs(null, "user_1")).toBe(false);
      vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips": reply(200, { trips: [] }) }));
      expect(await reconcileSavedBriefs(null, "user_1")).toBe(false);
      expect((await readSavedBriefs()).briefs).toHaveLength(1);
      vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips": reply(401, { error: "Authentication required" }) }));
      expect(await reconcileSavedBriefs(null, "user_1")).toBe(true);
      expect((await readSavedBriefs()).briefs).toEqual([]);
    });

    it("leaves the signed-in account's own copies alone", async () => {
      await storeSavedBrief("user_1", offlineBrief());
      expect(await reconcileSavedBriefs("user_1", "user_1")).toBe(false);
      expect((await readSavedBriefs()).briefs).toHaveLength(1);
    });
  });
});

describe("Downloading a brief", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the server for the chosen days, never a cache", async () => {
    const fetchMock = fakeTripApi({ "GET /api/v1/trips/trip-1/brief": reply(200, briefResponse()) });
    vi.stubGlobal("fetch", fetchMock);
    const { brief } = await fetchOfflineBrief("trip-1", ["2027-02-13", "2027-02-14"]);
    expect(brief.revision).toBe("rev-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/trips/trip-1/brief?dates=2027-02-13,2027-02-14", expect.objectContaining({ cache: "no-store" }));
  });

  it("refuses a brief that didn't arrive whole", async () => {
    const partial = { ...briefResponse(), brief: { ...offlineBrief(), days: undefined } };
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1/brief": reply(200, partial) }));
    await expect(fetchOfflineBrief("trip-1")).rejects.toThrow("The trip didn't download completely.");
    expect(readOfflineBrief({ ...offlineBrief(), version: 2 })).toBeNull();
  });

  it("passes on the server's reason, and says when the connection failed", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1/brief": reply(404, { error: "Not found" }) }));
    await expect(fetchOfflineBrief("trip-1")).rejects.toMatchObject({ status: 404, message: "Not found" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(fetchOfflineBrief("trip-1")).rejects.toThrow("Check your connection and try again.");
  });
});
