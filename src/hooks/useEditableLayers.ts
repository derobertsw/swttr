"use client";

import { useCallback, useMemo, useState } from "react";
import { BODY_PARTS, type BodyPart, type BodyPartLayers, type LayerItem, type LayerType } from "@/lib/layers";

const LAYER_TYPES: LayerType[] = ["base", "mid", "outer"];

interface EditableState {
  key: string;
  /** The suggested layers, which reset returns to. */
  initial: BodyPartLayers;
  layers: BodyPartLayers;
  /** Earlier layers, most recent last, which undo steps back through. */
  history: BodyPartLayers[];
}

function freshState(key: string, initialLayers: BodyPartLayers): EditableState {
  return { key, initial: initialLayers, layers: initialLayers, history: [] };
}

/** Records `layers` as an undoable edit. */
function withEdit(prev: EditableState, layers: BodyPartLayers): EditableState {
  if (layers === prev.layers) return prev;
  return { ...prev, layers, history: [...prev.history, prev.layers] };
}

function mapItems(layers: BodyPartLayers, update: (item: LayerItem) => LayerItem): BodyPartLayers {
  const next = { ...layers };
  for (const bodyPart of BODY_PARTS) {
    const part = { ...layers[bodyPart] };
    for (const layerType of LAYER_TYPES) {
      const items = part[layerType];
      if (items) part[layerType] = items.map(update);
    }
    next[bodyPart] = part;
  }
  return next;
}

/**
 * An editable copy of `initialLayers`, with undo and reset. Edits are
 * discarded when the initial layers change in content (a new recommendation),
 * but not when an equal object is rebuilt on re-render.
 */
export function useEditableLayers(initialLayers: BodyPartLayers) {
  const initialKey = JSON.stringify(initialLayers);
  const [state, setState] = useState(() => freshState(initialKey, initialLayers));
  if (state.key !== initialKey) {
    setState(freshState(initialKey, initialLayers));
  }
  const current = state.key === initialKey ? state : freshState(initialKey, initialLayers);
  const { layers, initial, history } = current;

  /** Replace one layer's items; returning the same array leaves state untouched. */
  const updateLayer = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, update: (items: LayerItem[]) => LayerItem[]) => {
      setState((prev) => {
        const existing = prev.layers[bodyPart][layerType] ?? [];
        const next = update(existing);
        if (next === existing) return prev;
        return withEdit(prev, {
          ...prev.layers,
          [bodyPart]: { ...prev.layers[bodyPart], [layerType]: next },
        });
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
        return withEdit(prev, {
          ...prev.layers,
          [bodyPart]: {
            ...part,
            [fromLayerType]: (part[fromLayerType] ?? []).filter((_, i) => i !== fromIndex),
            [toLayerType]: [...(part[toLayerType] ?? []), item],
          },
        });
      });
    },
    []
  );

  /** Step back to the layers before the last edit. */
  const undo = useCallback(() => {
    setState((prev) =>
      prev.history.length === 0
        ? prev
        : { ...prev, layers: prev.history[prev.history.length - 1], history: prev.history.slice(0, -1) }
    );
  }, []);

  /** Go back to the suggested layers; undo restores the edits. */
  const reset = useCallback(() => setState((prev) => withEdit(prev, prev.initial)), []);

  /**
   * Stop marking a catalog item as not owned, wherever it's worn, once it's
   * in the wardrobe. Not an edit: undo and reset keep it owned.
   */
  const markOwned = useCallback((sourceId: string) => {
    const owned = (layers: BodyPartLayers) =>
      mapItems(layers, (item) => (item.isRecommended && item.sourceId === sourceId ? { ...item, isRecommended: false } : item));
    setState((prev) => ({
      ...prev,
      initial: owned(prev.initial),
      layers: owned(prev.layers),
      history: prev.history.map(owned),
    }));
  }, []);

  const edited = useMemo(() => JSON.stringify(layers) !== JSON.stringify(initial), [layers, initial]);

  return {
    layers,
    /** The layers differ from the suggested ones. */
    edited,
    canUndo: history.length > 0,
    addItem,
    removeItem,
    replaceItem,
    setLayerItems,
    moveItem,
    undo,
    reset,
    markOwned,
  };
}
