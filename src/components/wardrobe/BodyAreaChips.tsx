import { chipClassName } from "@/components/ui/chip";
import type { BodyAreaFilter } from "@/hooks/useWardrobe";
import { cn } from "@/lib/utils";
import { BODY_AREAS, formatBodyPartLabel } from "./wardrobe-utils";

const OPTIONS: { value: BodyAreaFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...BODY_AREAS.map((area) => ({ value: area, label: formatBodyPartLabel(area) })),
];

/** Toggle chips that narrow a gear list to one body area. */
export function BodyAreaChips({
  value,
  onChange,
  className,
}: {
  value: BodyAreaFilter;
  onChange: (value: BodyAreaFilter) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Body area" className={cn("flex flex-wrap gap-2", className)}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={chipClassName}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
