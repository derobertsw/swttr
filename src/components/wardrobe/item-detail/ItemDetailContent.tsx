import { WardrobeItem } from "@/types/wardrobe";
import { GarmentDetails } from "./GarmentDetails";
import { HandwearDetails } from "./HandwearDetails";
import { HeadwearDetails } from "./HeadwearDetails";
import { getWardrobeMediaRef, resolveItemImageUrl, resolveBrandLogoUrl, toCssBackgroundImage, getBrandInitials } from "../media";

export function ItemDetailContent({ item }: { item: WardrobeItem }) {
  const media = getWardrobeMediaRef(item);
  const itemImageUrl = resolveItemImageUrl(media);
  const brandLogoUrl = resolveBrandLogoUrl(media);
  const brand = item.details.brand || "Unknown brand";

  return (
    <div className="flex w-full flex-col gap-3 pb-2">
      {/* Catalog photos have white backgrounds, so the image well stays white
          in both appearances. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card border border-border bg-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: toCssBackgroundImage(itemImageUrl) }}
        />
        <div
          className="absolute top-3 left-3 flex h-10 w-24 items-center justify-center overflow-hidden rounded-control border border-black/10 bg-white px-2 shadow-sm"
          title={brand}
          aria-label={`${brand} logo`}
        >
          <span className="pointer-events-none text-[10px] font-semibold tracking-[0.14em] text-slate-700 uppercase">
            {getBrandInitials(brand)}
          </span>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-white bg-contain bg-center bg-no-repeat p-1.5"
            style={{ backgroundImage: toCssBackgroundImage(brandLogoUrl) }}
          />
        </div>
      </div>

      {item.item_type === "garment" && <GarmentDetails details={item.details} />}
      {item.item_type === "handwear" && <HandwearDetails details={item.details} />}
      {item.item_type === "headwear" && <HeadwearDetails details={item.details} />}
    </div>
  );
}
