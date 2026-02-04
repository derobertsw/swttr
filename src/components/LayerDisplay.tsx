import { Backpack, Thermometer, Wind, X, AlertTriangle, Lightbulb, Plus, Info } from "lucide-react";
import Link from "next/link";
import { BackpackItem, Recommendation, LayerSet } from "@/types/recommendations";
import {
  BiophysicsRecommendation,
  RecommendedHandwear,
  RecommendedHeadwear,
  RegionalClo,
  RegionalIreqRange,
  ExtremityIreqRange,
} from "@/types/biophysics";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ScoreDisplay from "@/components/ScoreDisplay";
import BiophysicsDetails from "@/components/BiophysicsDetails";
import {
  BodyPart,
  LayerType,
  BODY_PARTS,
  BODY_PART_LABELS,
  BODY_PART_TO_REGION,
  BODY_PART_TO_EXTREMITY,
  LAYER_LABELS,
  garmentsToLayerSet,
  createEmptyLayerSet,
  hasAnyLayers,
  applyItemMappings,
} from "@/lib/layers";

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

// ============================================================================
// Sub-components
// ============================================================================

interface WeatherHeaderProps {
  temperature: number;
  windspeed: number;
  score?: number;
}

/**
 * Displays current weather conditions and optional thermal comfort score
 */
function WeatherHeader({ temperature, windspeed, score }: WeatherHeaderProps) {
  return (
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
        {score !== undefined && <ScoreDisplay score={score} size="md" />}
      </div>
      {temperature < 32 && (
        <p className="text-sm font-medium text-blue-600 italic">Be Bold, Start Cold</p>
      )}
    </div>
  );
}

interface CloInfoPopoverProps {
  regionalClo: RegionalClo;
  totalClo: number | undefined;
}

/**
 * Popover explaining how overall clo is calculated from regional values
 */
