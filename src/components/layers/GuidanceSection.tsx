import { Lightbulb } from "lucide-react";

interface GuidanceSectionProps {
  tips: string[];
}

export function GuidanceSection({ tips }: GuidanceSectionProps) {
  if (tips.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/30 bg-white/55 backdrop-blur-[3px] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-900">
        <Lightbulb className="size-4" />
        Tips
      </h3>
      <ul className="flex flex-col gap-3">
        {tips.slice(0, 4).map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-800">
            <span className="flex-shrink-0 text-slate-500">•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
