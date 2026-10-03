import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { BodyPart } from "@/types/wardrobe";
import { Button } from "@/components/ui/button";
import { formatBodyPartLabel } from "./wardrobe-utils";

/** The id of a body area's heading, which takes focus when its last row goes. */
export function sectionHeadingId(area: BodyPart) {
  return `wardrobe-section-${area}`;
}

interface BodyPartSectionProps {
  area: BodyPart;
  itemCount: number;
  /** Offers to add gear here when the section is empty. */
  onAddGear: () => void;
  /** One WardrobeItemRow per item. */
  children: ReactNode;
}

export function BodyPartSection({ area, itemCount, onAddGear, children }: BodyPartSectionProps) {
  const label = formatBodyPartLabel(area);
  const headingId = sectionHeadingId(area);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} tabIndex={-1} className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
        {label}
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {itemCount}
          <span className="sr-only"> {itemCount === 1 ? "item" : "items"}</span>
        </span>
      </h2>
      {itemCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-dashed border-border py-2 pr-2 pl-4">
          <p className="text-sm text-muted-foreground">No {label.toLowerCase()} gear yet.</p>
          <Button type="button" variant="ghost" size="sm" onClick={onAddGear}>
            <Plus />
            Add {label.toLowerCase()} gear
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}
