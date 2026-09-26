import { NextRequest, NextResponse } from "next/server";
import { BodyPart, LayerType, UserItemMapping } from "@/types/wardrobe";
import { readJson, requireUser } from "@/lib/api";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  try {
    const { data, error } = await supabase
      .from("user_item_mappings")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to fetch item mappings:", error);
      return NextResponse.json(
        { error: "Failed to fetch mappings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ mappings: (data || []) as UserItemMapping[] });
  } catch (err) {
    console.error("Database error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  try {
    const body = (await readJson(request)) ?? {};
    const { bodyPart, layerType, standardOption, customName } = body as {
      bodyPart: BodyPart;
      layerType: LayerType;
      standardOption: string;
      customName: string;
    };

    if (!bodyPart || !layerType || !standardOption || !customName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_item_mappings")
      .upsert(
        {
          user_id: userId,
          body_part: bodyPart,
          layer_type: layerType,
          standard_option: standardOption,
          custom_name: customName,
        },
        {
          onConflict: "user_id,body_part,layer_type,standard_option",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Failed to upsert item mapping:", error);
      return NextResponse.json(
        { error: "Failed to save mapping" },
        { status: 500 }
      );
    }

    return NextResponse.json({ mapping: data as UserItemMapping });
  } catch (err) {
    console.error("Error saving mapping:", err);
    return NextResponse.json(
      { error: "Failed to save mapping" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const bodyPart = searchParams.get("bodyPart") as BodyPart;
    const layerType = searchParams.get("layerType") as LayerType;
    const standardOption = searchParams.get("standardOption");

    if (!bodyPart || !layerType || !standardOption) {
      return NextResponse.json(
        { error: "Missing required query parameters" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("user_item_mappings")
      .delete()
      .eq("user_id", userId)
      .eq("body_part", bodyPart)
      .eq("layer_type", layerType)
      .eq("standard_option", standardOption);

    if (error) {
      console.error("Failed to delete mapping:", error);
      return NextResponse.json(
        { error: "Failed to delete mapping" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting mapping:", err);
    return NextResponse.json(
      { error: "Failed to delete mapping" },
      { status: 500 }
    );
  }
}
