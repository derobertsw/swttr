import { LayerSet, LayerItem, BodyPart, LayerType, LAYER_LABELS, applyItemMappings } from "@/lib/layers";

interface LayerItemsProps {
  layers: LayerSet;
  bodyPart: BodyPart;
  biophysicsActive: boolean;
  itemMappings?: Map<string, string>;
}

interface LayerItemDisplayProps {
  item: LayerItem;
}

function LayerItemDisplay({ item }: LayerItemDisplayProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-900 font-medium">{item.name}</span>
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
  return (
    <li className="flex flex-col gap-1">
      <span className="text-xs uppercase text-slate-900/60 tracking-wide">{label}</span>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <LayerItemDisplay key={`${item.name}-${index}`} item={item} />
        ))}
      </div>
    </li>
  );
}

/**
 * Displays garment layers (base, mid, outer) for a body part
 */
export function LayerItems({ layers, bodyPart, biophysicsActive, itemMappings }: LayerItemsProps) {
  const getDisplayItems = (items: LayerItem[], layerType: LayerType): LayerItem[] => {
    if (biophysicsActive || !itemMappings) {
      return items;
    }
    return applyItemMappings(items, bodyPart, layerType, itemMappings);
  };

  return (
    <>
      {layers.base.length > 0 && (
        <LayerGroup label={LAYER_LABELS.base} items={getDisplayItems(layers.base, "base")} />
      )}
      {layers.mid && layers.mid.length > 0 && (
        <LayerGroup label={LAYER_LABELS.mid} items={getDisplayItems(layers.mid, "mid")} />
      )}
      {layers.outer.length > 0 && (
        <LayerGroup label={LAYER_LABELS.outer} items={getDisplayItems(layers.outer, "outer")} />
      )}
    </>
  );
}
