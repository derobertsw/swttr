import { RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";

interface HandwearDisplayProps {
  handwear: RecommendedHandwear;
}

/**
 * Displays recommended handwear with clo value
 */
export function HandwearDisplay({ handwear }: HandwearDisplayProps) {
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
 */
export function HeadwearDisplay({ headwear }: HeadwearDisplayProps) {
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
