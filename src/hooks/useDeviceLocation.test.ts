import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { LOCATION_TIMEOUT_MS, locateDevice, useDeviceLocation, yourLocation } from "./useDeviceLocation";

interface PositionRequest {
  success: PositionCallback;
  error: PositionErrorCallback;
  options?: PositionOptions;
}

/**
 * Geolocation that answers only when the test says so. Returns each request,
 * so the test can answer it, or not, like a permission prompt left open.
 */
function stubGeolocation() {
  const requests: PositionRequest[] = [];
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, error: PositionErrorCallback, options?: PositionOptions) => {
      requests.push({ success, error, options });
    }
  );
  setGeolocation({ getCurrentPosition });
  return { requests, getCurrentPosition };
}

function setGeolocation(geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined) {
  Object.defineProperty(navigator, "geolocation", { value: geolocation, configurable: true, writable: true });
}

function answerWithPosition(request: PositionRequest, latitude: number, longitude: number) {
  request.success({ coords: { latitude, longitude } } as GeolocationPosition);
}

function answerWithError(request: PositionRequest, code: number) {
  request.error({ code } as GeolocationPositionError);
}

afterEach(() => {
  setGeolocation(undefined);
  vi.useRealTimers();
});

describe("locateDevice", () => {
  it("resolves with the position, asking for a recent one within the time limit", async () => {
    const { requests } = stubGeolocation();

    const result = locateDevice();
    expect(requests[0].options).toEqual({ timeout: LOCATION_TIMEOUT_MS, maximumAge: 300_000 });
    answerWithPosition(requests[0], 44.47, -72.69);

    expect(await result).toEqual({ status: "located", coordinates: { latitude: 44.47, longitude: -72.69 } });
  });

  it.each([
    { code: 1, status: "denied" },
    { code: 2, status: "unavailable" },
    { code: 3, status: "timeout" },
  ])("reports error code $code as $status", async ({ code, status }) => {
    const { requests } = stubGeolocation();

    const result = locateDevice();
    answerWithError(requests[0], code);

    expect(await result).toEqual({ status });
  });

  it("reports the location as unavailable when the browser can't share it", async () => {
    setGeolocation(undefined);
    expect(await locateDevice()).toEqual({ status: "unavailable" });
  });

  it("stops waiting at the time limit when nobody answers, and ignores a later answer", async () => {
    vi.useFakeTimers();
    const { requests } = stubGeolocation();
    let result: Awaited<ReturnType<typeof locateDevice>> | undefined;
    void locateDevice().then((r) => (result = r));

    await vi.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS - 1);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual({ status: "timeout" });

    answerWithPosition(requests[0], 44.47, -72.69);
    await vi.runAllTimersAsync();
    expect(result).toEqual({ status: "timeout" });
  });

  it("stops waiting as soon as it's cancelled, and ignores a later answer", async () => {
    const { requests } = stubGeolocation();
    const request = new AbortController();

    const result = locateDevice(request.signal);
    request.abort();
    answerWithPosition(requests[0], 44.47, -72.69);

    expect(await result).toEqual({ status: "cancelled" });
  });

  it("doesn't ask when it's already cancelled", async () => {
    const { getCurrentPosition } = stubGeolocation();
    const request = new AbortController();
    request.abort();

    expect(await locateDevice(request.signal)).toEqual({ status: "cancelled" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("yourLocation", () => {
  it("is a place labeled Your location, at the device's position", () => {
    expect(yourLocation({ latitude: 44.47, longitude: -72.69 })).toEqual({
      id: 0,
      name: "Your location",
      country: "",
      latitude: 44.47,
      longitude: -72.69,
    });
  });
});

describe("useDeviceLocation", () => {
  let geolocation: ReturnType<typeof stubGeolocation>;

  beforeEach(() => {
    geolocation = stubGeolocation();
  });

  it("asks for the location only when told to, then reports it", async () => {
    const { result } = renderHook(() => useDeviceLocation());
    expect(result.current.status).toBe("idle");
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();

    let located: Promise<unknown> = Promise.resolve();
    act(() => {
      located = result.current.locate();
    });
    expect(result.current.status).toBe("locating");

    await act(async () => {
      answerWithPosition(geolocation.requests[0], 44.47, -72.69);
      expect(await located).toEqual({ latitude: 44.47, longitude: -72.69 });
    });
    expect(result.current.status).toBe("located");
  });

  it("tries again only when asked again", async () => {
    const { result } = renderHook(() => useDeviceLocation());

    await act(async () => {
      const denied = result.current.locate();
      answerWithError(geolocation.requests[0], 1);
      expect(await denied).toBeNull();
    });
    expect(result.current.status).toBe("denied");
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      const located = result.current.locate();
      answerWithPosition(geolocation.requests[1], 44.47, -72.69);
      await located;
    });
    expect(result.current.status).toBe("located");
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it("drops a location that arrives after it's cancelled", async () => {
    const { result } = renderHook(() => useDeviceLocation());
    let located: Promise<unknown> = Promise.resolve();
    act(() => {
      located = result.current.locate();
    });

    act(() => result.current.cancel());
    await act(async () => {
      answerWithPosition(geolocation.requests[0], 44.47, -72.69);
      expect(await located).toBeNull();
    });
    expect(result.current.status).toBe("idle");
  });

  it("drops the previous request's answer when asked again", async () => {
    const { result } = renderHook(() => useDeviceLocation());
    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.locate();
    });
    act(() => {
      second = result.current.locate();
    });

    await act(async () => {
      answerWithError(geolocation.requests[0], 1);
      answerWithPosition(geolocation.requests[1], 44.47, -72.69);
      expect(await first).toBeNull();
      expect(await second).toEqual({ latitude: 44.47, longitude: -72.69 });
    });
    expect(result.current.status).toBe("located");
  });

  it("stops waiting when the page goes away", async () => {
    const { result, unmount } = renderHook(() => useDeviceLocation());
    let located: Promise<unknown> = Promise.resolve();
    act(() => {
      located = result.current.locate();
    });

    unmount();

    expect(await located).toBeNull();
  });
});
