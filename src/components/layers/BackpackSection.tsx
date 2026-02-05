import { Backpack, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackpackItem } from "@/types/recommendations";

interface BackpackSectionProps {
  items: BackpackItem[];
  onRemoveCustom?: (name: string) => void;
  onHideDefault?: (name: string) => void;
}

export function BackpackSection({ items, onRemoveCustom, onHideDefault }: BackpackSectionProps) {
  if (items.length === 0) return null;

  const handleRemove = (item: BackpackItem) => {
    if (item.isCustom) {
      onRemoveCustom?.(item.name);
    } else {
      onHideDefault?.(item.name);
    }
  };

  return (
    <div className="rounded-lg bg-white/40 backdrop-blur-[2px] p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-800 mb-3">
        <Backpack className="size-4" />
        Backpack
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-900">{item.name}</span>
            {(onRemoveCustom || onHideDefault) && (
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => handleRemove(item)}
              >
                <X className="size-3" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
