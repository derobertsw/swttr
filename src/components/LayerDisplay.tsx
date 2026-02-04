import { Backpack, X, AlertTriangle, Lightbulb, Plus, Info, Shirt, Footprints, Hand, HardHat } from "lucide-react";
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
  feelsLike?: number;
  score?: number;
}

/**
 * Calculates wind chill (feels like temperature) for cold conditions
 * Uses NWS wind chill formula when temp <= 50F and wind > 3 mph
 */
function calculateFeelsLike(temperature: number, windspeed: number): number {
  if (temperature <= 50 && windspeed > 3) {
    const windChill =
      35.74 +
      0.6215 * temperature -
      35.75 * Math.pow(windspeed, 0.16) +
      0.4275 * temperature * Math.pow(windspeed, 0.16);
    return Math.round(windChill);
  }
  return temperature;
}

interface ThermalGaugeProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
}

/**
 * Calculates the thermal position on a -1 to +1 scale
 * -1 = severely under-insulated (cold)
 *  0 = perfectly insulated (comfortable)
 * +1 = over-insulated (hot)
 */
function calculateThermalPosition(
  totalClo: number,
  targetMin: number,
  targetNeutral: number
): number {
  // Define a reasonable max (for over-insulation detection)
  const targetMax = targetNeutral * 1.3;

  if (totalClo < targetMin) {
    // Under-insulated: map 0 to targetMin onto -1 to -0.2
    const underRange = targetMin;
    const position = -1 + (totalClo / underRange) * 0.8;
    return Math.max(-1, position);
  } else if (totalClo <= targetNeutral) {
    // Comfortable range: map targetMin to targetNeutral onto -0.2 to 0
    const range = targetNeutral - targetMin;
    const position = ((totalClo - targetMin) / range) * 0.2 - 0.2;
    return position;
  } else if (totalClo <= targetMax) {
    // Slightly over-insulated: map targetNeutral to targetMax onto 0 to 0.5
    const range = targetMax - targetNeutral;
    const position = ((totalClo - targetNeutral) / range) * 0.5;
    return position;
  } else {
    // Very over-insulated: cap at 1
    const excess = totalClo - targetMax;
    const position = 0.5 + Math.min(excess / targetNeutral, 0.5);
    return Math.min(1, position);
  }
}

/**
 * Visual gauge showing user's thermal position on a cold-to-hot spectrum.
 * Uses color gradient and marker to communicate thermal comfort at a glance.
 */
