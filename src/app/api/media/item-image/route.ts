import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type ItemType = "garment" | "handwear" | "headwear";

const TABLE_BY_ITEM_TYPE: Record<ItemType, "garments" | "handwear" | "headwear"> = {
  garment: "garments",
  handwear: "handwear",
  headwear: "headwear",
};

const DIRECT_ITEM_IMAGE_BY_KEY: Record<string, string> = {
  // Existing entries
  "32 degrees|heat midweight crew": "https://www.rei.com/media/e95a1679-4f82-4d6b-b67c-0502c6af70f9.jpg?size=784x588",
  "helly hansen|swift ht gloves": "https://www.rei.com/media/7ea4c6a0-efc4-43fc-835f-2ce81e0172b1.jpg?size=784x588",
  "lululemon|pace breaker jacket": "/images/items/lululemon-pace-breaker-jacket.jpg",
  "norrona|falketind flex1 pants": "/images/items/norrona-falketind-flex1-pants.jpg",
  "norrona|lofoten gore tex pro jacket": "/images/items/norrona-lofoten-gore-tex-pro-jacket.jpg",
  "outdoor research|stormtracker sensor gloves": "/images/items/outdoor-research-stormtracker-sensor-gloves.png",
  "patagonia|capilene cool lightweight": "https://www.rei.com/media/fd1306e6-96cb-46da-8f06-4ca4eff32420.jpg?size=2000",
  "patagonia|capilene midweight": "/images/items/patagonia-capilene-midweight.png",
  "patagonia|capilene midweight bottoms": "https://www.rei.com/media/cff8a526-16a4-47bc-a88f-d948f8e45fb9.jpg?size=2000",
  "patagonia|capilene midweight liner glove": "https://www.rei.com/media/1ba1dc35-c207-4e7c-91eb-263744daa5d3.jpg?size=784x588",
  "patagonia|capilene thermal weight boot length bottoms": "https://www.rei.com/media/ed65e9ef-fbce-4f9a-a97f-6cb8f4c44bf2.jpg?size=2000",
  "patagonia|das parka": "/images/items/patagonia-das-parka.jpg",
  "patagonia|houdini jacket": "/images/items/patagonia-houdini-jacket.jpg",
  "patagonia|macro puff hoody": "/images/items/patagonia-macro-puff-hoody.jpg",
  "patagonia|merino air balaclava": "/images/items/patagonia-merino-air-balaclava.jpg",
  "patagonia|micro puff hoody": "/images/items/patagonia-micro-puff-hoody.jpg",
  "patagonia|nano air hoody": "https://www.rei.com/media/7c9e4ec6-2f43-4846-ab6d-df8f1c49f4ff.jpg?size=2000",
  "patagonia|snowdrifter jacket": "/images/items/patagonia-snowdrifter-jacket.jpg",
  "patagonia|snowfarer cap": "/images/items/patagonia-snowfarer-cap.jpg",
  "smartwool|thermal merino reversible neck gaiter": "https://www.rei.com/media/ac0bc34a-7e30-4939-97f7-f06dd4996f8e.jpg?size=784x588",
  // Arc'teryx
  "arc teryx|gamma mx hoody": "/images/items/arcteryx-gamma-mx-hoody.jpg",
  "arc teryx|beta ar jacket": "/images/items/arcteryx-beta-ar-jacket.jpg",
  "arc teryx|fission sv gloves": "/images/items/arcteryx-fission-sv-gloves.jpg",
  "arc teryx|venta glove": "/images/items/arcteryx-venta-glove.jpg",
  "arc teryx|rho ltw beanie": "/images/items/arcteryx-rho-ltw-beanie.jpg",
  // Icebreaker
  "icebreaker|merino 260 tech long sleeve crewe": "/images/items/icebreaker-merino-260-tech-long-sleeve-crewe.jpg",
  "icebreaker|merino 260 tech long sleeve half zip": "/images/items/icebreaker-merino-260-tech-long-sleeve-half-zip.jpg",
  "icebreaker|merino 260 tech leggings": "/images/items/icebreaker-merino-260-tech-leggings.jpg",
  "icebreaker|merino 200 oasis long sleeve crewe": "/images/items/icebreaker-merino-200-oasis-long-sleeve-crewe.jpg",
  "icebreaker|merino 200 zoneknit long sleeve half zip": "/images/items/icebreaker-merino-200-zoneknit-long-sleeve-half-zip.jpg",
  "icebreaker|merino 175 everyday long sleeve crewe": "/images/items/icebreaker-merino-175-everyday-long-sleeve-crewe.jpg",
  // Mountain Hardwear
  "mountain hardwear|ghost whisperer 2 jacket": "/images/items/mountain-hardwear-ghost-whisperer-2-jacket.jpg",
  // Black Diamond
  "black diamond|guide glove": "/images/items/black-diamond-guide-glove.jpg",
  "black diamond|guide finger": "/images/items/black-diamond-guide-finger.jpg",
  "black diamond|mercury mitt": "/images/items/black-diamond-mercury-mitt.jpg",
  // Outdoor Research
  "outdoor research|helium rain jacket": "/images/items/outdoor-research-helium-rain-jacket.jpg",
  "outdoor research|ferrosi hoodie": "/images/items/outdoor-research-ferrosi-hoodie.png",
  "outdoor research|ferrosi joggers": "/images/items/outdoor-research-ferrosi-joggers.png",
  "outdoor research|snowcrew jacket": "/images/items/outdoor-research-snowcrew-jacket.png",
  "outdoor research|carbide jacket": "/images/items/outdoor-research-carbide-jacket.png",
  "outdoor research|carbide bibs": "/images/items/outdoor-research-carbide-bibs.png",
  // Helmets
  "smith|vantage mips": "/images/items/smith-vantage-mips.jpg",
  "giro|range mips": "/images/items/giro-range-mips.jpg",
  // OGL recommended items
  "arc teryx|gamma hoody": "/images/items/arcteryx-gamma-hoody.jpg",
  "arc teryx|rush jacket": "/images/items/arcteryx-rush-jacket.jpg",
  "arc teryx|sabre pant": "/images/items/arcteryx-sabre-pant.jpg",
  "rab|nebitron pro insulated": "/images/items/rab-nebitron-pro-insulated.jpg",
  "rab|borealis": "/images/items/rab-borealis.jpg",
  "rab|neutrino pro": "/images/items/rab-neutrino-pro.png",
  "the north face|summit breithorn hoodie": "/images/items/the-north-face-summit-breithorn-hoodie.png",
  "obermeyer|raze jacket": "/images/items/obermeyer-raze-jacket.png",
  "smith|method pro mips": "/images/items/smith-method-pro-mips.png",
  "giro|ratio mips": "/images/items/giro-ratio-mips.webp",
  "patagonia|r1 air full zip hoody": "/images/items/patagonia-r1-air-full-zip-hoody.png",
  "patagonia|r1 techface jacket": "/images/items/patagonia-r1-techface-jacket.png",
  "hestra|ergo grip active": "/images/items/hestra-ergo-grip-active.png",
  "patagonia|wind shield pants": "/images/items/patagonia-wind-shield-pants.png",
};

