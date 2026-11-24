import { NextRequest, NextResponse } from "next/server";
import { isTimeZone } from "@/lib/timeZones";
import { searchResorts, type ResortSuggestion } from "@/lib/locations/resorts";

/**
 * Location search for Gear up and trips.
 *
 * - No `kind`: places from Open-Meteo's geocoder, as before.
 * - `kind=resort`: ski resorts from the bundled catalog only, typos included (#7).
 * - `kind=all`: resorts and places together. A town and the resort named for
 *   it (Stowe) both stay: they're different places with different weather.
 */
const KINDS = new Set(["resort", "all"]);
const PLACE_LIMIT = 5;
const ALL_LIMIT = 8;

interface PlaceResult {
  id: number;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  timeZone?: string;
}

async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${PLACE_LIMIT}&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch geocoding data");
  const data = await response.json();
  return (data.results || []).map((result: {
    id: number;
    name: string;
    admin1?: string;
    country: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }) => ({
    id: result.id,
    name: result.name,
    region: result.admin1,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
    // Date shortcuts and default times on the client read the place's clock.
    timeZone: isTimeZone(result.timezone) ? result.timezone : undefined,
  }));
}

/** Resorts named as typed lead; the geocoder's places follow; looser resort matches last. */
function combine(resorts: ResortSuggestion[], places: PlaceResult[]): (ResortSuggestion | PlaceResult)[] {
  const seen = new Set<string>();
  const unique = <T extends ResortSuggestion | PlaceResult>(items: T[]) => items.filter((item) => {
    const key = String(item.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const leading = resorts.filter((resort) => resort.match === "exact" || resort.match === "prefix");
  const trailing = resorts.filter((resort) => !leading.includes(resort));
  return [...unique(leading), ...unique(places), ...unique(trailing)].slice(0, ALL_LIMIT);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const kind = searchParams.get("kind");

  if (kind !== null && !KINDS.has(kind)) {
    return NextResponse.json({ error: "kind must be resort or all" }, { status: 400 });
  }
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (kind === "resort") return NextResponse.json({ results: searchResorts(query) });

  if (kind === "all") {
    const resorts = searchResorts(query);
    try {
      return NextResponse.json({ results: combine(resorts, await searchPlaces(query)) });
    } catch (error) {
      console.error("Geocoding API error:", error);
      // Resorts don't need the geocoder; say the places part is missing rather than fail.
      if (resorts.length) return NextResponse.json({ results: resorts, placesUnavailable: true });
      return NextResponse.json({ error: "Failed to fetch location data" }, { status: 500 });
    }
  }

  try {
    return NextResponse.json({ results: await searchPlaces(query) });
  } catch (error) {
    console.error("Geocoding API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch location data" },
      { status: 500 }
    );
  }
}
