import type { AvailableItem, WardrobeItem } from "@/types/wardrobe";

type ItemType = "garment" | "handwear" | "headwear";

type ItemDetailsWithLegacyMedia = WardrobeItem["details"] & {
  brand_logo?: string;
  logo_url?: string;
  image_url?: string;
  photo_url?: string;
  thumbnail_url?: string;
  item_photo_url?: string;
};

type AvailableItemWithLegacyMedia = AvailableItem & {
  brand_logo?: string;
  logo_url?: string;
  image_url?: string;
  photo_url?: string;
  thumbnail_url?: string;
  item_photo_url?: string;
};

interface MediaRef {
  itemType: ItemType;
  itemId: string;
  brandLogoUrl?: string;
  itemImageUrl?: string;
}

const MEDIA_URL_REVISION = "2026-02-13-logos-v5";

function isLegacyBrandWrapper(url?: string): boolean {
  return typeof url === "string" && url.startsWith("/media/brands/");
}

function isLegacyItemWrapper(url?: string): boolean {
  return typeof url === "string" && url.startsWith("/media/items/");
}

function buildMediaUrl(path: string, itemType: ItemType, itemId: string): string {
  const params = new URLSearchParams({
    item_type: itemType,
    item_id: itemId,
    v: MEDIA_URL_REVISION,
  });
  return `${path}?${params.toString()}`;
}

export function normalizeBrandKey(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getBrandInitials(brand: string): string {
  const words = normalizeBrandKey(brand).split(" ").filter(Boolean);
  if (words.length === 0) return "BR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function toCssBackgroundImage(url?: string): string | undefined {
  if (!url) return undefined;
  return `url("${url.replace(/"/g, '\\"')}")`;
}

export function resolveBrandLogoUrl(media: MediaRef): string {
  if (media.brandLogoUrl && !isLegacyBrandWrapper(media.brandLogoUrl)) {
    return media.brandLogoUrl;
  }
  return buildMediaUrl("/api/media/brand-logo", media.itemType, media.itemId);
}

export function resolveItemImageUrl(media: MediaRef): string {
  if (media.itemImageUrl && !isLegacyItemWrapper(media.itemImageUrl)) {
    return media.itemImageUrl;
  }
  return buildMediaUrl("/api/media/item-image", media.itemType, media.itemId);
}

export function getWardrobeMediaRef(item: WardrobeItem): MediaRef {
  const details = item.details as ItemDetailsWithLegacyMedia;
  return {
    itemType: item.item_type,
    itemId: item.item_id,
    brandLogoUrl: details.brand_logo_url || details.logo_url || details.brand_logo,
    itemImageUrl:
      details.item_image_url ||
      details.image_url ||
      details.photo_url ||
      details.thumbnail_url ||
      details.item_photo_url,
  };
}

export function getAvailableMediaRef(item: AvailableItem): MediaRef {
  const available = item as AvailableItemWithLegacyMedia;
  return {
    itemType: item.type,
    itemId: item.id,
    brandLogoUrl: available.brand_logo_url || available.logo_url || available.brand_logo,
    itemImageUrl:
      available.item_image_url ||
      available.image_url ||
      available.photo_url ||
      available.thumbnail_url ||
      available.item_photo_url,
  };
}