function CloInfoPopover({ regionalClo, totalClo }: CloInfoPopoverProps) {
  return (
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
            <div>Torso: {regionalClo.torso.toFixed(2)} clo x 50%</div>
            <div>Arms: {regionalClo.arms.toFixed(2)} clo x 25%</div>
            <div>Legs: {regionalClo.legs.toFixed(2)} clo x 25%</div>
            <div className="border-t pt-1 mt-1 font-semibold">
              = {totalClo?.toFixed(2)} clo overall
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The per-body-part targets shown below are empirical recommendations for comfort, while
            this overall target is calculated from biophysics.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface WarningsSectionProps {
  warnings: string[];
  regionalClo?: RegionalClo;
  totalClo?: number;
}

/**
 * Displays biophysics warnings with optional clo calculation info
 */
function WarningsSection({ warnings, regionalClo, totalClo }: WarningsSectionProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      {warnings.map((warning, i) => {
        const isInsulationWarning = warning.includes("overall insulation");

        return (
          <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{warning}</span>
            {isInsulationWarning && regionalClo && (
              <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface CloStatusBadgeProps {
  currentClo: number | undefined;
  targetClo: number;
}

/**
 * Displays current vs target clo with color-coded status
 */
function CloStatusBadge({ currentClo, targetClo }: CloStatusBadgeProps) {
  if (currentClo === undefined) {
    return (
      <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
        target: {targetClo.toFixed(2)} clo
      </span>
    );
  }

  const getStatusColor = () => {
    if (currentClo >= targetClo) return "bg-green-100 text-green-800";
    if (currentClo >= targetClo * 0.8) return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${getStatusColor()}`}>
      {currentClo.toFixed(2)} / {targetClo.toFixed(2)} clo
    </span>
  );
}

interface HandwearDisplayProps {
  handwear: RecommendedHandwear;
}

/**
 * Displays recommended handwear with clo value
 */
function HandwearDisplay({ handwear }: HandwearDisplayProps) {
  return (
    <li>
      {handwear.name} ({handwear.rcl.toFixed(2)} clo)
    </li>
  );
}

interface HeadwearDisplayProps {
  headwear: RecommendedHeadwear;
}

/**
 * Displays recommended headwear items (helmet, head warmth, neck warmth)
 */
function HeadwearDisplay({ headwear }: HeadwearDisplayProps) {
  return (
    <>
      {headwear.helmet && (
        <li>
          <span style={{ fontWeight: 500 }}>Helmet:</span> {headwear.helmet.name} (
          {headwear.helmet.rcl.toFixed(2)} clo)
        </li>
      )}
      {headwear.head_warmth && (
        <li>
          <span style={{ fontWeight: 500 }}>Head:</span> {headwear.head_warmth.name} (
          {headwear.head_warmth.rcl.toFixed(2)} clo)
        </li>
      )}
      {headwear.neck_warmth && (
        <li>
          <span style={{ fontWeight: 500 }}>Neck:</span> {headwear.neck_warmth.name} (
          {headwear.neck_warmth.rcl.toFixed(2)} clo)
        </li>
      )}
    </>
  );
}

interface LayerItemsProps {
  layers: LayerSet;
  bodyPart: BodyPart;
  biophysicsActive: boolean;
  itemMappings?: Map<string, string>;
}

/**
 * Displays garment layers (base, mid, outer) for a body part
 */
function LayerItems({ layers, bodyPart, biophysicsActive, itemMappings }: LayerItemsProps) {
  /**
   * Gets display items for a layer, applying custom name mappings if not using biophysics
   */
  const getDisplayItems = (items: string[], layerType: LayerType): string => {
    if (biophysicsActive || !itemMappings) {
      return items.join(", ");
    }
    return applyItemMappings(items, bodyPart, layerType, itemMappings).join(", ");
  };

  return (
    <>
      {layers.base.length > 0 && (
        <li>
          <span style={{ fontWeight: 500 }}>{LAYER_LABELS.base}:</span>{" "}
          {getDisplayItems(layers.base, "base")}
        </li>
      )}
      {layers.mid && layers.mid.length > 0 && (
        <li>
          <span style={{ fontWeight: 500 }}>{LAYER_LABELS.mid}:</span>{" "}
          {getDisplayItems(layers.mid, "mid")}
        </li>
      )}
      {layers.outer.length > 0 && (
        <li>
          <span style={{ fontWeight: 500 }}>{LAYER_LABELS.outer}:</span>{" "}
          {getDisplayItems(layers.outer, "outer")}
        </li>
      )}
    </>
  );
}

interface BodyPartSectionProps {
  bodyPart: BodyPart;
  layers: LayerSet;
  biophysicsActive: boolean;
  handwear: RecommendedHandwear | null | undefined;
  headwear: RecommendedHeadwear | null | undefined;
  currentClo: number | undefined;
  targetClo: number | undefined;
  itemMappings?: Map<string, string>;
}

/**
 * Renders a complete body part section with header, clo status, and garment list
 */
function BodyPartSection({
  bodyPart,
  layers,
  biophysicsActive,
  handwear,
  headwear,
  currentClo,
  targetClo,
  itemMappings,
}: BodyPartSectionProps) {
  const hasHeadwear = headwear && (headwear.helmet || headwear.head_warmth || headwear.neck_warmth);

  const hasExtremityGear =
    (bodyPart === "hands" && handwear) || (bodyPart === "headNeck" && hasHeadwear);

  const hasContent = hasAnyLayers(layers) || hasExtremityGear;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 style={{ fontWeight: "bold" }}>{BODY_PART_LABELS[bodyPart]}</h3>
        {targetClo !== undefined && <CloStatusBadge currentClo={currentClo} targetClo={targetClo} />}
      </div>

      {!hasContent ? (
        <Link
          href="/wardrobe"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
        >
          <Plus className="size-4 text-muted-foreground group-hover:text-primary" />
          <span>Add {BODY_PART_LABELS[bodyPart].toLowerCase()} items in wardrobe</span>
        </Link>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {bodyPart === "hands" && handwear && <HandwearDisplay handwear={handwear} />}
          {bodyPart === "headNeck" && headwear && <HeadwearDisplay headwear={headwear} />}
          <LayerItems
            layers={layers}
            bodyPart={bodyPart}
            biophysicsActive={biophysicsActive}
            itemMappings={itemMappings}
          />
        </ul>
      )}
    </div>
  );
}

interface BackpackSectionProps {
  items: BackpackItem[];
  onRemoveCustom?: (name: string) => void;
  onHideDefault?: (name: string) => void;
}

/**
 * Displays backpack contents with remove/hide buttons
 */
function BackpackSection({ items, onRemoveCustom, onHideDefault }: BackpackSectionProps) {
  if (items.length === 0) return null;

  const handleRemove = (item: BackpackItem) => {
    if (item.isCustom) {
      onRemoveCustom?.(item.name);
    } else {
      onHideDefault?.(item.name);
    }
  };

  return (
    <div className="pt-4 border-t">
      <h3 className="flex items-center gap-2 font-bold mb-2">
        <Backpack className="size-4" />
        Backpack
      </h3>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-2">
            <span className="text-sm">{item.name}</span>
            {(onRemoveCustom || onHideDefault) && (
              <Button
                variant="ghost"
                size="icon"
                className="size-5"
                onClick={() => handleRemove(item)}
              >
                <X className="size-3" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface GuidanceSectionProps {
  tips: string[];
}

/**
 * Displays biophysics guidance tips (limited to 3)
 */
function GuidanceSection({ tips }: GuidanceSectionProps) {
  if (tips.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 pt-4 border-t">
      <h3 className="flex items-center gap-2 font-bold text-sm">
        <Lightbulb className="size-4" />
        Tips
      </h3>
      <ul className="flex flex-col gap-1">
        {tips.slice(0, 3).map((tip, i) => (
          <li key={i} className="text-sm text-muted-foreground">
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Helper functions
// ============================================================================

interface CloValues {
  currentClo: number | undefined;
  targetClo: number | undefined;
}

/**
 * Calculates current and target clo values for a body part based on biophysics data.
 * Handles both regular body regions (torso, legs) and extremities (hands, head).
 *
 * @param bodyPart - The body part to calculate clo for
 * @param regionalClo - Optional regional clo data from ensemble properties
 * @param regionalIreq - Optional regional IREQ targets
 * @param extremityIreq - Optional extremity IREQ targets
 * @param handwear - Optional recommended handwear
 * @param headwear - Optional recommended headwear
 * @returns Object containing currentClo and targetClo (either may be undefined)
 */
function getCloValues(
  bodyPart: BodyPart,
  regionalClo: RegionalClo | undefined,
  regionalIreq: RegionalIreqRange | undefined,
  extremityIreq: ExtremityIreqRange | undefined,
  handwear: RecommendedHandwear | null | undefined,
  headwear: RecommendedHeadwear | null | undefined
): CloValues {
  const region = BODY_PART_TO_REGION[bodyPart];
  const extremity = BODY_PART_TO_EXTREMITY[bodyPart];

  if (region) {
    return {
      currentClo: regionalClo?.[region],
      targetClo: regionalIreq?.neutral?.[region],
    };
  }

  if (extremity) {
    let currentClo: number | undefined;

    if (extremity === "hands" && handwear) {
      currentClo = handwear.rcl;
    } else if (extremity === "head" && headwear) {
      // Sum clo from all headwear items
      currentClo =
        (headwear.helmet?.rcl ?? 0) +
        (headwear.head_warmth?.rcl ?? 0) +
        (headwear.neck_warmth?.rcl ?? 0);
    }

    return {
      currentClo,
      targetClo: extremityIreq?.neutral?.[extremity],
    };
  }

  return { currentClo: undefined, targetClo: undefined };
}

// ============================================================================
// Main component
// ============================================================================

/**
 * Displays layered clothing recommendations organized by body part.
 * Supports both static recommendations and biophysics-based recommendations.
 *
 * When biophysics data is present, displays:
 * - Thermal comfort score
 * - Warnings about insulation levels
 * - Per-body-part clo targets vs actual values
 * - Guidance tips
 * - Detailed biophysics analysis (collapsible)
 */
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
  // Require either static recommendation or biophysics data to render
  if (!recommendation && !biophysicsData) return null;

  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;

  // Extract biophysics data for easier access
  const biophysicsGarments = biophysicsData?.recommendation?.garments;
  const handwear = biophysicsData?.recommendation?.handwear;
  const headwear = biophysicsData?.recommendation?.headwear;
  const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
  const totalClo = biophysicsData?.recommendation?.ensemble_properties?.total_clo;
  const regionalIreq = biophysicsData?.ireq?.regional;
  const extremityIreq = biophysicsData?.ireq?.extremity;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <WeatherHeader
        temperature={temperature}
        windspeed={windspeed}
        score={biophysicsData?.recommendation?.score}
      />

      {biophysicsData?.warnings && (
        <WarningsSection
          warnings={biophysicsData.warnings}
          regionalClo={regionalClo}
          totalClo={totalClo}
        />
      )}

      {BODY_PARTS.map((part) => {
        // Get layers for this body part
        const wardrobeLayers =
          (part === "torso" || part === "legs") && biophysicsGarments
            ? garmentsToLayerSet(biophysicsGarments, part)
            : createEmptyLayerSet();

        // Use wardrobe layers when biophysics is active, otherwise use static recommendation
        const layers = biophysicsActive
          ? wardrobeLayers
          : recommendation?.[part] ?? createEmptyLayerSet();

        // Calculate clo values for this body part
        const { currentClo, targetClo } = getCloValues(
          part,
          regionalClo,
          regionalIreq,
          extremityIreq,
          handwear,
          headwear
        );

        return (
          <BodyPartSection
            key={part}
            bodyPart={part}
            layers={layers}
            biophysicsActive={biophysicsActive}
            handwear={handwear}
            headwear={headwear}
            currentClo={currentClo}
            targetClo={targetClo}
            itemMappings={itemMappings}
          />
        );
      })}

      {backpackItems && (
        <BackpackSection
          items={backpackItems}
          onRemoveCustom={onRemoveBackpackItem}
          onHideDefault={onHideBackpackDefault}
        />
      )}

      {biophysicsData?.guidance && <GuidanceSection tips={biophysicsData.guidance} />}

      {biophysicsData?.recommendation && <BiophysicsDetails data={biophysicsData} />}
    </div>
  );
};

export default LayerDisplay;
