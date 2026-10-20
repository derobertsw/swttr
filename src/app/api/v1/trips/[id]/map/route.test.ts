// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/api";
import { loadTripFull } from "@/lib/trips";
import { driveTrip, place } from "@/test/driveTrip";
import type { TripFull } from "@/types/trips";
import type { TripMapData } from "@/types/trip-map";
import { GET } from "./route";
import { GET as geometryGET } from "../days/[date]/geometry/route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), loadTripFull: vi.fn() }));

let full: TripFull, userId: string, memberStatus: string | null, stored: unknown[], manual: unknown[];
let sequence = 0;
const date = "2027-01-10";
const shape = { type: "MultiLineString", coordinates: [[[-72.7262, 44.4875], [-72.78, 44.55], [-72.7837, 44.587]]] };
const providerResponse = () => Response.json({ type: "FeatureCollection", features: [{ geometry: shape }] });
const get = (selected?: string) => GET(new Request(`http://localhost/api/v1/trips/${full.trip.id}/map${selected ? `?date=${selected}` : ""}`), { params: Promise.resolve({ id: full.trip.id }) });
const getGeometry = (revision: string, selected = date) => geometryGET(new Request(`http://localhost/api/v1/trips/${full.trip.id}/days/${selected}/geometry?revision=${revision}`), { params: Promise.resolve({ id: full.trip.id, date: selected }) });
const selected = async () => (await (await get(date)).json() as TripMapData).selected_day!;

describe("Authorized trip map APIs", () => {
  const fetchMock = vi.fn();
  const reads: URL[] = [];
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); vi.stubEnv("GEOAPIFY_API_KEY", "server-secret");
    fetchMock.mockReset(); fetchMock.mockImplementation(async () => providerResponse());
    full = structuredClone(driveTrip()); full.trip.id = `trip-map-${++sequence}`;
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-07T12:00:00Z") + sequence * 10_000);
    for (const row of [...full.days, ...full.stops, ...full.lodging!.stays, ...full.lodging!.assignments]) row.trip_id = full.trip.id;
    userId = `member-${sequence}`; memberStatus = "joined"; stored = []; manual = []; reads.length = 0;
    const supabase = createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input) => {
        const url = new URL(String(input)); reads.push(url);
        const table = url.pathname.split("/").at(-1);
        const rows: Record<string, unknown>[] = table === "trips" ? [full.trip as unknown as Record<string, unknown>]
          : table === "trip_members" ? memberStatus ? [{ id: "membership", trip_id: full.trip.id, user_id: userId, status: memberStatus }] : []
          : table === "trip_drive_estimates" ? stored as Record<string, unknown>[] : manual as Record<string, unknown>[];
        return Response.json(rows.filter((row) => [...url.searchParams].every(([column, filter]) =>
          filter.startsWith("eq.") ? String(row[column]) === filter.slice(3) : filter.startsWith("neq.") ? String(row[column]) !== filter.slice(4) : true)));
      } },
    });
    vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
    vi.mocked(loadTripFull).mockImplementation(async () => structuredClone(full));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("lets a current member read the same dated map/list data without routing, with private cache headers", async () => {
    const response = await get(date), body = await response.json() as TripMapData;
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    expect(body.selected_day).toMatchObject({ date, origin: "stay:stay-motel:location", tonight: "stay:stay-inn:location", drive: { state: "unavailable" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reads.filter((url) => /trip_drive/.test(url.pathname)).every((url) => url.searchParams.get("trip_id") === `eq.${full.trip.id}`)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/server-secret|invite_token|booking_status/);
  });
  it.each([null, "left"])("denies non-members and departed members (%s) before loading protected data", async (status) => {
    memberStatus = status;
    for (const response of [await get(), await getGeometry("a".repeat(64))]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(loadTripFull).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("allows the organizer without a membership", async () => {
    full.trip.owner_user_id = userId; memberStatus = null;
    expect((await get()).status).toBe(200);
  });
  it("rejects cross-trip place references and days without making provider calls", async () => {
    expect((await get("2028-01-01")).status).toBe(404);
    expect((await getGeometry("a".repeat(64), "2028-01-01")).status).toBe(404);
    full.days[0].stop_id = "foreign-trip-stop";
    expect((await get()).status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires a matching current revision, then fetches only the selected drive and reuses it", async () => {
    expect((await getGeometry("invalid")).status).toBe(400);
    expect((await getGeometry("a".repeat(64))).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
    const day = await selected();
    const body = await (await getGeometry(day.revision)).json();
    expect(body).toMatchObject({ state: "available", date, revision: day.revision, geometry: shape });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("waypoints")).toBe("44.4875,-72.7262|44.587,-72.7837");
    expect(url.searchParams.get("avoid")).toBe("location:44.5555,-72.7947");
    expect((await getGeometry(day.revision)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps cached estimates usable without geometry configuration or on provider failure", async () => {
    const day = await selected();
    for (const status of [429, 500]) {
      fetchMock.mockResolvedValue(Response.json({}, { status }));
      expect(await (await getGeometry(day.revision)).json()).toMatchObject({ state: "unavailable", geometry: null });
    }
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    expect(await (await getGeometry(day.revision)).json()).toMatchObject({ state: "unavailable", geometry: null });
    expect((await get()).status).toBe(200);
  });
  it("does not route no-drive, approximate or missing endpoints", async () => {
    full.days[2].no_drive = true;
    expect(await (await getGeometry((await selected()).revision)).json()).toMatchObject({ state: "not_applicable" });
    full.days[2].no_drive = false;
    full.lodging!.stays[0].location!.precision = "approximate";
    expect(await (await getGeometry((await selected()).revision)).json()).toMatchObject({ state: "not_applicable" });
    full.lodging!.stays[0].location = null;
    expect(await (await getGeometry((await selected()).revision)).json()).toMatchObject({ state: "not_applicable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects endpoints edited during an in-flight route request, and doesn't restore the old line", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const old = await selected(), response = getGeometry(old.revision);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    full.days[2].access_point = place("New lot", 44.6, -72.8); full.days[2].access_point_stop_id = full.stops[1].id;
    finish(providerResponse());
    expect((await response).status).toBe(409);
    const current = await selected();
    expect(current.revision).not.toBe(old.revision);
    expect((await getGeometry(old.revision)).status).toBe(409);
    expect((await getGeometry(current.revision)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("checks membership again after routing and on cache hits", async () => {
    const day = await selected();
    expect((await getGeometry(day.revision)).status).toBe(200);
    memberStatus = "left";
    expect((await getGeometry(day.revision)).status).toBe(404);
    memberStatus = "joined";
    full.days[2].access_point = place("Another lot", 44.7, -72.9); full.days[2].access_point_stop_id = full.stops[1].id;
    const changedDay = await selected();
    fetchMock.mockImplementationOnce(async () => { memberStatus = "left"; return providerResponse(); });
    expect((await getGeometry(changedDay.revision)).status).toBe(404);
  });
  it("bounds map and selected-day request counts per person", async () => {
    const day = await selected();
    for (let i = 0; i < 29; i++) expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);
    full.days[2].no_drive = true;
    // Revision mismatches count too, before any provider work.
    for (let i = 0; i < 20; i++) expect((await getGeometry(day.revision)).status).toBe(409);
    expect((await getGeometry(day.revision)).status).toBe(429);
  });
});
