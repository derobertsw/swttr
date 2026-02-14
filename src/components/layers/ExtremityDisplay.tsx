import { RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";

interface HandwearDisplayProps {
  handwear: RecommendedHandwear;
}

interface ExtremityItemRowProps {
  name: string;
  clo: number;
}

function ExtremityItemRow({ name, clo }: ExtremityItemRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-slate-200/80 bg-white/45 px-2.5 py-2">
      <span className="min-w-0 text-slate-900 font-semibold leading-snug">{name}</span>
      <span className="shrink-0 rounded-full border border-slate-300/80 bg-slate-50/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
        {clo.toFixed(2)} clo
      </span>
    </div>
  );
}

/**
 * Displays recommended handwear with clo value
 */
export function HandwearDisplay({ handwear }: HandwearDisplayProps) {
  return (
    <li className="flex flex-col gap-1.5">
      <span className="text-xs uppercase text-slate-900/60 tracking-wide">Gloves</span>
      <ExtremityItemRow name={handwear.name} clo={handwear.rcl} />
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
        <li className="flex flex-col gap-1.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">Helmet</span>
          <ExtremityItemRow name={headwear.helmet.name} clo={headwear.helmet.rcl} />
        </li>
      )}
      {headwear.head_warmth && (
        <li className="flex flex-col gap-1.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">Head</span>
          <ExtremityItemRow name={headwear.head_warmth.name} clo={headwear.head_warmth.rcl} />
        </li>
      )}
      {headwear.neck_warmth && (
        <li className="flex flex-col gap-1.5">
          <span className="text-xs uppercase text-slate-900/60 tracking-wide">Neck</span>
          <ExtremityItemRow name={headwear.neck_warmth.name} clo={headwear.neck_warmth.rcl} />
        </li>
      )}
    </>
  );
}
