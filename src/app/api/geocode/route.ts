import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to fetch geocoding data");
    }

    const data = await response.json();

    const results = (data.results || []).map((result: {
      id: number;
      name: string;
      admin1?: string;
      country: string;
      latitude: number;
      longitude: number;
    }) => ({
      id: result.id,
      name: result.name,
      region: result.admin1,
      country: result.country,
      latitude: result.latitude,
      longitude: result.longitude,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Geocoding API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch location data" },
      { status: 500 }
    );
  }
}
