"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BodyPart } from "@/lib/layers";

export interface RecommendedItem {
  name: string;
  brand: string;
  sourceId: string;
  bodyPart: BodyPart;
}

async function addToWardrobe(item: RecommendedItem): Promise<"added" | "exists" | "failed"> {
  const itemType = item.bodyPart === "hands" ? "handwear" : item.bodyPart === "headNeck" ? "headwear" : "garment";
  try {
    const res = await fetch("/api/wardrobe/gear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_type: itemType, item_id: item.sourceId }),
    });
    if (res.ok) return "added";
    if (res.status === 409) return "exists";
    return "failed";
  } catch {
    return "failed";
  }
}

/**
 * Catalog items in the current layers that the user doesn't own. Wearing one
 * doesn't add it to the wardrobe; only "I own this" does, and `onOwned` runs
 * once the wardrobe has it.
 */
export function RecommendedItemsCard({
  items,
  onOwned,
}: {
  items: RecommendedItem[];
  onOwned: (item: RecommendedItem) => void;
}) {
  const [addingIds, setAddingIds] = useState<ReadonlySet<string>>(new Set());

  if (items.length === 0) return null;

  const handleOwn = async (item: RecommendedItem) => {
    setAddingIds((prev) => new Set(prev).add(item.sourceId));
    const result = await addToWardrobe(item);
    setAddingIds((prev) => {
      const next = new Set(prev);
      next.delete(item.sourceId);
      return next;
    });
    if (result === "failed") {
      toast.error(`Couldn't add ${item.name} to your wardrobe. Try again.`);
      return;
    }
    if (result === "added") toast.success(`${item.name} added to your wardrobe`);
    else toast.info(`${item.name} is already in your wardrobe`);
    onOwned(item);
  };

  return (
    <Card asChild>
      <section aria-labelledby="not-in-wardrobe-heading">
        <h3 id="not-in-wardrobe-heading" className="text-base font-semibold text-foreground">
          Not in your wardrobe
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You picked these from the catalog for this outfit. If you own one, add it to your wardrobe so future
          recommendations can use it.
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => {
            const adding = addingIds.has(item.sourceId);
            return (
              <li key={item.sourceId} className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-base font-semibold text-foreground">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.brand}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${item.brand} ${item.name}`.trim())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Search for this item
                    <span className="sr-only">: {item.name}, opens Google in a new tab</span>
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled={adding} onClick={() => void handleOwn(item)}>
                  {adding ? "Adding…" : "I own this"}
                  <span className="sr-only">: {item.name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}
