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

function getSilhouetteImage(itemType: ItemType, data: ItemData): string | undefined {
  if (itemType === "headwear") {
    if (!data.headwearType) return undefined;
    return data.headwearType === "ski_helmet"
      ? "/images/silhouettes/ski-helmet.png"
      : "/images/silhouettes/beanie.png";
  }

  if (itemType === "handwear") {
    const light = ["liner_glove", "light_glove"];
    const mittens = ["mitten", "lobster_mitten", "shell_overmitten"];
    const hwt = data.handwearType ?? "";
    if (!hwt) return undefined;
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

  return undefined;
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

/** Resolves a product image: redirects to a direct photo, a category silhouette, or returns a generated SVG placeholder. */
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
  if (silhouettePath) {
    const silhouetteUrl = new URL(silhouettePath, request.nextUrl.origin);
    const response = NextResponse.redirect(silhouetteUrl, 307);
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
