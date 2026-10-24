import { NextRequest, NextResponse } from "next/server";
import { isTimeZone } from "@/lib/timeZones";
import { findResorts, type ResortSuggestion } from "@/lib/locations/resorts";

/**
 * `kind=resort` searches the ski resort catalog only. `kind=all` adds catalog
 * matches to the geocoder's places. Without `kind`, places only, as before #7.
 * See docs/ski-resorts.md.
 */
const KINDS = new Set(["resort", "all"]);

const PLACE_LIMIT = 5;
const RESORT_LIMIT = 6;
/** Resorts alongside places in all-places search. */
const ALL_PLACES_RESORT_LIMIT = 3;

interface Place {
  id: number;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  timeZone?: string;
}

async function searchPlaces(query: string): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${PLACE_LIMIT}&language=en&format=json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch geocoding data");
  }

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

/**
 * Resorts named exactly as typed, then places, then the other resort matches
 * and typo suggestions. IDs are per source, so a town and its resort ("Stowe")
 * both stay, each labeled with its kind.
 */
function allPlaces(resorts: ResortSuggestion[], places: Place[]) {
  const seen = new Set<string>();
  return [
    ...resorts.filter((resort) => resort.match === "exact"),
    ...places.map((place) => ({ ...place, kind: "place" as const, source: "open-meteo" as const })),
    ...resorts.filter((resort) => resort.match !== "exact"),
  ].filter(({ id }) => {
    if (seen.has(String(id))) return false;
    seen.add(String(id));
    return true;
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const kind = searchParams.get("kind");

  if (kind !== null && !KINDS.has(kind)) {
    return NextResponse.json({ error: "Unknown search kind" }, { status: 400 });
  }

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (kind === "resort") {
    return NextResponse.json({ results: findResorts(query, RESORT_LIMIT) });
  }

  const resorts = kind === "all" ? findResorts(query, ALL_PLACES_RESORT_LIMIT) : [];
  try {
    const places = await searchPlaces(query);
    return NextResponse.json({ results: kind === "all" ? allPlaces(resorts, places) : places });
  } catch (error) {
    console.error("Geocoding API error:", error);
    // The catalog is local, so its matches still stand; `partial` says places are missing.
    if (resorts.length) return NextResponse.json({ results: resorts, partial: true });
    return NextResponse.json(
      { error: "Failed to fetch location data" },
      { status: 500 }
    );
  }
}
