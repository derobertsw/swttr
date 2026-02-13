import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type ItemType = "garment" | "handwear" | "headwear";

const TABLE_BY_ITEM_TYPE: Record<ItemType, "garments" | "handwear" | "headwear"> = {
  garment: "garments",
  handwear: "handwear",
  headwear: "headwear",
};

const DIRECT_ITEM_IMAGE_BY_KEY: Record<string, string> = {
  "32 degrees|heat midweight crew": "https://www.rei.com/media/e95a1679-4f82-4d6b-b67c-0502c6af70f9.jpg?size=784x588",
  "helly hansen|swift ht gloves": "https://www.rei.com/media/7ea4c6a0-efc4-43fc-835f-2ce81e0172b1.jpg?size=784x588",
  "lululemon|pace breaker jacket": "https://cdn11.bigcommerce.com/s-21x65e8kfn/images/stencil/original/products/78952/421710/PAT1503_1000_1__78149.1746624036.jpg",
  "norrona|falketind flex1 pants": "https://www.campsaver.com/i/978-550-ffffff-no-upscale-q/opplanet-norrona-falketind-flex1-pants-mens-caviar-2xl-1810-20-7718-xxl-av-1.jpg",
  "norrona|lofoten gore tex pro jacket": "https://www.campsaver.com/i/978-550-ffffff-no-upscale-q/opplanet-norrona-lofoten-gore-tex-pro-jacket-mens-caviar-black-extra-large-1006-25-7718-xl-av-1.jpg",
  "outdoor research|stormtracker sensor gloves": "https://www.outdoorresearch.com/cdn/shop/files/3221870001.png?v=1725990413&width=1946",
  "patagonia|capilene cool lightweight": "https://www.rei.com/media/fd1306e6-96cb-46da-8f06-4ca4eff32420.jpg?size=2000",
  "patagonia|capilene midweight": "https://www.cleverhiker.com/wp-content/uploads/2024/01/patagonia-capilene-base-layer.png",
  "patagonia|capilene midweight bottoms": "https://www.rei.com/media/cff8a526-16a4-47bc-a88f-d948f8e45fb9.jpg?size=2000",
  "patagonia|capilene midweight liner glove": "https://www.rei.com/media/1ba1dc35-c207-4e7c-91eb-263744daa5d3.jpg?size=784x588",
  "patagonia|capilene thermal weight boot length bottoms": "https://www.rei.com/media/ed65e9ef-fbce-4f9a-a97f-6cb8f4c44bf2.jpg?size=2000",
  "patagonia|das parka": "https://assets.trailspace.com/assets/3/7/6/15434614/2139.jpg",
  "patagonia|houdini jacket": "https://assets.trailspace.com/assets/d/9/e/15424926/patagonia-houdini-jacket-men-s-.jpg",
  "patagonia|macro puff hoody": "https://assets.trailspace.com/assets/3/8/5/15037317/2907.jpg",
  "patagonia|merino air balaclava": "https://www.patagoniabend.com/cdn/shop/files/balaclava-22501-blk-black-3235268.jpg?v=1758935860&width=1800",
  "patagonia|micro puff hoody": "https://assets.trailspace.com/assets/3/8/b/15434635/2494.jpg",
  "patagonia|nano air hoody": "https://www.rei.com/media/7c9e4ec6-2f43-4846-ab6d-df8f1c49f4ff.jpg?size=2000",
  "patagonia|r1 pullover": "https://www.rei.com/media/e1300ef6-a98f-4853-800f-f6f5d594f7f1.jpg?size=2000",
  "patagonia|snowdrifter jacket": "https://assets.trailspace.com/assets/7/1/1/15251217/patagonia-snowdrifter-jacket-men-s-.jpg",
  "patagonia|snowfarer cap": "https://www.patagoniabend.com/cdn/shop/files/snowfarer-cap-33556-efsu-earlylines-flow-sunken-blue-4521190.jpg?v=1756845115&width=1800",
  "smartwool|thermal merino reversible neck gaiter": "https://www.rei.com/media/ac0bc34a-7e30-4939-97f7-f06dd4996f8e.jpg?size=784x588",
};

