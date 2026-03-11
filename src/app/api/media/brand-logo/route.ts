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
  "arc teryx": "/media/brands/arcteryx.svg",
  "black diamond": "/media/brands/black-diamond.png",
  "helly hansen": "/media/brands/helly-hansen.png",
  hestra: "/media/brands/hestra.svg",
  lululemon: "/media/brands/lululemon.svg",
  norrona: "/media/brands/norrona.svg",
  "outdoor research": "/media/brands/outdoor-research.png",
  patagonia: "/media/brands/patagonia-real.svg",
  smartwool: "/media/brands/smartwool.svg",
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

function buildTextFallback(brand: string): string {
  const safeBrand = escapeXml(brand.trim() || "Brand");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100" viewBox="0 0 320 100" role="img" aria-label="${safeBrand}">
  <rect width="320" height="100" fill="white"/>
  <text x="160" y="56" text-anchor="middle" fill="#334155" font-size="20" font-family="ui-sans-serif, system-ui" font-weight="600">${safeBrand}</text>
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

  return new NextResponse(buildTextFallback(brand), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
