import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/lib/storage";
import { DEFAULT_BODY_METRICS } from "@/lib/biophysics/bodyMetrics";
import { DEFAULT_ACTIVITY } from "@/data/activities";

let userId: string | null = null;
let authLoaded = true;
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId, isLoaded: authLoaded }) }));

const GUEST_KEY = `${STORAGE_KEYS.PREFERENCES}:guest`;
const keyFor = (id: string) => `${STORAGE_KEYS.PREFERENCES}:user:${id}`;
const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null");

/** What GET /api/preferences returns for each signed-in account; {} when it has no row. */
let serverPreferences: Record<string, Record<string, unknown>> = {};
let getOk = true;
/** While set, GET /api/preferences waits for it, as a slow request would. */
let getGate: Promise<void> | null = null;
let putFails = false;
let puts: { userId: string | null; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  // The store is shared by every caller in a page, so each test gets a fresh page.
  vi.resetModules();
  userId = null;
  authLoaded = true;
  serverPreferences = {};
  getOk = true;
  getGate = null;
  putFails = false;
  puts = [];
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        if (putFails) throw new TypeError("Failed to fetch");
        puts.push({ userId, body: JSON.parse(String(init.body)) });
        return new Response("{}");
      }
      const requestedFor = userId;
      if (getGate) await getGate;
      if (!getOk) return new Response("{}", { status: 500 });
      if (requestedFor !== userId) throw new Error("signed-in account changed during the request");
      return new Response(JSON.stringify(userId ? (serverPreferences[userId] ?? {}) : {}));
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function renderPreferences() {
  const { usePreferences } = await import("./usePreferences");
  return renderHook(() => usePreferences());
}

