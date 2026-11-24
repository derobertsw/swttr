import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locateDevice } from "@/hooks/useDeviceLocation";

// The iOS shell injects these scripts at document start (#147). The native
// side is tested in apple/SWTTRShellKit; this checks the scripts against a
// stubbed window.webkit.messageHandlers, without Xcode.
const resources = path.resolve(__dirname, "../../apple/SWTTRShellKit/Sources/SWTTRShellKit/Resources");
const geolocationScript = readFileSync(path.join(resources, "geolocation-bridge.js"), "utf8");
const shareScript = readFileSync(path.join(resources, "share-bridge.js"), "utf8");

type Handler = { postMessage: ReturnType<typeof vi.fn> };
type ShellWindow = Window & { webkit?: { messageHandlers: Record<string, Handler> } };

function install(script: string, handlers: Record<string, (message: unknown) => unknown>) {
  const stubs: Record<string, Handler> = {};
  for (const [name, reply] of Object.entries(handlers)) {
    stubs[name] = { postMessage: vi.fn(async (message: unknown) => reply(message)) };
  }
  (window as ShellWindow).webkit = { messageHandlers: stubs };
  new Function(script)();
  return stubs;
}

afterEach(() => {
  delete (window as ShellWindow).webkit;
  for (const key of ["geolocation", "share", "canShare"]) {
    Reflect.deleteProperty(navigator, key);
  }
});

const position = {
  coords: { latitude: 44.47, longitude: -73.21, accuracy: 65, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: 1_800_000_000_500,
};

function getPosition(options?: PositionOptions) {
  return new Promise<{ position?: GeolocationPosition; error?: GeolocationPositionError }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (value) => resolve({ position: value }),
      (error) => resolve({ error }),
      options,
    );
  });
}

describe("geolocation-bridge.js", () => {
  it("does nothing outside the shell", () => {
    new Function(geolocationScript)();
    expect(navigator.geolocation).toBeUndefined();
  });

  it("resolves with a GeolocationPosition and sends the options in milliseconds", async () => {
    const { swttrGeolocation } = install(geolocationScript, { swttrGeolocation: () => position });

    const { position: result } = await getPosition({ timeout: 10_000, maximumAge: 300_000, enableHighAccuracy: true });

    expect(swttrGeolocation.postMessage).toHaveBeenCalledWith({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 });
    expect(result?.coords.latitude).toBe(44.47);
    expect(result?.coords.longitude).toBe(-73.21);
    expect(result?.coords.accuracy).toBe(65);
    expect(result?.coords.altitude).toBeNull();
    expect(result?.timestamp).toBe(1_800_000_000_500);
    expect(JSON.parse(JSON.stringify(result))).toEqual(position);
  });

  it("sends no limit as null and uses the API's defaults", async () => {
    const { swttrGeolocation } = install(geolocationScript, { swttrGeolocation: () => position });
    await getPosition();
    await getPosition({ timeout: Infinity, maximumAge: Infinity });
    await getPosition({ timeout: -5, maximumAge: Number.NaN });
    expect(swttrGeolocation.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { enableHighAccuracy: false, timeout: null, maximumAge: 0 },
      { enableHighAccuracy: false, timeout: null, maximumAge: null },
      { enableHighAccuracy: false, timeout: 0, maximumAge: 0 },
    ]);
  });

  it.each([
    [1, "PERMISSION_DENIED"],
    [2, "POSITION_UNAVAILABLE"],
    [3, "TIMEOUT"],
  ] as const)("reports error code %i with the standard constants", async (code, constant) => {
    install(geolocationScript, { swttrGeolocation: () => ({ error: { code, message: "native" } }) });
    const { error } = await getPosition();
    expect(error?.code).toBe(code);
    expect(error?.[constant]).toBe(code);
    expect(error).toMatchObject({ PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "native" });
  });

  it("treats a rejected or unreadable reply as position unavailable", async () => {
    install(geolocationScript, { swttrGeolocation: () => Promise.reject(new Error("no handler")) });
    expect((await getPosition()).error?.code).toBe(2);

    install(geolocationScript, { swttrGeolocation: () => ({ error: { code: 99 } }) });
    expect((await getPosition()).error?.code).toBe(2);
  });

  it("feeds the web's location hook the same codes it reads in a browser", async () => {
    install(geolocationScript, { swttrGeolocation: () => ({ error: { code: 1 } }) });
    expect(await locateDevice()).toEqual({ status: "denied" });

    install(geolocationScript, { swttrGeolocation: () => ({ error: { code: 3 } }) });
    expect(await locateDevice()).toEqual({ status: "timeout" });

    install(geolocationScript, { swttrGeolocation: () => position });
    expect(await locateDevice()).toEqual({ status: "located", coordinates: { latitude: 44.47, longitude: -73.21 } });
  });

  it("requires a success callback", () => {
    install(geolocationScript, { swttrGeolocation: () => position });
    expect(() => navigator.geolocation.getCurrentPosition(undefined as unknown as PositionCallback)).toThrow(TypeError);
  });

  it("runs watchPosition once, and clearWatch drops a position still on its way", async () => {
    const { swttrGeolocation } = install(geolocationScript, { swttrGeolocation: () => position });
    const success = vi.fn();

    const first = navigator.geolocation.watchPosition(success);
    const second = navigator.geolocation.watchPosition(success);
    navigator.geolocation.clearWatch(second);
    await vi.waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first).not.toBe(second);
    expect(success).toHaveBeenCalledTimes(1);
    expect(swttrGeolocation.postMessage).toHaveBeenCalledTimes(2);
  });
});

