"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackpackItem } from "@/types/recommendations";

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
        <Input
          placeholder="Add item..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button onClick={handleAdd} size="icon" variant="outline">
          <Plus className="size-4" />
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items in backpack</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li
              key={item.name}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2.5"
            >
              <span className="text-sm">
                {item.name}
                {!item.isCustom && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (default)
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => handleRemove(item)}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
