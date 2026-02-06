"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BodyPart, BODY_PARTS, LayerType, makeItemMappingKey } from "@/types/wardrobe";
import { layerOptions } from "@/data/layerOptions";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BODY_PART_LABELS: Record<BodyPart, string> = {
  torso: "Torso",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head & Neck",
};

const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  base: "Base Layer",
  mid: "Mid Layer",
  outer: "Outer Layer",
};

interface EditingState {
  bodyPart: BodyPart;
  layerType: LayerType;
  standardOption: string;
  value: string;
}

interface ItemRowProps {
  standardOption: string;
  customName: string | undefined;
  onClick: () => void;
  onClear: () => void;
}

function ItemRow({ standardOption, customName, onClick, onClear }: ItemRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-accent/50",
        customName ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-border"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 min-w-[120px] shrink-0">
        <span className="text-sm text-muted-foreground">{standardOption}</span>
        <span className="text-muted-foreground/50">→</span>
      </div>
      <span
        className={cn(
          "text-sm flex-1 truncate",
          customName ? "text-primary font-medium" : "text-muted-foreground/60 italic"
        )}
      >
        {customName || "Not set"}
      </span>
      {customName && (
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

interface ItemMappingEditorProps {
  userId: string | null;
  mappings: Map<string, string>;
  onUpdate: (
    bodyPart: BodyPart,
    layerType: LayerType,
    standardOption: string,
    customName: string
  ) => Promise<void>;
  onDelete: (
    bodyPart: BodyPart,
    layerType: LayerType,
    standardOption: string
  ) => Promise<void>;
}

export function ItemMappingEditor({
  userId,
  mappings,
  onUpdate,
  onDelete,
}: ItemMappingEditorProps) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<BodyPart>>(new Set(["torso"]));

  const toggleSection = (bodyPart: BodyPart) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(bodyPart)) {
        next.delete(bodyPart);
      } else {
        next.add(bodyPart);
      }
      return next;
    });
  };

  const handleItemClick = (bodyPart: BodyPart, layerType: LayerType, standardOption: string) => {
    const key = makeItemMappingKey(bodyPart, layerType, standardOption);
    setEditing({
      bodyPart,
      layerType,
      standardOption,
      value: mappings.get(key) || "",
    });
  };

  const handleSave = async () => {
    if (!editing || !editing.value.trim()) return;

    setSaving(true);
    try {
      await onUpdate(editing.bodyPart, editing.layerType, editing.standardOption, editing.value.trim());
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => setEditing(null);

  if (!userId) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <p className="text-amber-700 text-sm">Log in to customize your gear items.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {BODY_PARTS.map((bodyPart) => {
          const options = layerOptions[bodyPart];
          const layerTypes = Object.keys(options) as LayerType[];
          const isOpen = openSections.has(bodyPart);

          // Count configured items for this body part
          const configuredCount = layerTypes.reduce((count, layerType) => {
            const items = (options as Record<string, readonly string[]>)[layerType] || [];
            return count + items.filter((item) => mappings.has(makeItemMappingKey(bodyPart, layerType, item))).length;
          }, 0);

          return (
            <Collapsible key={bodyPart} open={isOpen} onOpenChange={() => toggleSection(bodyPart)}>
              <Card>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{BODY_PART_LABELS[bodyPart]}</span>
                      {configuredCount > 0 && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {configuredCount} set
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 flex flex-col gap-4">
                    {layerTypes.map((layerType) => {
                      const items = (options as Record<string, readonly string[]>)[layerType];
                      if (!items?.length) return null;

                      return (
                        <div key={layerType} className="flex flex-col gap-2">
                          <h5 className="text-sm font-medium text-muted-foreground">
                            {LAYER_TYPE_LABELS[layerType]}
                          </h5>
                          <div className="grid gap-2">
                            {items.map((standardOption) => {
                              const key = makeItemMappingKey(bodyPart, layerType, standardOption);
                              const customName = mappings.get(key);

                              return (
                                <ItemRow
                                  key={standardOption}
                                  standardOption={standardOption}
                                  customName={customName}
                                  onClick={() => handleItemClick(bodyPart, layerType, standardOption)}
                                  onClear={() => onDelete(bodyPart, layerType, standardOption)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Custom Name</DialogTitle>
            <DialogDescription>
              Replace &quot;{editing?.standardOption}&quot; with your own gear name.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={editing?.value || ""}
            onChange={(e) => setEditing(editing ? { ...editing, value: e.target.value } : null)}
            placeholder="Enter your item name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && editing?.value.trim()) handleSave();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !editing?.value.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
