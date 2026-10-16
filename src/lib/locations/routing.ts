import "server-only";

/**
 * Road travel estimates for trip logistics (#209). Like provider.ts, only
 * this module knows the routing provider; the rest of the app works with
 * DriveLeg, so a later switch (#283) changes this file.
 *
 * The #208 pilot settled the options: typical traffic rather than free-flow
 * (14 vs 18 min to the Adirondak Loj), and null for places with no road,
 * such as huts. See docs/trip-locations.md.
 */

export class RoutingUnavailable extends Error {}

type Point = { latitude: number; longitude: number };
/** One road route: seconds and metres, both whole numbers. */
export interface DriveLeg { seconds: number; meters: number }

const MATRIX_URL = "https://api.geoapify.com/v1/routematrix";
const TIMEOUT_MS = 8_000;
/** A regular Route Matrix call covers up to 1,000 cells (sources × targets). */
const MAX_CELLS = 1_000;

const lonLat = (point: Point) => [point.longitude, point.latitude];
const whole = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

/** Counts only: no coordinates. Shows how close we run to the free daily credits. */
function logUsage(outcome: string, cells = 0, noRoute = 0) {
  console.info(JSON.stringify({ event: "drive_matrix", provider: "geoapify", outcome, cells, no_route: noRoute }));
}

/**
 * Drives from every source to every target: `result[source][target]` is a
 * leg, or null when there's no road route. Avoids the given points, such as
 * roads closed for the winter. Throws RoutingUnavailable when the key is
 * missing, the provider fails or the daily quota is spent, so the caller can
 * say so and keep an earlier estimate.
 */
export async function driveMatrix(sources: Point[], targets: Point[], avoid: Point[] = []): Promise<Array<Array<DriveLeg | null>>> {
  if (!sources.length || !targets.length) return sources.map(() => []);
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) throw new RoutingUnavailable("Drive estimates aren't configured.");
  if (sources.length * targets.length > MAX_CELLS) throw new RoutingUnavailable("Too many places for one estimate.");
  const url = new URL(MATRIX_URL);
  url.searchParams.set("apiKey", key);
  const body = {
    mode: "drive",
    traffic: "approximated",
    sources: sources.map((point) => ({ location: lonLat(point) })),
    targets: targets.map((point) => ({ location: lonLat(point) })),
    ...(avoid.length ? { avoid: [{ type: "locations", values: avoid.map((point) => ({ lon: point.longitude, lat: point.latitude })) }] } : {}),
  };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    logUsage("network_error");
    throw new RoutingUnavailable("Drive estimates didn't respond.");
  }
  if (!response.ok) {
    // 401/403: key problem. 429: the free plan's daily credits are spent.
    logUsage(`http_${response.status}`);
    throw new RoutingUnavailable(`Drive estimates failed (${response.status}).`);
  }
  const rows = ((await response.json().catch(() => null)) as { sources_to_targets?: unknown } | null)?.sources_to_targets;
  const result: Array<Array<DriveLeg | null | undefined>> = sources.map(() => targets.map(() => undefined));
  let noRoute = 0;
  if (Array.isArray(rows)) {
    for (const cell of rows.flat()) {
      const { source_index: i, target_index: j, time, distance } = (cell ?? {}) as Record<string, unknown>;
      if (typeof i !== "number" || typeof j !== "number" || !result[i] || !(j >= 0 && j < targets.length) || result[i][j] !== undefined) continue;
      const seconds = whole(time), meters = whole(distance);
      result[i][j] = seconds === null || meters === null ? null : { seconds, meters };
      if (!result[i][j]) noRoute++;
    }
  }
  if (result.some((row) => row.some((cell) => cell === undefined))) {
    logUsage("bad_response");
    throw new RoutingUnavailable("Drive estimates sent an unreadable answer.");
  }
  logUsage("ok", sources.length * targets.length, noRoute);
  return result as Array<Array<DriveLeg | null>>;
}
