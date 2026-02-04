import { Backpack, Thermometer, Wind, X, AlertTriangle, Lightbulb, Plus, Info } from "lucide-react";
import Link from "next/link";
import { BackpackItem } from "@/types/recommendations";
import { BiophysicsRecommendation, RecommendedGarment } from "@/types/biophysics";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
          {biophysicsData.warnings.map((warning, i) => {
            const isInsulationWarning = warning.includes("overall insulation");
            const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
            const totalClo = biophysicsData?.recommendation?.ensemble_properties?.total_clo;

            return (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
                <span className="flex-1">{warning}</span>
                {isInsulationWarning && regionalClo && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-amber-600 hover:text-amber-800">
                        <Info className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">How overall clo is calculated</h4>
                        <p className="text-xs text-muted-foreground">
                          Overall insulation is a weighted average of body regions:
                        </p>
                        <div className="text-xs font-mono bg-muted p-2 rounded space-y-1">
                          <div>Torso: {regionalClo.torso.toFixed(2)} clo × 50%</div>
                          <div>Arms: {regionalClo.arms.toFixed(2)} clo × 25%</div>
                          <div>Legs: {regionalClo.legs.toFixed(2)} clo × 25%</div>
                          <div className="border-t pt-1 mt-1 font-semibold">
                            = {totalClo?.toFixed(2)} clo overall
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          The per-body-part targets shown below are empirical recommendations for comfort,
                          while this overall target is calculated from biophysics.
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}
        </div>
      )}
      {bodyParts.map((part) => {
        // When biophysics is active, only show wardrobe items (don't fall back to static)
        const biophysicsGarments = biophysicsData?.recommendation?.garments;
        const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;

        // Get wardrobe layers filtered by body part (torso or legs)
        const wardrobeLayers = (part === "torso" || part === "legs") && biophysicsGarments
          ? garmentsTolayerSet(biophysicsGarments, part)
          : { base: [], mid: [], outer: [] };

        // Use wardrobe items when biophysics is active, otherwise use static recommendation
        const layers = biophysicsActive ? wardrobeLayers : recommendation[part];

        // Check for extremity gear from biophysics
        const recommendedHandwear = biophysicsData?.recommendation?.handwear;
        const recommendedHeadwear = biophysicsData?.recommendation?.headwear;

        // For hands/headNeck, check if we have biophysics extremity recommendations
        const hasHeadwear = recommendedHeadwear && (
          recommendedHeadwear.helmet || recommendedHeadwear.head_warmth || recommendedHeadwear.neck_warmth
        );
        const hasExtremityGear = (part === "hands" && recommendedHandwear) ||
          (part === "headNeck" && hasHeadwear);

        const hasLayers =
          layers.base.length > 0 ||
          (layers.mid && layers.mid.length > 0) ||
          layers.outer.length > 0 ||
          hasExtremityGear;

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
          // Get current clo from recommended extremity gear
          if (extremity === "hands" && recommendedHandwear) {
            currentClo = recommendedHandwear.rcl;
          } else if (extremity === "head" && recommendedHeadwear) {
            // Sum clo from all headwear items
            currentClo =
              (recommendedHeadwear.helmet?.rcl ?? 0) +
              (recommendedHeadwear.head_warmth?.rcl ?? 0) +
              (recommendedHeadwear.neck_warmth?.rcl ?? 0);
          }
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
                {/* Show extremity gear for hands/headNeck */}
                {part === "hands" && recommendedHandwear && (
                  <li>
                    {recommendedHandwear.name} ({recommendedHandwear.rcl.toFixed(2)} clo)
                  </li>
                )}
                {part === "headNeck" && recommendedHeadwear && (
                  <>
                    {recommendedHeadwear.helmet && (
                      <li>
                        <span style={{ fontWeight: 500 }}>Helmet:</span>{" "}
                        {recommendedHeadwear.helmet.name} ({recommendedHeadwear.helmet.rcl.toFixed(2)} clo)
                      </li>
                    )}
                    {recommendedHeadwear.head_warmth && (
                      <li>
                        <span style={{ fontWeight: 500 }}>Head:</span>{" "}
                        {recommendedHeadwear.head_warmth.name} ({recommendedHeadwear.head_warmth.rcl.toFixed(2)} clo)
                      </li>
                    )}
                    {recommendedHeadwear.neck_warmth && (
                      <li>
                        <span style={{ fontWeight: 500 }}>Neck:</span>{" "}
                        {recommendedHeadwear.neck_warmth.name} ({recommendedHeadwear.neck_warmth.rcl.toFixed(2)} clo)
                      </li>
                    )}
                  </>
                )}
                {/* Show garment layers for torso/legs */}
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
