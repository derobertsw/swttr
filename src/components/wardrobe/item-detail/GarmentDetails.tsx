import { WardrobeItem } from "@/types/wardrobe";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";
import { DataQualityTable } from "./DataQualityTable";
import { formatDetailValue } from "./detail-formatters";

export function GarmentDetails({ details }: { details: WardrobeItem["details"] }) {
  // Handle both single object and array (Supabase returns array for one-to-one joins sometimes)
  const thermalProps = Array.isArray(details.garment_thermal_properties)
    ? details.garment_thermal_properties[0]
    : details.garment_thermal_properties;
  return (
    <>
      <Tabs defaultValue="clo" className="mt-1">
        <TabsList className="w-full bg-muted/45">
          <TabsTrigger value="clo">Clo</TabsTrigger>
          <TabsTrigger value="evap">Evap</TabsTrigger>
          <TabsTrigger value="breath">Breathability</TabsTrigger>
        </TabsList>

        <TabsContent value="clo">
          <ThermalTable
            title="Thermal Resistance"
            unit="clo"
            metricTooltip="Rcl measures resistance to dry heat loss. Higher values are warmer."
            wholeBody={thermalProps?.rcl_whole_body}
            head={details.covers_head ? thermalProps?.rcl_whole_body : undefined}
            torso={thermalProps?.rcl_torso}
            arms={thermalProps?.rcl_arms}
            legs={thermalProps?.rcl_legs}
            showWholeBodyExplainer
          />
        </TabsContent>

        <TabsContent value="evap">
          <ThermalTable
            title="Evaporative Resistance"
            unit="m²Pa/W"
            metricTooltip="Recl measures resistance to moisture evaporation. Higher values reduce breathability."
            wholeBody={thermalProps?.recl_whole_body}
            torso={thermalProps?.recl_torso}
            arms={thermalProps?.recl_arms}
            legs={thermalProps?.recl_legs}
          />
        </TabsContent>

        <TabsContent value="breath">
          <SectionHeader>Breathability</SectionHeader>
          <div className="rounded-xl border border-border/70 bg-background/35 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Permeability (im)</p>
                <p className="mt-1 font-mono text-lg font-semibold">{formatDetailValue(thermalProps?.im_whole_body)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/65 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Evap potential</p>
                <p className="mt-1 font-mono text-lg font-semibold">{formatDetailValue(thermalProps?.evap_potential)}</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DataQualityTable
        estimationMethod={thermalProps?.estimation_method}
        confidenceScore={thermalProps?.confidence_score}
      />
    </>
  );
}