describe("share-bridge.js", () => {
  const shareData = { title: "Trip invite", text: "Sam, here's your invite.", url: "https://swttr.vercel.app/trips/invite/abc" };

  it("does nothing outside the shell", () => {
    new Function(shareScript)();
    expect(navigator.share).toBeUndefined();
  });

  it("leaves a share that already exists alone", () => {
    const existing = vi.fn();
    Object.defineProperty(navigator, "share", { configurable: true, value: existing });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: existing });
    install(shareScript, { swttrShare: () => ({ outcome: "shared" }) });
    expect(navigator.share).toBe(existing);
    expect(navigator.canShare).toBe(existing);
  });

  it("resolves once the share sheet reports a share", async () => {
    const { swttrShare } = install(shareScript, { swttrShare: () => ({ outcome: "shared" }) });
    await expect(navigator.share(shareData)).resolves.toBeUndefined();
    expect(swttrShare.postMessage).toHaveBeenCalledWith(shareData);
  });

  it("resolves relative URLs against the page", async () => {
    const { swttrShare } = install(shareScript, { swttrShare: () => ({ outcome: "shared" }) });
    await navigator.share({ url: "/trips/abc" });
    expect(swttrShare.postMessage).toHaveBeenCalledWith({ url: new URL("/trips/abc", document.baseURI).href });
  });

  it("rejects a cancelled share with an AbortError DOMException", async () => {
    install(shareScript, { swttrShare: () => ({ outcome: "cancelled" }) });
    const error = await navigator.share(shareData).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  it.each([
    ["notAllowed", "NotAllowedError"],
    ["busy", "InvalidStateError"],
    ["failed", "DataError"],
    ["something new", "DataError"],
  ])("rejects outcome %s with %s", async (outcome, name) => {
    install(shareScript, { swttrShare: () => ({ outcome }) });
    await expect(navigator.share(shareData)).rejects.toMatchObject({ name });
  });

  it("rejects a second share while the first is open", async () => {
    let finish: (value: unknown) => void = () => {};
    install(shareScript, { swttrShare: () => new Promise((resolve) => { finish = resolve; }) });
    const first = navigator.share(shareData);
    await expect(navigator.share(shareData)).rejects.toMatchObject({ name: "InvalidStateError" });
    finish({ outcome: "shared" });
    await expect(first).resolves.toBeUndefined();
    // Once it's closed, the next share opens.
    const next = navigator.share(shareData);
    finish({ outcome: "shared" });
    await expect(next).resolves.toBeUndefined();
  });

  it("validates share data like the Web Share API", async () => {
    const { swttrShare } = install(shareScript, { swttrShare: () => ({ outcome: "shared" }) });
    expect(navigator.canShare(shareData)).toBe(true);
    expect(navigator.canShare({ text: "Hello" })).toBe(true);
    expect(navigator.canShare({})).toBe(false);
    expect(navigator.canShare()).toBe(false);
    expect(navigator.canShare({ url: "javascript:alert(1)" })).toBe(false);
    expect(navigator.canShare({ url: "http://[" })).toBe(false);
    expect(navigator.canShare({ files: [new File(["x"], "x.txt")] })).toBe(false);

    await expect(navigator.share({})).rejects.toBeInstanceOf(TypeError);
    await expect(navigator.share({ url: "mailto:sam@example.com" })).rejects.toBeInstanceOf(TypeError);
    expect(swttrShare.postMessage).not.toHaveBeenCalled();
  });
});
