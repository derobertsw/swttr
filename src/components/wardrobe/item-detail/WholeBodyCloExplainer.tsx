import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function WholeBodyCloExplainer({
}: {
  wholeBody?: number | null;
  torso?: number | null;
  arms?: number | null;
  legs?: number | null;
} = {}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="How whole-body value is calculated"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6} className="max-w-60">
        Weighted whole-body estimate across torso, arms, and legs insulation.
      </TooltipContent>
    </Tooltip>
  );
}
