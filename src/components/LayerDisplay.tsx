import React from "react";
import { Thermometer, Wind } from "lucide-react";

interface LayerSet {
  base: string[];
  mid?: string[];
  outer: string[];
}

interface Recommendation {
  torso: LayerSet;
  legs: LayerSet;
  hands: LayerSet;
  headNeck: LayerSet;
}

type BodyPart = "torso" | "legs" | "hands" | "headNeck";
type LayerType = "base" | "mid" | "outer";

interface LayerDisplayProps {
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
  itemMappings?: Map<string, string>;
}

const bodyPartLabels: Record<string, string> = {
  torso: "Torso",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head/Neck",
};

const layerLabels: Record<string, string> = {
  base: "Base",
  mid: "Mid",
  outer: "Outer",
};

const LayerDisplay = ({ recommendation, temperature, windspeed, itemMappings }: LayerDisplayProps) => {
  if (!recommendation) return null;

  const bodyParts = ["torso", "legs", "hands", "headNeck"] as const;

  // Apply item mappings to transform standard names to custom names
  const mapItems = (items: string[], bodyPart: BodyPart, layerType: LayerType): string[] => {
    if (!itemMappings) return items;
    return items.map((item) => {
      const key = `${bodyPart}:${layerType}:${item}`;
      return itemMappings.get(key) || item;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="flex flex-col items-center gap-2 pb-4 border-b">
        <div className="flex items-center gap-6 text-lg">
          <div className="flex items-center gap-2">
            <Thermometer className="size-5" />
            <span>{temperature}°F</span>
          </div>
          <div className="flex items-center gap-2">
            <Wind className="size-5" />
            <span>{windspeed} mph</span>
          </div>
        </div>
        {temperature < 32 && (
          <p className="text-sm font-medium text-blue-600 italic">
            Be Bold, Start Cold
          </p>
        )}
      </div>
      {bodyParts.map((part) => {
        const layers = recommendation[part];
        const hasLayers =
          layers.base.length > 0 ||
          (layers.mid && layers.mid.length > 0) ||
          layers.outer.length > 0;

        return (
          <div key={part}>
            <h3 style={{ fontWeight: "bold", marginBottom: "8px" }}>
              {bodyPartLabels[part]}
            </h3>
            {!hasLayers ? (
              <p style={{ color: "#888" }}>None</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {layers.base.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>{layerLabels.base}:</span>{" "}
                    {mapItems(layers.base, part, "base").join(", ")}
                  </li>
                )}
                {layers.mid && layers.mid.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>{layerLabels.mid}:</span>{" "}
                    {mapItems(layers.mid, part, "mid").join(", ")}
                  </li>
                )}
                {layers.outer.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>
                      {layerLabels.outer}:
                    </span>{" "}
                    {mapItems(layers.outer, part, "outer").join(", ")}
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LayerDisplay;
