import { WardrobeItem } from "@/types/wardrobe";
import { CategoryBadge } from "./CategoryBadge";
import { GarmentDetails } from "./GarmentDetails";
import { HandwearDetails } from "./HandwearDetails";
import { HeadwearDetails } from "./HeadwearDetails";

export function ItemDetailContent({ item }: { item: WardrobeItem }) {
  const category =
    item.details.category ||
    item.details.handwear_type ||
    item.details.headwear_type ||
    "";

  return (
    <div className="flex flex-col gap-3 pb-2">
      {category && <CategoryBadge category={category} />}

      {item.item_type === "garment" && <GarmentDetails details={item.details} />}
      {item.item_type === "handwear" && <HandwearDetails details={item.details} />}
      {item.item_type === "headwear" && <HeadwearDetails details={item.details} />}
    </div>
  );
}
