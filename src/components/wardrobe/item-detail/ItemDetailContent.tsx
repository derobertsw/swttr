import { WardrobeItem } from "@/types/wardrobe";
import { CategoryBadge } from "./CategoryBadge";
import { GarmentDetails } from "./GarmentDetails";
import { HandwearDetails } from "./HandwearDetails";
import { HeadwearDetails } from "./HeadwearDetails";
import { getWardrobeMediaRef, resolveItemImageUrl, resolveBrandLogoUrl, toCssBackgroundImage, getBrandInitials } from "../media";
import { getItemIcon } from "../wardrobe-utils";

export function ItemDetailContent({ item }: { item: WardrobeItem }) {
  const category =
    item.details.category ||
    item.details.handwear_type ||
    item.details.headwear_type ||
    "";
  const media = getWardrobeMediaRef(item);
  const itemImageUrl = resolveItemImageUrl(media);
  const brandLogoUrl = resolveBrandLogoUrl(media);
  const brand = item.details.brand || "Unknown brand";
  const Icon = getItemIcon(item.item_type, item.details.garment_type, item.details.category);

  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-300/40 bg-[linear-gradient(145deg,rgba(241,248,253,0.95),rgba(211,226,236,0.82))]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: toCssBackgroundImage(itemImageUrl) }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(165deg,rgba(255,255,255,0.28),rgba(15,23,42,0.12))]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.38),transparent_52%)]"
        />
        <Icon className="absolute bottom-3 right-3 size-8 text-slate-700/60" />
        <div
          className="absolute top-3 left-3 flex h-10 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-300/50 bg-white/85 px-2 shadow-md backdrop-blur-sm"
          title={brand}
          aria-label={`${brand} logo`}
        >
          <span className="pointer-events-none text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-700/72">
            {getBrandInitials(brand)}
          </span>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-contain bg-center bg-no-repeat p-1.5"
            style={{ backgroundImage: toCssBackgroundImage(brandLogoUrl) }}
          />
        </div>
      </div>

      {category && <CategoryBadge category={category} />}

      {item.item_type === "garment" && <GarmentDetails details={item.details} />}
      {item.item_type === "handwear" && <HandwearDetails details={item.details} />}
      {item.item_type === "headwear" && <HeadwearDetails details={item.details} />}
    </div>
  );
}