describe("usePreferences", () => {
  it("waits to know who's signed in before reading or saving anyone's preferences", async () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ sensitivity: "cold", heightInches: 62 }));
    authLoaded = false;
    const { result, rerender } = await renderPreferences();

    expect(result.current.loading).toBe(true);
    expect(result.current.sensitivity).toBe("neutral");
    expect(result.current.bodyMetricsSelection).toEqual({});
    await expect(result.current.updateSensitivity("hot")).rejects.toThrow("not ready");
    expect(stored(GUEST_KEY)).toEqual({ sensitivity: "cold", heightInches: 62 });

    authLoaded = true;
    rerender();
    expect(result.current.loading).toBe(false);
    expect(result.current.sensitivity).toBe("cold");
    expect(result.current.bodyMetricsSelection).toEqual({ heightInches: 62 });
  });

  it("keeps a guest's choices in the guest's copy, without the server", async () => {
    const { result } = await renderPreferences();

    await act(() => result.current.updateBodyMetrics({ heightInches: 64 }));
    await act(() => result.current.updateBodyMetrics({ weightLbs: 140 }));
    await act(() => result.current.updateSensitivity("cold"));
    await act(() => result.current.updateDefaultActivity("running"));

    expect(stored(GUEST_KEY)).toEqual({
      heightInches: 64,
      weightLbs: 140,
      sensitivity: "cold",
      defaultActivity: "running",
    });
    expect(result.current.bodyMetrics).toEqual({ heightInches: 64, weightLbs: 140 });
    expect(result.current.hasStoredDefaultActivity).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("drops the old device-wide height and weight, and gives the guest its sensitivity and default activity", async () => {
    localStorage.setItem(STORAGE_KEYS.SENSITIVITY, "hot");
    localStorage.setItem(STORAGE_KEYS.DEFAULT_ACTIVITY, "xc_skiing");
    localStorage.setItem(STORAGE_KEYS.HEIGHT_INCHES, "75");
    localStorage.setItem(STORAGE_KEYS.WEIGHT_LBS, "210");
    const { result } = await renderPreferences();

    expect(result.current.sensitivity).toBe("hot");
    expect(result.current.defaultActivity).toBe("xc_skiing");
    expect(result.current.bodyMetricsSelection).toEqual({});
    expect(stored(GUEST_KEY)).toEqual({ sensitivity: "hot", defaultActivity: "xc_skiing" });
    for (const key of [
      STORAGE_KEYS.SENSITIVITY,
      STORAGE_KEYS.DEFAULT_ACTIVITY,
      STORAGE_KEYS.HEIGHT_INCHES,
      STORAGE_KEYS.WEIGHT_LBS,
    ]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it("never shows one account's body metrics to the guest after it, or sends them for the next account", async () => {
    serverPreferences = { account_a: { heightInches: 75, weightLbs: 210, temperatureSensitivity: "cold" } };
    userId = "account_a";
    const { result, rerender } = await renderPreferences();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bodyMetrics).toEqual({ heightInches: 75, weightLbs: 210 });

    userId = null;
    rerender();
    expect(result.current.bodyMetricsSelection).toEqual({});
    expect(result.current.bodyMetrics).toEqual(DEFAULT_BODY_METRICS);
    expect(result.current.sensitivity).toBe("neutral");

    userId = "account_b";
    rerender();
    // From the render where B signs in, and after B's server copy (nothing) is merged in.
    expect(result.current.bodyMetrics).toEqual(DEFAULT_BODY_METRICS);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bodyMetrics).toEqual(DEFAULT_BODY_METRICS);
    expect(localStorage.getItem(keyFor("account_b"))).toBeNull();
    expect(stored(keyFor("account_a"))).toEqual({ heightInches: 75, weightLbs: 210, sensitivity: "cold" });
  });

  it("switches straight from one account to another without carrying anything over", async () => {
    serverPreferences = { account_a: { heightInches: 75 } };
    userId = "account_a";
    const { result, rerender } = await renderPreferences();
    await waitFor(() => expect(result.current.loading).toBe(false));

    userId = "account_b";
    rerender();
    expect(result.current.bodyMetricsSelection).toEqual({});
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bodyMetricsSelection).toEqual({});
  });

  it("carries a guest's choices into the account that signs in with nothing saved, and saves them there", async () => {
    const { result, rerender } = await renderPreferences();
    await act(() => result.current.updateBodyMetrics({ heightInches: 64, weightLbs: 140 }));
    await act(() => result.current.updateSensitivity("cold"));

    userId = "account_new";
    rerender();
    // Not used for the account until it's known the server has nothing saved for it.
    expect(result.current.loading).toBe(true);
    expect(result.current.bodyMetricsSelection).toEqual({});
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bodyMetrics).toEqual({ heightInches: 64, weightLbs: 140 });
    expect(result.current.sensitivity).toBe("cold");
    expect(puts).toEqual([
      { userId: "account_new", body: { temperatureSensitivity: "cold", heightInches: 64, weightLbs: 140 } },
    ]);
    expect(stored(keyFor("account_new"))).toEqual({ heightInches: 64, weightLbs: 140, sensitivity: "cold" });
    expect(localStorage.getItem(GUEST_KEY)).toBeNull();

    // The guest's copy went to that account: neither the guest nor a later account gets it.
    userId = null;
    rerender();
    expect(result.current.bodyMetricsSelection).toEqual({});
    userId = "account_later";
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bodyMetricsSelection).toEqual({});
    expect(puts).toHaveLength(1);
  });

  it("keeps an account's saved preferences over a guest's, and drops the guest's copy", async () => {
    serverPreferences = { account_a: { heightInches: 72, temperatureSensitivity: "hot" } };
    localStorage.setItem(GUEST_KEY, JSON.stringify({ heightInches: 60, weightLbs: 120, sensitivity: "cold" }));
    userId = "account_a";
    const { result } = await renderPreferences();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bodyMetricsSelection).toEqual({ heightInches: 72 });
    expect(result.current.sensitivity).toBe("hot");
    expect(puts).toEqual([]);
    expect(localStorage.getItem(GUEST_KEY)).toBeNull();
  });

  it("keeps the guest's copy when the account's server preferences can't be read", async () => {
    getOk = false;
    localStorage.setItem(GUEST_KEY, JSON.stringify({ heightInches: 60 }));
    userId = "account_a";
    const { result } = await renderPreferences();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bodyMetricsSelection).toEqual({});
    expect(puts).toEqual([]);
    expect(stored(GUEST_KEY)).toEqual({ heightInches: 60 });
  });

  it("keeps a change made while an account's preferences load, and still takes the guest's others", async () => {
    let releaseGet = () => {};
    getGate = new Promise((resolve) => (releaseGet = resolve));
    localStorage.setItem(GUEST_KEY, JSON.stringify({ heightInches: 64, weightLbs: 140, sensitivity: "cold" }));
    userId = "account_new";
    const { result } = await renderPreferences();
    expect(result.current.loading).toBe(true);

    await act(() => result.current.updateSensitivity("hot"));
    await act(async () => releaseGet());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sensitivity).toBe("hot");
    expect(result.current.bodyMetricsSelection).toEqual({ heightInches: 64, weightLbs: 140 });
    expect(puts).toEqual([
      { userId: "account_new", body: { temperatureSensitivity: "hot" } },
      { userId: "account_new", body: { heightInches: 64, weightLbs: 140 } },
    ]);
    expect(localStorage.getItem(GUEST_KEY)).toBeNull();
  });

  it("keeps a change made while an account's preferences load over the server's older value", async () => {
    let releaseGet = () => {};
    getGate = new Promise((resolve) => (releaseGet = resolve));
    serverPreferences = { account_a: { temperatureSensitivity: "cold", heightInches: 72 } };
    userId = "account_a";
    const { result } = await renderPreferences();

    await act(() => result.current.updateSensitivity("hot"));
    await act(async () => releaseGet());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sensitivity).toBe("hot");
    expect(result.current.bodyMetricsSelection).toEqual({ heightInches: 72 });
    expect(puts).toEqual([{ userId: "account_a", body: { temperatureSensitivity: "hot" } }]);
  });

  it("saves the guest's values an account took again when the first save failed", async () => {
    putFails = true;
    localStorage.setItem(GUEST_KEY, JSON.stringify({ heightInches: 64, sensitivity: "cold" }));
    userId = "account_new";
    const firstPage = await renderPreferences();
    await waitFor(() => expect(firstPage.result.current.loading).toBe(false));
    expect(puts).toEqual([]);
    expect(stored(keyFor("account_new"))).toEqual({ heightInches: 64, sensitivity: "cold" });
    expect(localStorage.getItem(GUEST_KEY)).toBeNull();
    firstPage.unmount();

    putFails = false;
    vi.resetModules();
    const { result } = await renderPreferences();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bodyMetricsSelection).toEqual({ heightInches: 64 });
    expect(puts).toEqual([
      { userId: "account_new", body: { temperatureSensitivity: "cold", heightInches: 64 } },
    ]);
  });

  it("saves a signed-in change to that account's copy and the server only", async () => {
    serverPreferences = { account_a: { defaultActivity: "running" } };
    localStorage.setItem(keyFor("account_b"), JSON.stringify({ heightInches: 80 }));
    userId = "account_a";
    const { result } = await renderPreferences();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.updateBodyMetrics({ weightLbs: 155 }));

    expect(puts).toEqual([{ userId: "account_a", body: { weightLbs: 155 } }]);
    expect(stored(keyFor("account_a"))).toEqual({ defaultActivity: "running", weightLbs: 155 });
    expect(stored(keyFor("account_b"))).toEqual({ heightInches: 80 });
    expect(localStorage.getItem(GUEST_KEY)).toBeNull();
    expect(result.current.defaultActivity).toBe("running");
  });

  it("uses the defaults for anything unset", async () => {
    const { result } = await renderPreferences();
    expect(result.current).toMatchObject({
      sensitivity: "neutral",
      defaultActivity: DEFAULT_ACTIVITY,
      hasStoredDefaultActivity: false,
      bodyMetrics: DEFAULT_BODY_METRICS,
      loading: false,
    });
  });
});
