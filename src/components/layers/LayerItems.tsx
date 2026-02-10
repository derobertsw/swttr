import Link from "next/link";
import { useEffect, useState } from "react";
import { getGenericLayerClo } from "@/data/genericLayerClo";
import { layerOptions } from "@/data/layerOptions";
import { Button } from "@/components/ui/button";
import {
  LayerSet,
  LayerItem,
  BodyPart,
  LayerType,
  BODY_PART_LABELS,
  LAYER_LABELS,
  applyItemMappings,
} from "@/lib/layers";

interface LayerItemsProps {
  layers: LayerSet;
  bodyPart: BodyPart;
  biophysicsActive: boolean;
  itemMappings?: Map<string, string>;
  enableEmptySlots?: boolean;
  onGenericCloChange?: (clo: number) => void;
}

interface LayerItemDisplayProps {
  item: LayerItem;
}

function LayerItemDisplay({ item }: LayerItemDisplayProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-slate-900 font-medium leading-snug">
        {item.name}
        {item.isGeneric && (
          <span className="ml-2 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Generic
          </span>
        )}
      </span>
      {item.rcl !== undefined && (
        <span className="text-xs text-slate-500">{item.rcl.toFixed(2)} clo</span>
      )}
    </div>
  );
}

interface LayerGroupProps {
  label: string;
  items: LayerItem[];
}

function LayerGroup({ label, items }: LayerGroupProps) {
  const hasGenericItem = items.some((item) => item.isGeneric);

  return (
    <li className="flex flex-col gap-1">
      <span className="text-xs uppercase text-slate-900/60 tracking-wide">{label}</span>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <LayerItemDisplay key={`${item.name}-${index}`} item={item} />
        ))}
      </div>
      {hasGenericItem && (
        <Link
          href="/wardrobe"
          className="mt-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Add your actual gear
        </Link>
      )}
    </li>
  );
}

const LAYER_TYPES_BY_BODY_PART: Record<BodyPart, LayerType[]> = {
  torso: ["base", "mid", "outer"],
  legs: ["base", "outer"],
  hands: ["base", "outer"],
  headNeck: ["base", "outer"],
};

const GENERIC_OPTIONS_BY_BODY_PART: Record<BodyPart, Partial<Record<LayerType, readonly string[]>>> = {
  torso: {
    base: layerOptions.torso.base,
    mid: layerOptions.torso.mid,
    outer: layerOptions.torso.outer,
  },
  legs: {
    base: layerOptions.legs.base,
    outer: layerOptions.legs.outer,
  },
  hands: {
    base: layerOptions.hands.base,
    outer: layerOptions.hands.outer,
  },
  headNeck: {
    base: layerOptions.headNeck.base,
    outer: layerOptions.headNeck.outer,
  },
};

type SlotKey = `${BodyPart}:${LayerType}`;

function makeSlotKey(bodyPart: BodyPart, layerType: LayerType): SlotKey {
  return `${bodyPart}:${layerType}`;
}

function getGenericOptions(bodyPart: BodyPart, layerType: LayerType): readonly string[] {
  return GENERIC_OPTIONS_BY_BODY_PART[bodyPart][layerType] ?? [];
}

/**
 * Displays garment layers (base, mid, outer) for a body part
 */
export function LayerItems({
  layers,
  bodyPart,
  biophysicsActive,
  itemMappings,
  enableEmptySlots = true,
  onGenericCloChange,
}: LayerItemsProps) {
  const [genericItemsBySlot, setGenericItemsBySlot] = useState<Partial<Record<SlotKey, LayerItem[]>>>({});
  const [selectedOptionBySlot, setSelectedOptionBySlot] = useState<Partial<Record<SlotKey, string>>>({});

  const layerTypes = LAYER_TYPES_BY_BODY_PART[bodyPart];

  const getDisplayItems = (items: LayerItem[], layerType: LayerType): LayerItem[] => {
    if (biophysicsActive || !itemMappings) {
      return items;
    }
    return applyItemMappings(items, bodyPart, layerType, itemMappings);
  };

  const addGenericItem = (layerType: LayerType) => {
    const options = getGenericOptions(bodyPart, layerType);
    if (options.length === 0) return;

    const slotKey = makeSlotKey(bodyPart, layerType);
    const selectedName = selectedOptionBySlot[slotKey] ?? options[0];
    const selectedClo = getGenericLayerClo(bodyPart, layerType, selectedName);

    setGenericItemsBySlot((prev) => {
      const existing = prev[slotKey] ?? [];
      if (existing.some((item) => item.name === selectedName)) return prev;

      return {
        ...prev,
        [slotKey]: [...existing, { name: selectedName, rcl: selectedClo, isGeneric: true }],
      };
    });
  };

  useEffect(() => {
    if (!onGenericCloChange) return;

    const totalGenericClo = Object.values(genericItemsBySlot).reduce((sum, items) => {
      if (!items) return sum;
      return sum + items.reduce((itemSum, item) => itemSum + (item.rcl ?? 0), 0);
    }, 0);

    onGenericCloChange(totalGenericClo);
  }, [genericItemsBySlot, onGenericCloChange]);

  return (
    <>
      {layerTypes.map((layerType) => {
        const slotKey = makeSlotKey(bodyPart, layerType);
        const recommendedItems = getDisplayItems(layers[layerType] ?? [], layerType);
        const genericItems = genericItemsBySlot[slotKey] ?? [];
        const combinedItems = [...recommendedItems, ...genericItems];

        if (combinedItems.length > 0) {
          return (
            <LayerGroup
              key={slotKey}
              label={LAYER_LABELS[layerType]}
              items={combinedItems}
            />
          );
        }

        if (!enableEmptySlots) {
          return null;
        }

        const genericOptions = getGenericOptions(bodyPart, layerType);
        if (genericOptions.length === 0) {
          return null;
        }

        return (
          <li key={slotKey} className="flex flex-col gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50/80 p-3">
            <span className="text-xs uppercase text-slate-900/60 tracking-wide">{LAYER_LABELS[layerType]}</span>
            <p className="text-sm text-slate-700">
              No {LAYER_LABELS[layerType].toLowerCase()} layer selected yet.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                aria-label={`${BODY_PART_LABELS[bodyPart]} ${LAYER_LABELS[layerType]} generic option`}
                value={selectedOptionBySlot[slotKey] ?? genericOptions[0]}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedOptionBySlot((prev) => ({ ...prev, [slotKey]: value }));
                }}
              >
                {genericOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => addGenericItem(layerType)}>
                Use Generic {LAYER_LABELS[layerType]}
              </Button>
            </div>
            <Link
              href="/wardrobe"
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Add your actual gear
            </Link>
          </li>
        );
      })}
    </>
  );
}
