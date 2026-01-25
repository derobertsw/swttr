import React from "react";

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

interface LayerDisplayProps {
  recommendation: Recommendation | null;
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

const LayerDisplay = ({ recommendation }: LayerDisplayProps) => {
  if (!recommendation) return null;

  const bodyParts = ["torso", "legs", "hands", "headNeck"] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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
                    {layers.base.join(", ")}
                  </li>
                )}
                {layers.mid && layers.mid.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>{layerLabels.mid}:</span>{" "}
                    {layers.mid.join(", ")}
                  </li>
                )}
                {layers.outer.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>
                      {layerLabels.outer}:
                    </span>{" "}
                    {layers.outer.join(", ")}
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
