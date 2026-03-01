import { WardrobeItem } from "@/types/wardrobe";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";
import { formatDetailValue, getHeadCoverageAreas } from "./detail-formatters";

export function HeadwearDetails({ details }: { details: WardrobeItem["details"] }) {
  const coverage = getHeadCoverageAreas(details);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-muted/15 p-2">
        <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Thermal</p>
          <p className="mt-1 font-mono text-lg font-semibold">{formatDetailValue(details.rcl_clo)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coverage</p>
          <p className="mt-1 text-sm font-semibold">{coverage.length > 0 ? `${coverage.length} areas` : "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {coverage.length > 0 ? coverage.join(" • ") : "No coverage metadata"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
          <p className="mt-1 truncate text-sm font-semibold">
            {details.headwear_type?.replace(/_/g, " ") ?? "—"}
          </p>
        </div>
      </div>

      <ThermalTable
        title="Thermal Resistance"
        unit="clo"
        metricTooltip="Rcl measures resistance to dry heat loss. Higher values are warmer."
        summaryLabel="Head"
        head={details.rcl_clo}
        segments={["head"]}
        showBreakdown={false}
      />

      <SectionHeader>Coverage</SectionHeader>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="w-full text-sm">
          <tbody>
            <tr className="bg-background/75">
              <td className="px-3 py-1.5 text-muted-foreground">Ears</td>
              <td className="px-3 py-1.5 text-right font-medium">{details.covers_ears ? "Covered" : "—"}</td>
            </tr>
            <tr className="bg-muted/10">
              <td className="px-3 py-1.5 text-muted-foreground">Neck</td>
              <td className="px-3 py-1.5 text-right font-medium">{details.covers_neck ? "Covered" : "—"}</td>
            </tr>
            <tr className="bg-background/75">
              <td className="px-3 py-1.5 text-muted-foreground">Face</td>
              <td className="px-3 py-1.5 text-right font-medium">{details.covers_face ? "Covered" : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