function isItemType(value: string | null): value is ItemType {
  return value === "garment" || value === "handwear" || value === "headwear";
}

function normalizeMediaKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDirectItemImageUrl(brand: string, modelName: string): string | undefined {
  const key = `${normalizeMediaKey(brand)}|${normalizeMediaKey(modelName)}`;
  return DIRECT_ITEM_IMAGE_BY_KEY[key];
}

function formatTypeLabel(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface ItemData {
  brand: string;
  modelName: string;
  typeLabel: string;
  garmentType?: string;
  hoodType?: string;
  category?: string;
  handwearType?: string;
  headwearType?: string;
}

async function getItemData(itemType: ItemType, itemId: string): Promise<ItemData | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const table = TABLE_BY_ITEM_TYPE[itemType];

  if (itemType === "garment") {
    const { data } = await supabase
      .from(table)
      .select("brand, model_name, category, garment_type, hood_type")
      .eq("id", itemId)
      .maybeSingle();

    if (!data || typeof data !== "object") return null;
    const payload = data as { brand?: unknown; model_name?: unknown; category?: unknown; garment_type?: unknown; hood_type?: unknown };
    return {
      brand: typeof payload.brand === "string" ? payload.brand : "",
      modelName: typeof payload.model_name === "string" ? payload.model_name : "Garment",
      typeLabel: formatTypeLabel(typeof payload.category === "string" ? payload.category : undefined, "Garment"),
      garmentType: typeof payload.garment_type === "string" ? payload.garment_type : undefined,
      hoodType: typeof payload.hood_type === "string" ? payload.hood_type : undefined,
      category: typeof payload.category === "string" ? payload.category : undefined,
    };
  }

  if (itemType === "handwear") {
    const { data } = await supabase
      .from(table)
      .select("brand, model_name, handwear_type")
      .eq("id", itemId)
      .maybeSingle();

    if (!data || typeof data !== "object") return null;
    const payload = data as { brand?: unknown; model_name?: unknown; handwear_type?: unknown };
    return {
      brand: typeof payload.brand === "string" ? payload.brand : "",
      modelName: typeof payload.model_name === "string" ? payload.model_name : "Handwear",
      typeLabel: formatTypeLabel(typeof payload.handwear_type === "string" ? payload.handwear_type : undefined, "Handwear"),
      handwearType: typeof payload.handwear_type === "string" ? payload.handwear_type : undefined,
    };
  }

  const { data } = await supabase
    .from(table)
    .select("brand, model_name, headwear_type")
    .eq("id", itemId)
    .maybeSingle();

  if (!data || typeof data !== "object") return null;
  const payload = data as { brand?: unknown; model_name?: unknown; headwear_type?: unknown };
  return {
    brand: typeof payload.brand === "string" ? payload.brand : "",
    modelName: typeof payload.model_name === "string" ? payload.model_name : "Headwear",
    typeLabel: formatTypeLabel(typeof payload.headwear_type === "string" ? payload.headwear_type : undefined, "Headwear"),
    headwearType: typeof payload.headwear_type === "string" ? payload.headwear_type : undefined,
  };
}

