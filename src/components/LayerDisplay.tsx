import { Backpack, Thermometer, Wind, X, AlertTriangle, Lightbulb, Plus } from "lucide-react";
import Link from "next/link";
import { BackpackItem } from "@/types/recommendations";
import { BiophysicsRecommendation, RecommendedGarment } from "@/types/biophysics";
import { Button } from "@/components/ui/button";
import ScoreDisplay from "@/components/ScoreDisplay";
import BiophysicsDetails from "@/components/BiophysicsDetails";

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

// Map garment categories to layer types
const categoryToLayerType: Record<string, LayerType> = {
  base_layer: "base",
  mid_layer_light: "mid",
  mid_layer_heavy: "mid",
  insulation_synthetic: "mid",
  insulation_down: "mid",
  soft_shell: "outer",
  hard_shell: "outer",
  windbreaker: "outer",
};

// Transform biophysics garments into LayerSet format for display
// Filters by body part coverage (torso or legs)
function garmentsTolayerSet(
  garments: RecommendedGarment[],
  bodyPart: "torso" | "legs"
): LayerSet {
  const layers: LayerSet = { base: [], mid: [], outer: [] };

  for (const garment of garments) {
    // Filter by body part coverage
    if (bodyPart === "torso" && !garment.covers_torso) continue;
    if (bodyPart === "legs" && !garment.covers_legs) continue;

    const layerType = categoryToLayerType[garment.category];
    if (layerType) {
      // Format: "Brand Model (0.XX clo)"
      const cloStr = garment.rcl !== undefined ? ` (${garment.rcl.toFixed(2)} clo)` : "";
      layers[layerType]?.push(`${garment.name}${cloStr}`);
    }
  }

  return layers;
}

interface LayerDisplayProps {
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
  itemMappings?: Map<string, string>;
  backpackItems?: BackpackItem[];
  onRemoveBackpackItem?: (name: string) => void;
  onHideBackpackDefault?: (name: string) => void;
  biophysicsData?: BiophysicsRecommendation | null;
}

const bodyPartLabels: Record<string, string> = {
  torso: "Torso",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head/Neck",
};

// Map UI body parts to biophysics regions
const bodyPartToRegion: Record<string, "torso" | "arms" | "legs" | null> = {
  torso: "torso",
  legs: "legs",
  hands: null,
  headNeck: null,
};

// Map UI body parts to extremity regions
const bodyPartToExtremity: Record<string, "hands" | "head" | null> = {
  torso: null,
  legs: null,
  hands: "hands",
  headNeck: "head",
};

const layerLabels: Record<string, string> = {
  base: "Base",
  mid: "Mid",
  outer: "Outer",
};

