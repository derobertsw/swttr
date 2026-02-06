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

interface CloValues {
  currentClo: number | undefined;
  targetClo: number | undefined;
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

/**
 * Displays layered clothing recommendations organized by body part.
 * Supports both static recommendations and biophysics-based recommendations.
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
  if (!recommendation && !biophysicsData) return null;

  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;

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
        score={biophysicsData?.recommendation?.thermal_comfort_score ?? biophysicsData?.recommendation?.score}
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
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
