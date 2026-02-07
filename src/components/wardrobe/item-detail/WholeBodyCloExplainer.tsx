import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatValue } from "../wardrobe-utils";

export function WholeBodyCloExplainer({
  wholeBody,
  torso,
  arms,
  legs,
}: {
  wholeBody?: number | null;
  torso?: number | null;
  arms?: number | null;
  legs?: number | null;
}) {
  if (!wholeBody) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center text-muted-foreground hover:text-foreground ml-1">
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">How whole body clo is calculated</h4>
          <p className="text-xs text-muted-foreground">
            Whole body insulation is a weighted average of body regions:
          </p>
          <div className="text-xs font-mono bg-muted p-2 rounded space-y-1">
            <div>Torso: {formatValue(torso)} clo × 50%</div>
            <div>Arms: {formatValue(arms)} clo × 25%</div>
            <div>Legs: {formatValue(legs)} clo × 25%</div>
            <div className="border-t pt-1 mt-1 font-semibold">
              = {formatValue(wholeBody)} clo overall
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
