import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SectionHeader({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <h4 className="mb-2 mt-4 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>{children}</span>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center text-muted-foreground/80 hover:text-foreground transition-colors"
              aria-label="More information"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={6} className="max-w-56">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </h4>
  );
}
