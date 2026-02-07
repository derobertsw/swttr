import { WardrobeItem } from "@/types/wardrobe";
import { formatValue } from "../wardrobe-utils";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";
import { DataQualityTable } from "./DataQualityTable";

export function GarmentDetails({ details }: { details: WardrobeItem["details"] }) {
  // Handle both single object and array (Supabase returns array for one-to-one joins sometimes)
  const thermalProps = Array.isArray(details.garment_thermal_properties)
    ? details.garment_thermal_properties[0]
    : details.garment_thermal_properties;

  return (
    <>
      <ThermalTable
        title="Thermal Resistance"
        unit="clo"
        wholeBody={thermalProps?.rcl_whole_body}
        head={details.covers_head ? thermalProps?.rcl_whole_body : undefined}
        torso={thermalProps?.rcl_torso}
        arms={thermalProps?.rcl_arms}
        legs={thermalProps?.rcl_legs}
        showWholeBodyExplainer
      />

      <ThermalTable
        title="Evaporative Resistance"
        unit="m²Pa/W"
        wholeBody={thermalProps?.recl_whole_body}
        torso={thermalProps?.recl_torso}
        arms={thermalProps?.recl_arms}
        legs={thermalProps?.recl_legs}
      />

      <SectionHeader>Breathability</SectionHeader>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Permeability Index (im)</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(thermalProps?.im_whole_body)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Evap. Potential (im/clo)</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(thermalProps?.evap_potential)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <DataQualityTable
        estimationMethod={thermalProps?.estimation_method}
        confidenceScore={thermalProps?.confidence_score}
      />
    </>
  );
}
