import { Lightbulb } from "lucide-react";

interface GuidanceSectionProps {
  tips: string[];
}

export function GuidanceSection({ tips }: GuidanceSectionProps) {
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
