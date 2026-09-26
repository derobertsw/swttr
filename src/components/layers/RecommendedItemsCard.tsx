"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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

/** Catalog items in the current layers that the user doesn't own yet. */
export function RecommendedItemsCard({ items }: { items: RecommendedItem[] }) {
  const [addedToWardrobe, setAddedToWardrobe] = useState<Set<string>>(new Set());

  if (items.length === 0) return null;

  const handleAdd = async (item: RecommendedItem) => {
    const result = await addToWardrobe(item);
    if (result === "failed") {
      toast.error("Failed to add item to wardrobe");
      return;
    }
    setAddedToWardrobe((prev) => new Set(prev).add(item.sourceId));
    if (result === "added") toast.success(`${item.name} added to your wardrobe`);
    else toast.info(`${item.name} is already in your wardrobe`);
  };

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50/90 px-4 py-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">SWTTR Recommended Items</p>
      <div className="space-y-2">
        {items.map((item) => {
          const wasAdded = addedToWardrobe.has(item.sourceId);
          return (
            <div key={item.sourceId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-950">{item.name}</p>
                <p className="text-[11px] text-amber-800/70">{item.brand}</p>
              </div>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`buy ${item.brand} ${item.name}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md border border-amber-400/60 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100/80"
              >
                Buy it
              </a>
              <button
                type="button"
                disabled={wasAdded}
                onClick={() => void handleAdd(item)}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                  wasAdded
                    ? "border-emerald-400/60 bg-emerald-50 text-emerald-700 cursor-default"
                    : "border-amber-400/60 bg-amber-100/70 text-amber-900 hover:bg-amber-200/80"
                )}
              >
                {wasAdded ? (
                  <span className="flex items-center gap-1">
                    <Check className="size-3" />
                    Added
                  </span>
                ) : (
                  "Add to wardrobe"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
