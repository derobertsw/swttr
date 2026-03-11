import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

type ItemType = "garment" | "handwear" | "headwear";

const TABLE_BY_ITEM_TYPE: Record<ItemType, "garments" | "handwear" | "headwear"> = {
  garment: "garments",
  handwear: "handwear",
  headwear: "headwear",
};

const BRAND_LOGO_BY_KEY: Record<string, string> = {
  "32 degrees": "/media/brands/32degrees.png",
  "arc teryx": "/media/brands/arcteryx.svg",
  "black diamond": "/media/brands/black-diamond.png",
  blackstrap: "/media/brands/blackstrap.png",
  columbia: "/media/brands/columbia.png",
  giro: "/media/brands/giro.png",
  head: "/media/brands/head.png",
  "helly hansen": "/media/brands/helly-hansen.png",
  hestra: "/media/brands/hestra.png",
  icebreaker: "/media/brands/icebreaker.png",
  "mountain hardwear": "/media/brands/mountainhardwear.png",
  norrona: "/media/brands/norrona.png",
  obermeyer: "/media/brands/obermeyer.png",
  lululemon: "/media/brands/lululemon.png",
  "outdoor research": "/media/brands/outdoorresearch.png",
  patagonia: "/media/brands/patagonia-real.svg",
  rab: "/media/brands/rab.png",
  scott: "/media/brands/scott.png",
  smartwool: "/media/brands/smartwool.svg",
  smith: "/media/brands/smith.png",
  "the north face": "/media/brands/thenorthface.png",
  "turtle fur": "/media/brands/turtlefur.png",
  "under armour": "/media/brands/underarmour.png",
  spyder: "/media/brands/spyder.png",
  fjallraven: "/media/brands/fjallraven.png",
  atomic: "/media/brands/atomic.png",
  buff: "/media/brands/buff.png",
  oakley: "/media/brands/oakley.png",
  poc: "/media/brands/poc.png",
  salomon: "/media/brands/salomon.png",
  seirus: "/media/brands/seirus.png",
  "sweet protection": "/media/brands/sweetprotection.png",
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
  const len = safeBrand.length;
  const fontSize = len <= 4 ? 52 : len <= 8 ? 40 : len <= 12 ? 32 : 24;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100" viewBox="0 0 320 100" role="img" aria-label="${safeBrand}">
  <rect width="320" height="100" fill="white"/>
  <text x="160" y="${50 + Math.round(fontSize * 0.35)}" text-anchor="middle" fill="#334155" font-size="${fontSize}" font-family="ui-sans-serif, system-ui" font-weight="600">${safeBrand}</text>
</svg>`;
}

/** Resolves a brand logo: redirects to a local file if mapped, otherwise returns a generated SVG text fallback. */
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
