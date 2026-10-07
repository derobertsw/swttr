"use client";

import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BODY_PART_LABELS,
  LAYER_LABELS,
  applyItemMappings,
  hasAnyLayers,
  type BodyPart,
  type LayerSet,
  type LayerType,
} from "@/lib/layers";
import { LayerItems } from "./LayerItems";
import type { BodyPartEvaluation } from "@/types/biophysics";

const LAYER_TYPES: LayerType[] = ["base", "mid", "outer"];

interface BodyPartSectionProps {
  bodyPart: BodyPart;
  layers: LayerSet;
  currentClo: number | undefined;
  targetClo: number | undefined;
  /** Actual vs target, from the layer evaluation. */
  status?: BodyPartEvaluation["status"];
  /** Wardrobe names for general guidance's standard items. */
  itemMappings?: Map<string, string>;
  /** General guidance: nothing evaluates edits, so there's no Change. */
  readOnly?: boolean;
  otherPhaseLayers?: LayerSet;
  syncLabel?: string;
  onItemTap: (layerType: LayerType, index: number) => void;
  onItemRemove: (layerType: LayerType, index: number) => void;
  onAddLayer: (layerType: LayerType) => void;
  onSyncFromOtherPhase?: (layerType: LayerType) => void;
  onMoveItem?: (fromLayerType: LayerType, fromIndex: number, toLayerType: LayerType) => void;
}

/**
 * One body area of the outfit: what's worn there, layer by layer. Change
 * opens the area's editing controls, including its empty layers.
 */
export function BodyPartSection({
  bodyPart,
  layers,
  currentClo,
  targetClo,
  status,
  itemMappings,
  readOnly,
  otherPhaseLayers,
  syncLabel,
  onItemTap,
  onItemRemove,
  onAddLayer,
  onSyncFromOtherPhase,
  onMoveItem,
}: BodyPartSectionProps) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const label = BODY_PART_LABELS[bodyPart];
  const isEditing = editing && !readOnly;

  const wornItems = LAYER_TYPES.flatMap((layerType) => {
    const items = layers[layerType] ?? [];
    const shown = readOnly && itemMappings ? applyItemMappings(items, bodyPart, layerType, itemMappings) : items;
    return shown.map((item, index) => ({ item, layerType, key: `${layerType}:${item.sourceId || item.name}-${index}` }));
  });

  return (
    <section aria-labelledby={headingId} className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h4 id={headingId} className="text-base font-semibold text-foreground">
          {label}
        </h4>
        {!readOnly && (
          <Button
            type="button"
            variant={isEditing ? "secondary" : "outline"}
            size="sm"
            aria-expanded={isEditing}
            aria-label={`${isEditing ? "Done changing" : "Change"} ${label.toLowerCase()}`}
            onClick={() => setEditing((prev) => !prev)}
          >
            {isEditing ? "Done" : "Change"}
          </Button>
        )}
      </div>

      {status === "under" && (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-warning">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          Needs more warmth
        </p>
      )}

      {isEditing ? (
        <div className="mt-3 flex flex-col gap-3">
          {targetClo !== undefined && currentClo !== undefined && (
            <div className="flex flex-wrap gap-1.5">
              <Badge size="sm" variant="neutral" className="tabular-nums">
                Target {targetClo.toFixed(1)} clo
              </Badge>
              <Badge
                size="sm"
                variant={status === "in_range" ? "success" : status ? "warning" : "outline"}
                className="tabular-nums"
              >
                Actual {currentClo.toFixed(1)} clo
              </Badge>
            </div>
          )}
          <ul className="flex flex-col gap-3">
            <LayerItems
              layers={layers}
              bodyPart={bodyPart}
              otherPhaseLayers={otherPhaseLayers}
              syncLabel={syncLabel}
              onItemTap={onItemTap}
              onItemRemove={onItemRemove}
              onAddLayer={onAddLayer}
              onSyncFromOtherPhase={onSyncFromOtherPhase}
              onMoveItem={onMoveItem}
            />
          </ul>
        </div>
      ) : hasAnyLayers(layers) ? (
        <ul className="mt-2 flex flex-col gap-2">
          {wornItems.map(({ item, layerType, key }) => (
            <li key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="w-12 shrink-0 text-sm text-muted-foreground">{LAYER_LABELS[layerType]}</span>
              <span className="min-w-0 flex-1 basis-40 text-base font-medium text-foreground [overflow-wrap:anywhere]">
                {item.name}
                {item.isRecommended && (
                  <Badge size="sm" variant="outline" className="ml-2 align-middle font-medium">
                    Not in your wardrobe
                  </Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          {readOnly ? "Nothing needed here at this temperature." : "Nothing worn here."}
        </p>
      )}
    </section>
  );
}
