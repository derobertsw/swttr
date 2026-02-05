import Link from "next/link";
import { Plus, Shirt, Footprints, Hand, HardHat, Flame } from "lucide-react";
import { RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";
import { BodyPart, LayerSet, BODY_PART_LABELS, hasAnyLayers } from "@/lib/layers";
import { CloProgressBar } from "./CloProgressBar";
import { HandwearDisplay, HeadwearDisplay } from "./ExtremityDisplay";
import { LayerItems } from "./LayerItems";

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

export function BodyPartSection({
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
  const isOverTarget =
    targetClo !== undefined &&
    currentClo !== undefined &&
    targetClo > 0 &&
    currentClo / targetClo >= 1.2;

  return (
    <div className="rounded-lg bg-white/40 backdrop-blur-[2px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
          {getBodyPartIcon(bodyPart)}
          {BODY_PART_LABELS[bodyPart]}
        </h3>
        <div className="flex items-center gap-2">
          {isOverTarget && (
            <span className="inline-flex items-center text-amber-600" title="Overheating risk">
              <Flame className="size-4" />
            </span>
          )}
          {targetClo !== undefined && <CloProgressBar currentClo={currentClo} targetClo={targetClo} />}
        </div>
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