function ThermalGauge({ totalClo, targetRange }: ThermalGaugeProps) {
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetNeutral] = targetRange;
  const position = calculateThermalPosition(totalClo, targetMin, targetNeutral);

  // Convert position (-1 to 1) to percentage (0 to 100)
  const markerPercent = ((position + 1) / 2) * 100;

  // Comfort zone spans from roughly -0.2 to +0.2 on the scale (40% to 60% on bar)
  const comfortStart = 40;
  const comfortEnd = 60;

  return (
    <div className="w-full">
      {/* Labels - Cold / Comfortable / Hot */}
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>Cold</span>
        <span className="text-slate-400">Comfortable</span>
        <span>Hot</span>
      </div>

      {/* Gauge track - desaturated gradient for instrument-like feel */}
      <div
        className="relative h-2.5 rounded-full mb-6"
        style={{
          background: "linear-gradient(to right, #6BAADB 0%, #7DC4A8 35%, #A8C9A0 50%, #C9C490 65%, #D4B87A 100%)",
        }}
      >
        {/* Comfort zone indicator band */}
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${comfortStart}%`,
            width: `${comfortEnd - comfortStart}%`,
            background: "rgba(255, 255, 255, 0.12)",
            boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.15)",
          }}
        />

        {/* Marker with "You" label */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
          style={{
            left: `${markerPercent}%`,
            animation: "gauge-thumb-enter 0.4s ease-out",
          }}
        >
          {/* Thumb - hero element with enhanced shadow and size */}
          <div
            className="w-6 h-6 rounded-full bg-white border-[2.5px] border-slate-700"
            style={{
              outline: "2px solid white",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)",
            }}
          />
          {/* You label */}
          <span className="text-[10px] text-slate-500 mt-1.5 whitespace-nowrap font-medium">You</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Displays current weather conditions and optional thermal comfort score
 * Layout prioritizes temperature as the hero element with secondary details below
 */
function WeatherHeader({ temperature, windspeed, feelsLike, score }: WeatherHeaderProps) {
  const calculatedFeelsLike = feelsLike ?? calculateFeelsLike(temperature, windspeed);
  const showFeelsLike = calculatedFeelsLike !== temperature;

  return (
    <div className="pb-6 border-b border-white/20">
      {/* Main row: Temperature and optional score */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          {/* Hero temperature with soft radial backdrop for contrast */}
          <div
            className="relative"
            style={{
              background: "radial-gradient(circle at 30% 50%, rgba(0,0,0,0.12) 0%, transparent 70%)",
              margin: "-12px",
              padding: "12px",
            }}
          >
            <span
              className="text-7xl font-medium tracking-tight"
              style={{
                color: "#F8FAFC",
                textShadow: "0px 1px 6px rgba(0,0,0,0.25)",
              }}
            >
              {temperature}
            </span>
            <span
              className="text-lg font-medium align-top ml-0.5"
              style={{
                color: "rgba(248,250,252,0.7)",
                textShadow: "0px 1px 4px rgba(0,0,0,0.2)",
                position: "relative",
                top: "-8px",
              }}
            >
              °F
            </span>
          </div>

          {/* Secondary details - increased contrast and size */}
          <div
            className="mt-2 flex items-center gap-1.5 text-[15px]"
            style={{ color: "rgba(255,255,255,0.65)" }}
          >
            {showFeelsLike && (
              <>
                <span>Feels like {calculatedFeelsLike}°</span>
                <span style={{ opacity: 0.5 }}>·</span>
              </>
            )}
            <span>Wind {windspeed} mph</span>
          </div>

          {/* Cold weather motivation */}
          {temperature < 32 && (
            <p
              className="mt-3 text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.8)" }}
            >
              Be Bold, Start Cold
            </p>
          )}
        </div>

        {/* Score badge - right-aligned */}
        {score !== undefined && (
          <ScoreDisplay score={score} size="lg" />
        )}
      </div>
    </div>
  );
}

interface ThermalStatusCardProps {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  regionalClo?: RegionalClo;
}

/**
 * Determines risk level based on insulation deficit
 */
function getThermalRiskLevel(totalClo: number, targetMin: number, targetNeutral: number): {
  riskLevel: "comfortable" | "moderate" | "high";
  deficit: number;
} {
  const deficit = targetNeutral - totalClo;
  const deficitPercent = (deficit / targetNeutral) * 100;

  if (totalClo >= targetMin) {
    // At or above minimum target - comfortable
    return { riskLevel: "comfortable", deficit: Math.max(0, deficit) };
  } else if (deficitPercent <= 50) {
    // Below minimum but within 50% of target - moderate risk
    return { riskLevel: "moderate", deficit };
  } else {
    // More than 50% below target - high risk
    return { riskLevel: "high", deficit };
  }
}

/**
 * Returns a recommendation message based on insulation deficit
 */
function getRecommendation(deficit: number, targetNeutral: number): string {
  const deficitPercent = (deficit / targetNeutral) * 100;

  if (deficitPercent > 70) {
    return "Add a midlayer and consider warmer base layers";
  } else if (deficitPercent > 40) {
    return "Add a midlayer to improve warmth";
  } else {
    return "Consider adding a light midlayer";
  }
}

/**
 * Consolidated thermal status card that adapts based on risk level.
 * Eliminates redundant stacking of separate risk and warning cards.
 *
 * States:
 * - High risk: Rose card with left accent, embedded recommendation and metrics
 * - Moderate risk: Amber warning card with recommendation and metrics
 * - Comfortable: Green affirmation card
 */
function ThermalStatusCard({ totalClo, targetRange, regionalClo }: ThermalStatusCardProps) {
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetNeutral] = targetRange;
  const { riskLevel, deficit } = getThermalRiskLevel(totalClo, targetMin, targetNeutral);

  // Comfortable state - green affirmation
  if (riskLevel === "comfortable") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              You&apos;re well layered for current conditions
            </p>
          </div>
          {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
        </div>
      </div>
    );
  }

  // Moderate risk - amber warning with recommendation
  if (riskLevel === "moderate") {
    const recommendation = getRecommendation(deficit, targetNeutral);

    return (
      <div className="rounded-lg border-l-4 border-l-amber-400 border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 flex-shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Cold Risk — Moderate</p>
            <p className="text-sm text-amber-700 mt-0.5">
              You are under target insulation by {deficit.toFixed(1)} clo
            </p>
            <p className="text-sm text-amber-700 mt-2">{recommendation}</p>
            <p className="text-xs text-amber-600/70 mt-2">
              Current: {totalClo.toFixed(1)} clo · Target: {targetNeutral.toFixed(1)} clo
            </p>
          </div>
          {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
        </div>
      </div>
    );
  }

  // High risk - softer rose card with left accent and embedded recommendation
  const recommendation = getRecommendation(deficit, targetNeutral);

  return (
    <div className="rounded-lg border-l-4 border-l-rose-400 border border-rose-200 bg-rose-50 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-4 mt-0.5 flex-shrink-0 text-rose-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-rose-800">Cold Stress Risk — High</p>
          <p className="text-sm text-rose-700 mt-0.5">
            You are under target insulation by {deficit.toFixed(1)} clo
          </p>
          <p className="text-sm text-rose-700 mt-2">{recommendation}</p>
          <p className="text-xs text-rose-600/70 mt-2">
            Current: {totalClo.toFixed(1)} clo · Target: {targetNeutral.toFixed(1)} clo
          </p>
        </div>
        {regionalClo && <CloInfoPopover regionalClo={regionalClo} totalClo={totalClo} />}
      </div>
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
        <button className="text-slate-400 hover:text-slate-600">
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

interface CloProgressBarProps {
  currentClo: number | undefined;
  targetClo: number;
}

/**
 * Visual progress bar showing insulation level relative to target.
 * Provides instant comprehension of thermal coverage status.
 * Bar shows filled portion as current/target ratio, color-coded by status.
 *
 * Color scheme (no red - red is reserved for global risk only):
 * - Sky blue: under target (< 80% of target)
 * - Emerald: near target (80-100% of target)
 * - Amber: over target (> 100% of target)
 */
function CloProgressBar({ currentClo, targetClo }: CloProgressBarProps) {
  const displayClo = currentClo ?? 0;
  const ratio = displayClo / targetClo;
  const percentage = Math.min(ratio * 100, 100); // Cap at 100%

  // Color coding based on coverage level (no red for clothing sections)
  const getBarColor = () => {
    if (ratio < 0.8) return "bg-sky-500";
    if (ratio <= 1) return "bg-emerald-500";
    return "bg-amber-500";
  };

  const getTextColor = () => {
    if (ratio < 0.8) return "text-sky-700";
    if (ratio <= 1) return "text-emerald-700";
    return "text-amber-700";
  };

  return (
    <div className="flex items-center gap-2">
      {/* Progress bar track */}
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {/* Numeric display */}
      <span className={`text-xs font-mono ${getTextColor()}`}>
        {displayClo.toFixed(1)}/{targetClo.toFixed(1)} clo
      </span>
    </div>
  );
}

interface HandwearDisplayProps {
  handwear: RecommendedHandwear;
}

/**
 * Displays recommended handwear with clo value
 * Typography hierarchy: category (muted) -> name (primary) -> clo (tertiary)
 */
function HandwearDisplay({ handwear }: HandwearDisplayProps) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-xs uppercase text-slate-900/60 tracking-wide">Gloves</span>
      <span className="text-slate-900 font-medium">{handwear.name}</span>
      <span className="text-xs text-slate-500">{handwear.rcl.toFixed(2)} clo</span>
    </li>
  );
}

interface HeadwearDisplayProps {
  headwear: RecommendedHeadwear;
}

/**
 * Displays recommended headwear items (helmet, head warmth, neck warmth)
 * Typography hierarchy: category (muted) -> name (primary) -> clo (tertiary)
 */
function HeadwearDisplay({ headwear }: HeadwearDisplayProps) {
  return (
    <>
      {headwear.helmet && (
        <li className="flex flex-col gap-0.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">Helmet</span>
          <span className="text-slate-900 font-medium">{headwear.helmet.name}</span>
          <span className="text-xs text-slate-500">{headwear.helmet.rcl.toFixed(2)} clo</span>
        </li>
      )}
      {headwear.head_warmth && (
        <li className="flex flex-col gap-0.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">Head</span>
          <span className="text-slate-900 font-medium">{headwear.head_warmth.name}</span>
          <span className="text-xs text-slate-500">{headwear.head_warmth.rcl.toFixed(2)} clo</span>
        </li>
      )}
      {headwear.neck_warmth && (
        <li className="flex flex-col gap-0.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">Neck</span>
          <span className="text-slate-900 font-medium">{headwear.neck_warmth.name}</span>
          <span className="text-xs text-slate-500">{headwear.neck_warmth.rcl.toFixed(2)} clo</span>
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
 * Typography hierarchy: layer type (muted) -> garment name (primary)
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
        <li className="flex flex-col gap-0.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">{LAYER_LABELS.base}</span>
          <span className="text-slate-900 font-medium">{getDisplayItems(layers.base, "base")}</span>
        </li>
      )}
      {layers.mid && layers.mid.length > 0 && (
        <li className="flex flex-col gap-0.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">{LAYER_LABELS.mid}</span>
          <span className="text-slate-900 font-medium">{getDisplayItems(layers.mid, "mid")}</span>
        </li>
      )}
      {layers.outer.length > 0 && (
        <li className="flex flex-col gap-0.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">{LAYER_LABELS.outer}</span>
          <span className="text-slate-900 font-medium">{getDisplayItems(layers.outer, "outer")}</span>
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
 * Returns a contextual empty state message for a body part
 * Messages are designed to be helpful and emphasize the user's situation
 */
function getEmptyStateMessage(bodyPart: BodyPart): string {
  switch (bodyPart) {
    case "torso":
      return "Add torso layers for core warmth";
    case "legs":
      return "Your legs need protection in these conditions";
    case "hands":
      return "No hand insulation selected";
    case "headNeck":
      return "Head and neck are exposed to the elements";
  }
}

/**
 * Returns the icon component for a body part section
 */
function getBodyPartIcon(bodyPart: BodyPart): React.ReactNode {
  const iconClass = "size-4 text-slate-500";
  switch (bodyPart) {
    case "torso":
      return <Shirt className={iconClass} />;
    case "legs":
      return <Footprints className={iconClass} />;
    case "hands":
      return <Hand className={iconClass} />;
    case "headNeck":
      return <HardHat className={iconClass} />;
  }
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
    <div className="rounded-lg bg-white/40 backdrop-blur-[2px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
          {getBodyPartIcon(bodyPart)}
          {BODY_PART_LABELS[bodyPart]}
        </h3>
        {targetClo !== undefined && <CloProgressBar currentClo={currentClo} targetClo={targetClo} />}
      </div>

      {!hasContent ? (
        <Link
          href="/wardrobe"
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-primary transition-colors group"
        >
          <Plus className="size-4 text-slate-500 group-hover:text-primary" />
          <span>{getEmptyStateMessage(bodyPart)}</span>
        </Link>
      ) : (
        <ul className="space-y-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
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
    <div className="rounded-lg bg-white/40 backdrop-blur-[2px] p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-800 mb-3">
        <Backpack className="size-4" />
        Backpack
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-900">{item.name}</span>
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
    <div className="rounded-lg bg-white/40 backdrop-blur-[2px] p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-800 mb-3">
        <Lightbulb className="size-4" />
        Tips
      </h3>
      <ul className="flex flex-col gap-3">
        {tips.slice(0, 3).map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
            <span className="text-slate-400 flex-shrink-0">•</span>
            <span>{tip}</span>
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
    <div className="flex flex-col gap-8">
      <WeatherHeader
        temperature={temperature}
        windspeed={windspeed}
        score={biophysicsData?.recommendation?.score}
      />

      <ThermalGauge
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
      />

      <ThermalStatusCard
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
        regionalClo={regionalClo}
      />

      <div className="flex flex-col gap-6">
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
      </div>

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
