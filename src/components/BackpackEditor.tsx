"use client";

import { useState } from "react";
import { Plus, X, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackpackItem } from "@/types/recommendations";
import { FROSTED_INPUT, FROSTED_INPUT_FULL } from "@/lib/styling";

interface BackpackEditorProps {
  items: BackpackItem[];
  onAddItem: (name: string) => void;
  onRemoveItem: (name: string) => void;
  onHideDefault: (name: string) => void;
}

export function BackpackEditor({
  items,
  onAddItem,
  onRemoveItem,
  onHideDefault,
}: BackpackEditorProps) {
  const [newItem, setNewItem] = useState("");

  const handleAdd = () => {
    if (newItem.trim()) {
      onAddItem(newItem.trim());
      setNewItem("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (item: BackpackItem) => {
    if (item.isCustom) {
      onRemoveItem(item.name);
    } else {
      onHideDefault(item.name);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <PackagePlus className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/70" />
          <Input
            placeholder="Add custom item..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`pl-10 h-12 ${FROSTED_INPUT_FULL}`}
          />
        </div>
        <Button
          onClick={handleAdd}
          size="icon"
          variant="outline"
          className={`h-12 w-12 ${FROSTED_INPUT} hover:bg-white/30 hover:text-white`}
        >
          <Plus className="size-5" />
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-3 py-4 border border-dashed border-white/20 rounded-lg">
          <PackagePlus className="size-5 text-white/30 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white/50">No items in backpack</div>
            <div className="text-xs text-white/40">Add custom items above</div>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.name}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-3.5"
            >
              <span className="text-sm font-medium">
                {item.name}
                {!item.isCustom && (
                  <span className="ml-2 text-[10px] text-muted-foreground/65 font-normal">
                    default
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 opacity-55 hover:opacity-100 hover:bg-white/10"
                onClick={() => handleRemove(item)}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
