"use client";

import { useState } from "react";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { getWardrobeMediaRef, resolveItemImageUrl } from "./media";
import { ItemIcon } from "./wardrobe-utils";

interface ItemImageProps {
  item: WardrobeItem;
  className?: string;
  iconClassName?: string;
}

/** Direct catalog image with an inline icon when the URL is missing or broken. */
export function ItemImage(props: ItemImageProps) {
  const src = resolveItemImageUrl(getWardrobeMediaRef(props.item));
  // Reset a failed image when the item or its photo changes.
  return <ImageOrIcon key={`${props.item.item_type}:${props.item.item_id}:${src}`} {...props} src={src} />;
}

function ImageOrIcon({ item, src, className, iconClassName }: ItemImageProps & { src?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div aria-hidden="true" className={cn("flex items-center justify-center", className)}>
      {src && !failed ? (
        // Catalog URLs load directly, without an image proxy or redirect.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <ItemIcon
          itemType={item.item_type}
          garmentType={item.details.garment_type}
          category={item.details.category}
          className={cn("size-5 text-muted-foreground", iconClassName)}
        />
      )}
    </div>
  );
}