function getSilhouetteImage(itemType: ItemType, data: ItemData): string {
  if (itemType === "headwear") {
    return data.headwearType === "ski_helmet"
      ? "/images/silhouettes/ski-helmet.png"
      : "/images/silhouettes/beanie.png";
  }

  if (itemType === "handwear") {
    const light = ["liner_glove", "light_glove"];
    const mittens = ["mitten", "lobster_mitten", "shell_overmitten"];
    const hwt = data.handwearType ?? "";
    if (light.includes(hwt)) return "/images/silhouettes/gloves-lightweight.png";
    if (mittens.includes(hwt)) return "/images/silhouettes/mittens.png";
    return "/images/silhouettes/gloves-heavy.png";
  }

  // Garments
  const gt = data.garmentType;
  const hood = data.hoodType;
  const cat = data.category;

  if (gt === "vest") return "/images/silhouettes/vest.png";
  if (gt === "shorts") return "/images/silhouettes/shorts.png";
  if (gt === "bib") return "/images/silhouettes/ski-bibs.png";
  if (gt === "top_short_sleeve" || gt === "top_sleeveless")
    return "/images/silhouettes/short-sleeve-shirt.png";

  if (gt === "pants") {
    const heavy = ["hard_shell", "outer_insulated"];
    return heavy.includes(cat ?? "")
      ? "/images/silhouettes/heavy-ski-pants.png"
      : "/images/silhouettes/lightweight-legs.png";
  }

  if (gt === "jacket" || gt === "one_piece") {
    const hasHood = hood && hood !== "none";
    return hasHood
      ? "/images/silhouettes/hooded-jacket.png"
      : "/images/silhouettes/jacket-no-hood.png";
  }

  if (gt === "top_long_sleeve") {
    return cat === "base_layer"
      ? "/images/silhouettes/base-layer-top.png"
      : "/images/silhouettes/pullover-no-hood.png";
  }

  // Default: hooded jacket silhouette
  return "/images/silhouettes/hooded-jacket.png";
}

/** Resolves a product image: redirects to a direct product photo or a category silhouette. */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const itemTypeParam = searchParams.get("item_type");
  const itemId = searchParams.get("item_id");

  const itemType: ItemType = isItemType(itemTypeParam) ? itemTypeParam : "garment";
  const fallback: ItemData = {
    brand: searchParams.get("brand") || "",
    modelName: searchParams.get("model") || "Gear Item",
    typeLabel: searchParams.get("category") || "Layer",
  };

  let data = fallback;

  if (isItemType(itemTypeParam) && itemId) {
    const fetched = await getItemData(itemTypeParam, itemId);
    if (fetched) {
      data = fetched;
    }
  }

  const directUrl = getDirectItemImageUrl(data.brand, data.modelName);
  if (directUrl) {
    const redirectTarget = directUrl.startsWith("/")
      ? new URL(directUrl, request.nextUrl.origin)
      : directUrl;
    const response = NextResponse.redirect(redirectTarget, 307);
    response.headers.set("Cache-Control", "public, max-age=604800, s-maxage=604800");
    return response;
  }

  const silhouettePath = getSilhouetteImage(itemType, data);
  const silhouetteUrl = new URL(silhouettePath, request.nextUrl.origin);
  const response = NextResponse.redirect(silhouetteUrl, 307);
  response.headers.set("Cache-Control", "public, max-age=604800, s-maxage=604800");
  return response;
}
