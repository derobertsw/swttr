"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BodyPart, BODY_PARTS, LayerType } from "@/types/wardrobe";
import { layerOptions } from "@/data/layerOptions";
import { Pencil, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function ItemMappingEditor({
  userId,
  mappings,
  onUpdate,
  onDelete,
}: ItemMappingEditorProps) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);

  const getMappingKey = (
    bodyPart: BodyPart,
    layerType: LayerType,
    option: string
  ) => `${bodyPart}:${layerType}:${option}`;

  const handleEdit = (
    bodyPart: BodyPart,
    layerType: LayerType,
    standardOption: string
  ) => {
    const key = getMappingKey(bodyPart, layerType, standardOption);
    const currentValue = mappings.get(key) || "";
    setEditing({
      bodyPart,
      layerType,
      standardOption,
      value: currentValue,
    });
  };

  const handleSave = async () => {
    if (!editing || !editing.value.trim()) return;

    setSaving(true);
    try {
      await onUpdate(
        editing.bodyPart,
        editing.layerType,
        editing.standardOption,
        editing.value.trim()
      );
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (
    bodyPart: BodyPart,
    layerType: LayerType,
    standardOption: string
  ) => {
    await onDelete(bodyPart, layerType, standardOption);
  };

  const handleCancel = () => {
    setEditing(null);
  };

  if (!userId) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <p className="text-amber-700 text-sm">
            Log in to customize your gear items.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {BODY_PARTS.map((bodyPart) => {
        const options = layerOptions[bodyPart];
        const layerTypes = Object.keys(options) as LayerType[];

        return (
          <Card key={bodyPart}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{BODY_PART_LABELS[bodyPart]}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {layerTypes.map((layerType) => {
                const items = (options as Record<string, readonly string[]>)[
                  layerType
                ];
                if (!items || items.length === 0) return null;

                return (
                  <div key={layerType} className="flex flex-col gap-2">
                    <h5 className="text-sm font-medium text-muted-foreground">
                      {LAYER_TYPE_LABELS[layerType]}
                    </h5>

                    <div className="grid gap-2">
                      {items.map((standardOption) => {
                        const key = getMappingKey(
                          bodyPart,
                          layerType,
                          standardOption
                        );
                        const customName = mappings.get(key);
                        const isEditing =
                          editing?.bodyPart === bodyPart &&
                          editing?.layerType === layerType &&
                          editing?.standardOption === standardOption;

                        return (
                          <div
                            key={standardOption}
                            className={cn(
                              "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2.5 rounded-lg border transition-colors",
                              customName
                                ? "bg-primary/5 border-primary/20"
                                : "bg-muted/50 border-border"
                            )}
                          >
                            <div className="flex items-center gap-2 sm:min-w-[140px] sm:shrink-0">
                              <span className="text-sm text-muted-foreground">
                                {standardOption}
                              </span>
                              <span className="text-muted-foreground/50 hidden sm:inline">→</span>
                            </div>

                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  value={editing.value}
                                  onChange={(e) =>
                                    setEditing({
                                      ...editing,
                                      value: e.target.value,
                                    })
                                  }
                                  placeholder="Enter your item name"
                                  className="h-8 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSave();
                                    if (e.key === "Escape") handleCancel();
                                  }}
                                />
                                <Button
                                  size="icon-xs"
                                  onClick={handleSave}
                                  disabled={saving || !editing.value.trim()}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon-xs"
                                  variant="outline"
                                  onClick={handleCancel}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span
                                  className={cn(
                                    "text-sm flex-1 truncate",
                                    customName
                                      ? "text-primary font-medium"
                                      : "text-muted-foreground/60 italic"
                                  )}
                                >
                                  {customName || "Not set"}
                                </span>
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  onClick={() =>
                                    handleEdit(bodyPart, layerType, standardOption)
                                  }
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {customName && (
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    onClick={() =>
                                      handleClear(
                                        bodyPart,
                                        layerType,
                                        standardOption
                                      )
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
