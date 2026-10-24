import { useId } from "react";
import { Backpack } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CarryCardProps {
  /** Items carried, not worn, during the shown phase. */
  items: string[];
  phase: "climb" | "descent";
  /** False on a trip day, whose parts aren't cards (#330). */
  framed?: boolean;
}

/** What goes in the pack during the shown ski-touring phase. */
export function CarryCard({ items, phase, framed = true }: CarryCardProps) {
  const headingId = useId();
  const Frame = framed ? Card : "div";

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h3 id={headingId} className="text-xl font-semibold text-foreground">Carry</h3>
        <p className="text-sm text-muted-foreground">
          {phase === "climb" ? "In your pack until the descent." : "Back in your pack for the descent."}
        </p>
      </div>
      <Frame>
        {items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {items.map((name) => (
              <li key={name} className="flex items-center gap-2 text-base text-foreground">
                <Backpack className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing extra to carry.</p>
        )}
      </Frame>
    </section>
  );
}
