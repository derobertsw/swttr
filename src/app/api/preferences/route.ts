import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { TemperatureSensitivity } from "@/types/preferences";
import { sanitizeOptionalBodyMetrics } from "@/lib/biophysics/bodyMetrics";
import { getAuthUserId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();

  // No database or no user — return empty so client keeps localStorage values
  if (!supabase || !userId) {
    return NextResponse.json({});
  }

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    // PGRST116 = no rows found — return empty so client keeps localStorage values
    if (error?.code === "PGRST116") {
      return NextResponse.json({});
    }

    if (error) {
      console.error("Failed to fetch preferences:", error);
      return NextResponse.json({});
    }

    const savedOptionalMetrics = sanitizeOptionalBodyMetrics({
      heightInches: data?.height_inches,
      weightLbs: data?.weight_lbs,
    });

    const response: {
      temperatureSensitivity?: TemperatureSensitivity;
      defaultActivity?: string;
      heightInches?: number;
      weightLbs?: number;
    } = {};

    if (data?.temperature_sensitivity) {
      response.temperatureSensitivity = data.temperature_sensitivity as TemperatureSensitivity;
    }
    if (data?.default_activity) {
      response.defaultActivity = data.default_activity;
    }
    if (savedOptionalMetrics.heightInches !== undefined) {
      response.heightInches = savedOptionalMetrics.heightInches;
    }
    if (savedOptionalMetrics.weightLbs !== undefined) {
      response.weightLbs = savedOptionalMetrics.weightLbs;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("Database error:", err);
    return NextResponse.json({});
  }
}

export async function PUT(request: NextRequest) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();

  // Parse body first to return what was sent
  let body: {
    temperatureSensitivity?: TemperatureSensitivity;
    defaultActivity?: string;
    heightInches?: number;
    weightLbs?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { temperatureSensitivity, defaultActivity, heightInches, weightLbs } = body;
  const sanitizedMetrics = sanitizeOptionalBodyMetrics({ heightInches, weightLbs });
  const hasHeightInput = heightInches !== undefined;
  const hasWeightInput = weightLbs !== undefined;

  // If no database or user, just acknowledge the request
  // Client saves to localStorage anyway
  if (!supabase || !userId) {
    const response: {
      temperatureSensitivity: TemperatureSensitivity;
      defaultActivity: string;
      heightInches?: number;
      weightLbs?: number;
    } = {
      temperatureSensitivity: temperatureSensitivity || "neutral",
      defaultActivity: defaultActivity || "alpine_skiing",
    };
    if (hasHeightInput && sanitizedMetrics.heightInches !== undefined) {
      response.heightInches = sanitizedMetrics.heightInches;
    }
    if (hasWeightInput && sanitizedMetrics.weightLbs !== undefined) {
      response.weightLbs = sanitizedMetrics.weightLbs;
    }
    return NextResponse.json(response);
  }

  try {
    // Build update object with only provided fields
    const updateData: Record<string, string | number> = { user_id: userId };

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

    if (hasHeightInput && sanitizedMetrics.heightInches !== undefined) {
      updateData.height_inches = sanitizedMetrics.heightInches;
    }
    if (hasWeightInput && sanitizedMetrics.weightLbs !== undefined) {
      updateData.weight_lbs = sanitizedMetrics.weightLbs;
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(updateData, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("Failed to upsert preferences:", error);
      // Return what was sent - client already saved to localStorage
      const response: {
        temperatureSensitivity: TemperatureSensitivity;
        defaultActivity: string;
        heightInches?: number;
        weightLbs?: number;
      } = {
        temperatureSensitivity: temperatureSensitivity || "neutral",
        defaultActivity: defaultActivity || "alpine_skiing",
      };
      if (hasHeightInput && sanitizedMetrics.heightInches !== undefined) {
        response.heightInches = sanitizedMetrics.heightInches;
      }
      if (hasWeightInput && sanitizedMetrics.weightLbs !== undefined) {
        response.weightLbs = sanitizedMetrics.weightLbs;
      }
      return NextResponse.json(response);
    }

    const savedMetrics = sanitizeOptionalBodyMetrics({
      heightInches: data.height_inches,
      weightLbs: data.weight_lbs,
    });

    const response: {
      temperatureSensitivity: TemperatureSensitivity;
      defaultActivity: string;
      heightInches?: number;
      weightLbs?: number;
    } = {
      temperatureSensitivity: data.temperature_sensitivity as TemperatureSensitivity,
      defaultActivity: data.default_activity,
    };
    if (savedMetrics.heightInches !== undefined) {
      response.heightInches = savedMetrics.heightInches;
    }
    if (savedMetrics.weightLbs !== undefined) {
      response.weightLbs = savedMetrics.weightLbs;
    }
    return NextResponse.json(response);
  } catch (err) {
    console.error("Error saving preferences:", err);
    // Return what was sent - client already saved to localStorage
    const response: {
      temperatureSensitivity: TemperatureSensitivity;
      defaultActivity: string;
      heightInches?: number;
      weightLbs?: number;
    } = {
      temperatureSensitivity: temperatureSensitivity || "neutral",
      defaultActivity: defaultActivity || "alpine_skiing",
    };
    if (hasHeightInput && sanitizedMetrics.heightInches !== undefined) {
      response.heightInches = sanitizedMetrics.heightInches;
    }
    if (hasWeightInput && sanitizedMetrics.weightLbs !== undefined) {
      response.weightLbs = sanitizedMetrics.weightLbs;
    }
    return NextResponse.json(response);
  }
}
