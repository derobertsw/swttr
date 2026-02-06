import { BackpackItem, Recommendation } from "@/types/recommendations";
import {
  BiophysicsRecommendation,
  RecommendedHandwear,
  RecommendedHeadwear,
  RegionalClo,
  RegionalIreqRange,
  ExtremityIreqRange,
} from "@/types/biophysics";
import BiophysicsDetails from "@/components/BiophysicsDetails";
import {
  BodyPart,
  BODY_PARTS,
  BODY_PART_TO_REGION,
  BODY_PART_TO_EXTREMITY,
  garmentsToLayerSet,
  createEmptyLayerSet,
} from "@/lib/layers";
import {
  WeatherHeader,
  ThermalGauge,
  ThermalStatusCard,
  BodyPartSection,
  BackpackSection,
  GuidanceSection,
} from "@/components/layers";
import { cn } from "@/lib/utils";

interface LayerDisplayProps {
  activity?: string;
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
  itemMappings?: Map<string, string>;
  backpackItems?: BackpackItem[];
  onRemoveBackpackItem?: (name: string) => void;
  onHideBackpackDefault?: (name: string) => void;
  biophysicsData?: BiophysicsRecommendation | null;
}

interface CloValues {
  currentClo: number | undefined;
  targetClo: number | undefined;
}

interface SummaryContent {
  title: string;
  subtitle: string;
  detail: string;
}

function getSummaryContent(totalClo: number | undefined, targetRange: [number, number] | undefined): SummaryContent {
  if (totalClo === undefined || !targetRange) {
    return {
      title: "Layer plan ready",
      subtitle: "Use body-part sections below to fine-tune your setup.",
      detail: "Recommendation based on current conditions",
    };
  }

  const [targetMin, targetMax] = targetRange;
  if (totalClo < targetMin) {
    const deficit = targetMin - totalClo;
    return {
      title: "You are running cold",
      subtitle: `Add roughly ${deficit.toFixed(1)} clo to reach minimum target.`,
      detail: `Current ${totalClo.toFixed(1)} clo · Target ${targetMin.toFixed(1)}-${targetMax.toFixed(1)} clo`,
    };
  }

  if (totalClo > targetMax) {
    const excess = totalClo - targetMax;
    return {
      title: "You are running warm",
      subtitle: `Reduce roughly ${excess.toFixed(1)} clo or increase venting.`,
      detail: `Current ${totalClo.toFixed(1)} clo · Target ${targetMin.toFixed(1)}-${targetMax.toFixed(1)} clo`,
    };
  }

  return {
    title: "You are in the comfort zone",
    subtitle: "Your insulation is within the current target range.",
    detail: `Current ${totalClo.toFixed(1)} clo · Target ${targetMin.toFixed(1)}-${targetMax.toFixed(1)} clo`,
  };
}

/**
 * Calculates current and target clo values for a body part based on biophysics data.
 */
function getCloValues(
  bodyPart: BodyPart,
  regionalClo: RegionalClo | undefined,
  regionalIreq: RegionalIreqRange | undefined,
  extremityIreq: ExtremityIreqRange | undefined,
  handwear: RecommendedHandwear | null | undefined,
  headwear: RecommendedHeadwear | null | undefined,
  includeHelmetClo = true
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
      currentClo =
        (includeHelmetClo ? (headwear.helmet?.rcl ?? 0) : 0) +
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

/**
 * Displays layered clothing recommendations organized by body part.
 * Supports both static recommendations and biophysics-based recommendations.
 */
const LayerDisplay = ({
  activity,
  recommendation,
  temperature,
  windspeed,
  itemMappings,
  backpackItems,
  onRemoveBackpackItem,
  onHideBackpackDefault,
  biophysicsData,
}: LayerDisplayProps) => {
  if (!recommendation && !biophysicsData) return null;

  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;

  const biophysicsGarments = biophysicsData?.recommendation?.garments;
  const handwear = biophysicsData?.recommendation?.handwear;
  const shouldIgnoreHelmetForClo = activity === "xc-skiing";
  const headwear = shouldIgnoreHelmetForClo && biophysicsData?.recommendation?.headwear
    ? { ...biophysicsData.recommendation.headwear, helmet: null }
    : biophysicsData?.recommendation?.headwear;
  const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
  const totalClo = biophysicsData?.recommendation?.ensemble_properties?.total_clo;
  const regionalIreq = biophysicsData?.ireq?.regional;
  const extremityIreq = biophysicsData?.ireq?.extremity;
  const summary = getSummaryContent(totalClo, biophysicsData?.ireq?.target_range);

  return (
    <div className="flex flex-col gap-8">
      <WeatherHeader
        temperature={temperature}
        windspeed={windspeed}
        score={biophysicsData?.recommendation?.thermal_comfort_score ?? biophysicsData?.recommendation?.score}
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
      />

      <div
        className={cn(
          "rounded-xl border px-5 py-4 backdrop-blur-md",
          totalClo !== undefined &&
            biophysicsData?.ireq?.target_range &&
            totalClo >= biophysicsData.ireq.target_range[0] &&
            totalClo <= biophysicsData.ireq.target_range[1]
            ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-950"
            : "border-white/35 bg-white/85 text-slate-900"
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">Outfit Summary</p>
        <h2 className="mt-1 text-xl font-semibold leading-tight">{summary.title}</h2>
        <p className="mt-1.5 text-sm opacity-90">{summary.subtitle}</p>
        <p className="mt-2 text-xs opacity-70">{summary.detail}</p>
      </div>

      <ThermalGauge
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
      />

      <ThermalStatusCard
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
        regionalClo={regionalClo}
      />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">
          Detailed Layer Breakdown
        </h3>
      </div>
      <div className="flex flex-col gap-6">
        {BODY_PARTS.map((part) => {
          const wardrobeLayers =
            (part === "torso" || part === "legs") && biophysicsGarments
              ? garmentsToLayerSet(biophysicsGarments, part)
              : createEmptyLayerSet();

          const layers = biophysicsActive
            ? wardrobeLayers
            : recommendation?.[part] ?? createEmptyLayerSet();

          const { currentClo, targetClo } = getCloValues(
            part,
            regionalClo,
            regionalIreq,
            extremityIreq,
            handwear,
            headwear,
            !shouldIgnoreHelmetForClo
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

      {biophysicsData?.guidance && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">Actionable Guidance</h3>
          <GuidanceSection tips={biophysicsData.guidance} />
        </div>
      )}

      {biophysicsData?.recommendation && (
        <details className="rounded-lg border border-white/25 bg-white/10 p-4">
          <summary className="cursor-pointer text-sm font-semibold tracking-wide text-white/85">
            Advanced Biophysics Details
          </summary>
          <div className="mt-4">
            <BiophysicsDetails data={biophysicsData} />
          </div>
        </details>
      )}
    </div>
  );
};

export default LayerDisplay;
