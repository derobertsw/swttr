import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { TemperatureSensitivity } from "@/types/preferences";

function getUserId(request: NextRequest): string | null {
  return request.headers.get("x-user-id");
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const userId = getUserId(request);

  if (!supabase) {
    return NextResponse.json({
      temperatureSensitivity: "neutral",
      defaultActivity: "alpine-skiing",
    });
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("temperature_sensitivity, default_activity")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch preferences:", error);
      return NextResponse.json(
        { error: "Failed to fetch preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      temperatureSensitivity: (data?.temperature_sensitivity || "neutral") as TemperatureSensitivity,
      defaultActivity: data?.default_activity || "alpine-skiing",
    });
  } catch (err) {
    console.error("Database error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = getSupabase();
  const userId = getUserId(request);

  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { temperatureSensitivity, defaultActivity } = body as {
      temperatureSensitivity?: TemperatureSensitivity;
      defaultActivity?: string;
    };

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
      return NextResponse.json(
        { error: "Failed to save preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      temperatureSensitivity: data.temperature_sensitivity as TemperatureSensitivity,
      defaultActivity: data.default_activity,
    });
  } catch (err) {
    console.error("Error saving preferences:", err);
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }
}
