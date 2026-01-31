import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { TemperatureSensitivity } from "@/types/preferences";

function getUserId(request: NextRequest): string | null {
  return request.headers.get("x-user-id");
}

const DEFAULT_PREFERENCES = {
  temperatureSensitivity: "neutral" as TemperatureSensitivity,
  defaultActivity: "alpine-skiing",
};

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const userId = getUserId(request);

  // Return defaults if no database or no user ID
  if (!supabase || !userId) {
    return NextResponse.json(DEFAULT_PREFERENCES);
  }

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("temperature_sensitivity, default_activity")
      .eq("user_id", userId)
      .single();

    // PGRST116 = no rows found, which is fine - use defaults
    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch preferences:", error);
      // Return defaults instead of failing
      return NextResponse.json(DEFAULT_PREFERENCES);
    }

    return NextResponse.json({
      temperatureSensitivity: (data?.temperature_sensitivity || "neutral") as TemperatureSensitivity,
      defaultActivity: data?.default_activity || "alpine-skiing",
    });
  } catch (err) {
    console.error("Database error:", err);
    // Return defaults instead of failing
    return NextResponse.json(DEFAULT_PREFERENCES);
  }
}

export async function PUT(request: NextRequest) {
  const supabase = getSupabase();
  const userId = getUserId(request);

  // Parse body first to return what was sent
  let body: { temperatureSensitivity?: TemperatureSensitivity; defaultActivity?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { temperatureSensitivity, defaultActivity } = body;

  // If no database or user, just acknowledge the request
  // Client saves to localStorage anyway
  if (!supabase || !userId) {
    return NextResponse.json({
      temperatureSensitivity: temperatureSensitivity || "neutral",
      defaultActivity: defaultActivity || "alpine-skiing",
    });
  }

  try {
    // Build update object with only provided fields
    const updateData: Record<string, string> = { user_id: userId };

    if (temperatureSensitivity) {
      if (!["hot", "neutral", "cold"].includes(temperatureSensitivity)) {
        return NextResponse.json(
          { error: "Invalid temperature sensitivity value" },
          { status: 400 }
        );
      }
      updateData.temperature_sensitivity = temperatureSensitivity;
    }

    if (defaultActivity) {
      updateData.default_activity = defaultActivity;
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(updateData, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("Failed to upsert preferences:", error);
      // Return what was sent - client already saved to localStorage
      return NextResponse.json({
        temperatureSensitivity: temperatureSensitivity || "neutral",
        defaultActivity: defaultActivity || "alpine-skiing",
      });
    }

    return NextResponse.json({
      temperatureSensitivity: data.temperature_sensitivity as TemperatureSensitivity,
      defaultActivity: data.default_activity,
    });
  } catch (err) {
    console.error("Error saving preferences:", err);
    // Return what was sent - client already saved to localStorage
    return NextResponse.json({
      temperatureSensitivity: temperatureSensitivity || "neutral",
      defaultActivity: defaultActivity || "alpine-skiing",
    });
  }
}
