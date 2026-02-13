import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type ItemType = "garment" | "handwear" | "headwear";

const TABLE_BY_ITEM_TYPE: Record<ItemType, "garments" | "handwear" | "headwear"> = {
  garment: "garments",
  handwear: "handwear",
  headwear: "headwear",
};

const BRAND_LOGO_BY_KEY: Record<string, string> = {
  "32 degrees": "https://wjm.s3.amazonaws.com/stylecareers/uploads/Shorta.jpg",
  "arc teryx": "https://upload.wikimedia.org/wikipedia/en/thumb/7/72/ARC%27TERYX_logo.svg/250px-ARC%27TERYX_logo.svg.png",
  "black diamond": "https://upload.wikimedia.org/wikipedia/commons/d/d2/Black_Diamond_logo.png",
  "helly hansen": "https://upload.wikimedia.org/wikipedia/commons/3/33/Hellyhansen_logo.png",
  lululemon: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Lululemon_Athletica_logo.svg/240px-Lululemon_Athletica_logo.svg.png",
  norrona: "/media/brands/norrona.svg",
  "outdoor research": "https://upload.wikimedia.org/wikipedia/en/thumb/1/1e/Outdoor_Research_logo.png/250px-Outdoor_Research_logo.png",
  patagonia: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Patagonia_%28Unternehmen%29_logo.svg/640px-Patagonia_%28Unternehmen%29_logo.svg.png",
  smartwool: "https://upload.wikimedia.org/wikipedia/en/thumb/2/25/Smartwool_logo.svg/250px-Smartwool_logo.svg.png",
};

const PALETTES = [
  { start: "#0f172a", end: "#1e293b", accent: "#22d3ee" },
  { start: "#0f3b3f", end: "#155e63", accent: "#5eead4" },
  { start: "#3f1f3f", end: "#6b2f6f", accent: "#f0abfc" },
  { start: "#3d2a10", end: "#5a3b14", accent: "#facc15" },
  { start: "#1f3a5f", end: "#284e80", accent: "#93c5fd" },
] as const;

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

function hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeBrand(brand: string): string {
  return brand
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 28);
}

function normalizeBrandKey(brand: string): string {
  return brand
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

function getBrandLogoUrl(brand: string): string | undefined {
  return BRAND_LOGO_BY_KEY[normalizeBrandKey(brand)];
}

function getInitials(brand: string): string {
  const words = brand
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "BR";
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words[1][0]}`;
}

async function getBrandFromItem(itemType: ItemType, itemId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const table = TABLE_BY_ITEM_TYPE[itemType];
  const { data } = await supabase
    .from(table)
    .select("brand")
    .eq("id", itemId)
    .maybeSingle();

  if (!data || typeof data !== "object") return null;
  const brand = (data as { brand?: unknown }).brand;
  return typeof brand === "string" && brand.trim() ? brand : null;
}

function buildSvg(brand: string): string {
  const normalized = normalizeBrand(brand || "Brand");
  const safeBrand = escapeXml(normalized);
  const initials = escapeXml(getInitials(normalized));
  const palette = PALETTES[hashText(normalized) % PALETTES.length];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160" role="img" aria-label="${safeBrand} logo">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.start}"/>
      <stop offset="100%" stop-color="${palette.end}"/>
    </linearGradient>
    <linearGradient id="line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0.8"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="319" height="159" rx="22" fill="url(#bg)" stroke="rgba(255,255,255,0.22)"/>
  <path d="M34 116L286 116" stroke="url(#line)" stroke-width="4" stroke-linecap="round"/>
  <circle cx="56" cy="64" r="28" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.24)"/>
  <text x="56" y="71" text-anchor="middle" fill="white" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">${initials}</text>
  <text x="96" y="74" fill="white" font-size="28" font-family="ui-sans-serif, system-ui" font-weight="700" letter-spacing="0.06em">${safeBrand}</text>
</svg>`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const itemTypeParam = searchParams.get("item_type");
  const itemId = searchParams.get("item_id");

  let brand = searchParams.get("brand")?.trim() || "Brand";

  if (isItemType(itemTypeParam) && itemId) {
    const fetchedBrand = await getBrandFromItem(itemTypeParam, itemId);
    if (fetchedBrand) {
      brand = fetchedBrand;
    }
  }

  const logoUrl = getBrandLogoUrl(brand);
  if (logoUrl) {
    const response = NextResponse.redirect(new URL(logoUrl, request.url), 307);
    response.headers.set("Cache-Control", "public, max-age=604800, s-maxage=604800");
    return response;
  }

  return new NextResponse(buildSvg(brand), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, s-maxage=604800",
    },
  });
}