function isItemType(value: string | null): value is ItemType {
  return value === "garment" || value === "handwear" || value === "headwear";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function compactLabel(value: string, fallback: string, limit: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3)}...`;
}

function formatTypeLabel(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSilhouette(itemType: ItemType, garmentType?: string): string {
  if (itemType === "garment") {
    if (garmentType === "pants" || garmentType === "shorts" || garmentType === "bib") {
      return "M76 44h44l10 22-10 78h-18l-4-38-4 38H76L66 66z";
    }
    return "M74 44h48l16 24-14 11v56h-18V95h-16v40H72V79L58 68z";
  }
  if (itemType === "handwear") {
    return "M98 46h18v18h12c8 0 14 6 14 14v16c0 6-3 10-8 13l-7 4v18H82V66c0-12 7-20 16-20z";
  }
  return "M58 86c0-26 21-48 48-48s48 22 48 48H58z M72 86h68v18H72z";
}

interface ItemData {
  brand: string;
  modelName: string;
  typeLabel: string;
  garmentType?: string;
}

async function getItemData(itemType: ItemType, itemId: string): Promise<ItemData | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const table = TABLE_BY_ITEM_TYPE[itemType];

  if (itemType === "garment") {
    const { data } = await supabase
      .from(table)
      .select("brand, model_name, category, garment_type")
      .eq("id", itemId)
      .maybeSingle();

    if (!data || typeof data !== "object") return null;
    const payload = data as { brand?: unknown; model_name?: unknown; category?: unknown; garment_type?: unknown };
    return {
      brand: typeof payload.brand === "string" ? payload.brand : "",
      modelName: typeof payload.model_name === "string" ? payload.model_name : "Garment",
      typeLabel: formatTypeLabel(typeof payload.category === "string" ? payload.category : undefined, "Garment"),
      garmentType: typeof payload.garment_type === "string" ? payload.garment_type : undefined,
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
  };
}

function getPalette(itemType: ItemType): { start: string; end: string; accent: string } {
  if (itemType === "handwear") {
    return { start: "#0b3a36", end: "#115e59", accent: "#99f6e4" };
  }
  if (itemType === "headwear") {
    return { start: "#1f3354", end: "#334e78", accent: "#bfdbfe" };
  }
  return { start: "#3f2a16", end: "#5b3a1a", accent: "#fde68a" };
}

function buildSvg(itemType: ItemType, data: ItemData): string {
  const palette = getPalette(itemType);
  const title = escapeXml(compactLabel(data.modelName, "Gear Item", 22));
  const subtitle = escapeXml(compactLabel(data.typeLabel, "Layer", 22));
  const silhouette = getSilhouette(itemType, data.garmentType);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.start}"/>
      <stop offset="100%" stop-color="${palette.end}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="240" height="240" rx="24" fill="url(#bg)"/>
  <rect x="14" y="14" width="212" height="212" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.24)"/>
  <path d="${silhouette}" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.55)" stroke-width="4" stroke-linejoin="round"/>
  <path d="M26 182L214 182" stroke="${palette.accent}" stroke-opacity="0.75" stroke-width="3" stroke-linecap="round"/>
  <text x="24" y="206" fill="white" font-size="18" font-family="ui-sans-serif, system-ui" font-weight="700">${title}</text>
  <text x="24" y="224" fill="rgba(255,255,255,0.85)" font-size="12" font-family="ui-sans-serif, system-ui" letter-spacing="0.06em">${subtitle}</text>
</svg>`;
}

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
    const response = NextResponse.redirect(directUrl, 307);
    response.headers.set("Cache-Control", "public, max-age=604800, s-maxage=604800");
    return response;
  }

  return new NextResponse(buildSvg(itemType, data), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, s-maxage=604800",
    },
  });
}
