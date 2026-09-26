"use client";

import { useCallback, useState } from "react";
import type { BodyPart, BodyPartLayers, LayerItem, LayerType } from "@/lib/layers";

/**
 * An editable copy of `initialLayers`. Edits are discarded when the initial
 * layers change in content (a new recommendation), but not when an equal
 * object is rebuilt on re-render.
 */
export function useEditableLayers(initialLayers: BodyPartLayers) {
  const initialKey = JSON.stringify(initialLayers);
  const [state, setState] = useState({ key: initialKey, layers: initialLayers });
  if (state.key !== initialKey) {
    setState({ key: initialKey, layers: initialLayers });
  }
  const layers = state.key === initialKey ? state.layers : initialLayers;

  /** Replace one layer's items; returning the same array leaves state untouched. */
  const updateLayer = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, update: (items: LayerItem[]) => LayerItem[]) => {
      setState((prev) => {
        const existing = prev.layers[bodyPart][layerType] ?? [];
        const next = update(existing);
        if (next === existing) return prev;
        return {
          ...prev,
          layers: {
            ...prev.layers,
            [bodyPart]: { ...prev.layers[bodyPart], [layerType]: next },
          },
        };
      });
    },
    []
  );

  const addItem = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, item: LayerItem) =>
      updateLayer(bodyPart, layerType, (items) => [...items, item]),
    [updateLayer]
  );

  const removeItem = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, index: number) =>
      updateLayer(bodyPart, layerType, (items) =>
        index >= 0 && index < items.length ? items.filter((_, i) => i !== index) : items
      ),
    [updateLayer]
  );

  const replaceItem = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, index: number, item: LayerItem) =>
      updateLayer(bodyPart, layerType, (items) =>
        index >= 0 && index < items.length ? items.map((existing, i) => (i === index ? item : existing)) : items
      ),
    [updateLayer]
  );

  const setLayerItems = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, items: LayerItem[]) =>
      updateLayer(bodyPart, layerType, () => [...items]),
    [updateLayer]
  );

  /** Move an item to another layer type on the same body part. */
  const moveItem = useCallback(
    (bodyPart: BodyPart, fromLayerType: LayerType, fromIndex: number, toLayerType: LayerType) => {
      setState((prev) => {
        const part = prev.layers[bodyPart];
        const item = part[fromLayerType]?.[fromIndex];
        if (!item || fromLayerType === toLayerType) return prev;
        return {
          ...prev,
          layers: {
            ...prev.layers,
            [bodyPart]: {
              ...part,
              [fromLayerType]: (part[fromLayerType] ?? []).filter((_, i) => i !== fromIndex),
              [toLayerType]: [...(part[toLayerType] ?? []), item],
            },
          },
        };
      });
    },
    []
  );

  return { layers, addItem, removeItem, replaceItem, setLayerItems, moveItem };
}