const LayerDisplay = ({
  recommendation,
  temperature,
  windspeed,
  itemMappings,
  backpackItems,
  onRemoveBackpackItem,
  onHideBackpackDefault,
  biophysicsData,
}: LayerDisplayProps) => {
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
          {biophysicsData?.recommendation?.score !== undefined && (
            <ScoreDisplay score={biophysicsData.recommendation.score} size="md" />
          )}
        </div>
        {temperature < 32 && (
          <p className="text-sm font-medium text-blue-600 italic">
            Be Bold, Start Cold
          </p>
        )}
      </div>

      {/* Biophysics warnings */}
      {biophysicsData?.warnings && biophysicsData.warnings.length > 0 && (
        <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          {biophysicsData.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
      {bodyParts.map((part) => {
        // When biophysics is active, only show wardrobe items (don't fall back to static)
        const biophysicsGarments = biophysicsData?.recommendation?.garments;
        const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;

        // Get wardrobe layers filtered by body part (torso or legs)
        // Hands and headNeck don't have wardrobe garments yet
        const wardrobeLayers = (part === "torso" || part === "legs") && biophysicsGarments
          ? garmentsTolayerSet(biophysicsGarments, part)
          : { base: [], mid: [], outer: [] };

        // Use wardrobe items when biophysics is active, otherwise use static recommendation
        const layers = biophysicsActive ? wardrobeLayers : recommendation[part];

        const hasLayers =
          layers.base.length > 0 ||
          (layers.mid && layers.mid.length > 0) ||
          layers.outer.length > 0;

        // Get regional clo data if available (for torso/legs)
        const region = bodyPartToRegion[part];
        const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
        const regionalIreq = biophysicsData?.ireq?.regional;

        // Get extremity clo data if available (for hands/head)
        const extremity = bodyPartToExtremity[part];
        const extremityIreq = biophysicsData?.ireq?.extremity;

        // Determine current and target clo based on body part type
        let currentClo: number | undefined;
        let targetClo: number | undefined;

        if (region) {
          currentClo = regionalClo?.[region];
          targetClo = regionalIreq?.neutral?.[region];
        } else if (extremity) {
          // For extremities, we don't have current clo from ensemble (would need handwear/headwear data)
          // Just show the target for now
          targetClo = extremityIreq?.neutral?.[extremity];
        }

        return (
          <div key={part}>
            <div className="flex items-center justify-between mb-2">
              <h3 style={{ fontWeight: "bold" }}>
                {bodyPartLabels[part]}
              </h3>
              {targetClo !== undefined && (
                currentClo !== undefined ? (
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                    currentClo >= targetClo
                      ? "bg-green-100 text-green-800"
                      : currentClo >= targetClo * 0.8
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {currentClo.toFixed(2)} / {targetClo.toFixed(2)} clo
                  </span>
                ) : (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    target: {targetClo.toFixed(2)} clo
                  </span>
                )
              )}
            </div>
            {!hasLayers ? (
              <Link
                href="/wardrobe"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
              >
                <Plus className="size-4 text-muted-foreground group-hover:text-primary" />
                <span>Add {bodyPartLabels[part].toLowerCase()} items in wardrobe</span>
              </Link>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {layers.base.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>{layerLabels.base}:</span>{" "}
                    {biophysicsActive ? layers.base.join(", ") : mapItems(layers.base, part, "base").join(", ")}
                  </li>
                )}
                {layers.mid && layers.mid.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>{layerLabels.mid}:</span>{" "}
                    {biophysicsActive ? layers.mid.join(", ") : mapItems(layers.mid, part, "mid").join(", ")}
                  </li>
                )}
                {layers.outer.length > 0 && (
                  <li>
                    <span style={{ fontWeight: 500 }}>
                      {layerLabels.outer}:
                    </span>{" "}
                    {biophysicsActive ? layers.outer.join(", ") : mapItems(layers.outer, part, "outer").join(", ")}
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}

      {backpackItems && backpackItems.length > 0 && (
        <div className="pt-4 border-t">
          <h3 className="flex items-center gap-2 font-bold mb-2">
            <Backpack className="size-4" />
            Backpack
          </h3>
          <ul className="flex flex-col gap-1">
            {backpackItems.map((item) => (
              <li
                key={item.name}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-sm">{item.name}</span>
                {(onRemoveBackpackItem || onHideBackpackDefault) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    onClick={() =>
                      item.isCustom
                        ? onRemoveBackpackItem?.(item.name)
                        : onHideBackpackDefault?.(item.name)
                    }
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Biophysics guidance tips */}
      {biophysicsData?.guidance && biophysicsData.guidance.length > 0 && (
        <div className="flex flex-col gap-2 pt-4 border-t">
          <h3 className="flex items-center gap-2 font-bold text-sm">
            <Lightbulb className="size-4" />
            Tips
          </h3>
          <ul className="flex flex-col gap-1">
            {biophysicsData.guidance.slice(0, 3).map((tip, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Biophysics science details accordion */}
      {biophysicsData?.recommendation && <BiophysicsDetails data={biophysicsData} />}
    </div>
  );
};

export default LayerDisplay;
