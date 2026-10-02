"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
    <section aria-labelledby="not-in-wardrobe-heading" className="rounded-lg border border-amber-300/60 bg-amber-50/90 px-4 py-3">
      <h3 id="not-in-wardrobe-heading" className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
        Not in your wardrobe
      </h3>
      <p className="mb-2 mt-0.5 text-xs text-amber-900/80">
        You picked these from the catalog for this outfit. If you own one, add it to your wardrobe so future
        recommendations can use it.
      </p>
      <ul className="space-y-2">
        {items.map((item) => {
          const adding = addingIds.has(item.sourceId);
          return (
            <li key={item.sourceId} className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-950">{item.name}</p>
                <p className="text-[11px] text-amber-800/70">{item.brand}</p>
              </div>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${item.brand} ${item.name}`.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-400/60 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100/80"
              >
                Search for this item
                <span className="sr-only">: {item.name}, opens Google in a new tab</span>
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
              <button
                type="button"
                disabled={adding}
                onClick={() => void handleOwn(item)}
                className={cn(
                  "shrink-0 rounded-md border border-amber-400/60 bg-amber-100/70 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200/80",
                  adding && "cursor-wait opacity-70"
                )}
              >
                {adding ? "Adding..." : "I own this"}
                <span className="sr-only">: {item.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
