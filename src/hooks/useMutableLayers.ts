import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { BiophysicsRecommendation, RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";
import { LayerSet, LayerItem } from "@/types/recommendations";
import { BodyPart, LayerType } from "@/lib/layers";
import { garmentsToLayerSet, createEmptyLayerSet } from "@/lib/layers";

type MutableLayers = Record<BodyPart, LayerSet>;

const BODY_PARTS: BodyPart[] = ["torso", "legs", "headNeck", "hands"];
const LAYER_TYPES: LayerType[] = ["base", "mid", "outer"];

function sumClo(layers: LayerSet): number {
  let total = 0;
  for (const lt of LAYER_TYPES) {
    const items = layers[lt];
    if (items) {
      for (const item of items) {
        total += item.rcl ?? 0;
      }
    }
  }
  return total;
}

function buildLayersFromData(
  garments: BiophysicsRecommendation["recommendation"]["garments"] | undefined,
  handwear: RecommendedHandwear | null | undefined,
  headwear: RecommendedHeadwear | null | undefined,
): MutableLayers {
  const layers: MutableLayers = {
    torso: garments ? garmentsToLayerSet(garments, "torso") : createEmptyLayerSet(),
    legs: garments ? garmentsToLayerSet(garments, "legs") : createEmptyLayerSet(),
    hands: createEmptyLayerSet(),
    headNeck: createEmptyLayerSet(),
  };

  if (handwear) {
    layers.hands.outer = [{ name: handwear.name, rcl: handwear.rcl, sourceId: handwear.id }];
  }

  if (headwear) {
    const baseItems: LayerItem[] = [];
    if (headwear.head_warmth) {
      baseItems.push({ name: headwear.head_warmth.name, rcl: headwear.head_warmth.rcl, sourceId: headwear.head_warmth.id });
    }
    if (headwear.neck_warmth) {
      baseItems.push({ name: headwear.neck_warmth.name, rcl: headwear.neck_warmth.rcl, sourceId: headwear.neck_warmth.id });
    }
    if (baseItems.length > 0) layers.headNeck.base = baseItems;
    if (headwear.helmet) {
      layers.headNeck.outer = [{ name: headwear.helmet.name, rcl: headwear.helmet.rcl, sourceId: headwear.helmet.id }];
    }
  }

  return layers;
}

function collectInUseIds(layers: MutableLayers): Set<string> {
  const ids = new Set<string>();
  for (const part of BODY_PARTS) {
    for (const lt of LAYER_TYPES) {
      const items = layers[part][lt];
      if (items) {
        for (const item of items) {
          if (item.sourceId) ids.add(item.sourceId);
        }
      }
    }
  }
  return ids;
}

function checkSwttrRecommends(layers: MutableLayers): boolean {
  for (const part of BODY_PARTS) {
    for (const lt of LAYER_TYPES) {
      const items = layers[part][lt];
      if (items) {
        for (const item of items) {
          if (item.isRecommended) return true;
        }
      }
    }
  }
  return false;
}

export function useMutableLayers(
  biophysicsData: BiophysicsRecommendation | null,
  handwear: RecommendedHandwear | null | undefined,
  headwear: RecommendedHeadwear | null | undefined,
) {
  // Keep latest handwear/headwear in refs so the garments-change effect uses current values
  const handwearRef = useRef(handwear);
  const headwearRef = useRef(headwear);
  handwearRef.current = handwear;
  headwearRef.current = headwear;

  const [mutableLayers, setMutableLayers] = useState<MutableLayers>(() => {
    const garments = biophysicsData?.recommendation?.garments;
    return buildLayersFromData(garments, handwear, headwear);
  });

  const [originalCloByBodyPart, setOriginalCloByBodyPart] = useState<Record<BodyPart, number>>(() => {
    const garments = biophysicsData?.recommendation?.garments;
    const layers = buildLayersFromData(garments, handwear, headwear);
    return {
      torso: sumClo(layers.torso),
      legs: sumClo(layers.legs),
      hands: sumClo(layers.hands),
      headNeck: sumClo(layers.headNeck),
    };
  });

  // Track garments reference to detect when biophysics changes
  const prevGarmentsRef = useRef(biophysicsData?.recommendation?.garments);

  useEffect(() => {
    const garments = biophysicsData?.recommendation?.garments;
    if (garments !== prevGarmentsRef.current) {
      prevGarmentsRef.current = garments;
      const layers = buildLayersFromData(garments, handwearRef.current, headwearRef.current);
      setMutableLayers(layers);
      setOriginalCloByBodyPart({
        torso: sumClo(layers.torso),
        legs: sumClo(layers.legs),
        hands: sumClo(layers.hands),
        headNeck: sumClo(layers.headNeck),
      });
    }
  }, [biophysicsData?.recommendation?.garments]);

  const layerEditDelta = useMemo<Record<BodyPart, number>>(() => {
    const delta: Record<BodyPart, number> = { torso: 0, legs: 0, hands: 0, headNeck: 0 };
    for (const part of BODY_PARTS) {
      delta[part] = sumClo(mutableLayers[part]) - originalCloByBodyPart[part];
    }
    return delta;
  }, [mutableLayers, originalCloByBodyPart]);

  const totalLayerEditDelta = useMemo(
    () => Object.values(layerEditDelta).reduce((sum, d) => sum + d, 0),
    [layerEditDelta]
  );

  const inUseItemIds = useMemo(() => collectInUseIds(mutableLayers), [mutableLayers]);

  const hasSwttrRecommendsInUse = useMemo(
    () => checkSwttrRecommends(mutableLayers),
    [mutableLayers]
  );

  const addItem = useCallback((bodyPart: BodyPart, layerType: LayerType, item: LayerItem) => {
    setMutableLayers((prev) => {
      const partLayers = prev[bodyPart];
      const existing = partLayers[layerType] ?? [];
      return {
        ...prev,
        [bodyPart]: {
          ...partLayers,
          [layerType]: [...existing, item],
        },
      };
    });
  }, []);

  const removeItem = useCallback((bodyPart: BodyPart, layerType: LayerType, index: number) => {
    setMutableLayers((prev) => {
      const partLayers = prev[bodyPart];
      const existing = partLayers[layerType] ?? [];
      if (index < 0 || index >= existing.length) return prev;
      return {
        ...prev,
        [bodyPart]: {
          ...partLayers,
          [layerType]: existing.filter((_, i) => i !== index),
        },
      };
    });
  }, []);

  const replaceItem = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, index: number, newItem: LayerItem) => {
      setMutableLayers((prev) => {
        const partLayers = prev[bodyPart];
        const existing = partLayers[layerType] ?? [];
        if (index < 0 || index >= existing.length) return prev;
        const updated = [...existing];
        updated[index] = newItem;
        return {
          ...prev,
          [bodyPart]: {
            ...partLayers,
            [layerType]: updated,
          },
        };
      });
    },
    []
  );

  return {
    mutableLayers,
    inUseItemIds,
    layerEditDelta,
    totalLayerEditDelta,
    hasSwttrRecommendsInUse,
    addItem,
    removeItem,
    replaceItem,
  };
}
