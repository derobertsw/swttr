import "server-only";
import { RoutingUnavailable } from "@/lib/locations/routing";

type Point = { latitude: number; longitude: number };
type RoadGeometry = { type: "MultiLineString"; coordinates: number[][][] };
const MAX_BYTES = 2_000_000;
const MAX_POINTS = 20_000;

/** A separate Routing request: Route Matrix never supplies a road line. */
export async function driveGeometry(origin: Point, access: Point, avoid: Point[] = []): Promise<RoadGeometry | null> {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) throw new RoutingUnavailable("Route lines aren't configured.");
  const url = new URL("https://api.geoapify.com/v1/routing");
  url.searchParams.set("apiKey", key);
  url.searchParams.set("waypoints", `${origin.latitude},${origin.longitude}|${access.latitude},${access.longitude}`);
  url.searchParams.set("mode", "drive");
  url.searchParams.set("traffic", "approximated");
  url.searchParams.set("format", "geojson");
  if (avoid.length) url.searchParams.set("avoid", avoid.map((p) => `location:${p.latitude},${p.longitude}`).join("|"));
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body?.cancel(); throw new Error(); }
    // Bound decoded bytes too; Content-Length may be absent or compressed.
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let size = 0, text = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error(); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    const body = JSON.parse(text);
    // Only an explicit no-road answer is no_route; a generic 400 is failure.
    if (response.status === 400 && typeof body?.message === "string"
      && /^(No suitable edges near location|Route not found|No route found)([.\s]|$)/i.test(body.message)) return null;
    if (!response.ok || body?.type !== "FeatureCollection" || !Array.isArray(body.features) || body.features.length !== 1) throw new Error();
    const geometry = body.features[0]?.geometry;
    if (geometry?.type !== "MultiLineString" || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) throw new Error();
    let points = 0;
    for (const line of geometry.coordinates) {
      if (!Array.isArray(line) || line.length < 2) throw new Error();
      points += line.length;
      if (points > MAX_POINTS || !line.every((p: unknown) => Array.isArray(p) && p.length === 2
        && typeof p[0] === "number" && Number.isFinite(p[0]) && Math.abs(p[0]) <= 180
        && typeof p[1] === "number" && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90)) throw new Error();
    }
    // Whitelist geometry only: raw properties can echo the key/request.
    return { type: "MultiLineString", coordinates: geometry.coordinates };
  } catch { throw new RoutingUnavailable("Route line unavailable."); }
}
