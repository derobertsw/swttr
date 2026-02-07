import { WardrobeItem } from "@/types/wardrobe";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";

export function HeadwearDetails({ details }: { details: WardrobeItem["details"] }) {
  return (
    <>
      <ThermalTable
        title="Thermal Resistance"
        unit="clo"
        head={details.rcl_clo}
      />

      <SectionHeader>Coverage</SectionHeader>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Ears</td>
              <td className="px-3 py-1.5 text-right">{details.covers_ears ? "Yes" : "No"}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Neck</td>
              <td className="px-3 py-1.5 text-right">{details.covers_neck ? "Yes" : "No"}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Face</td>
              <td className="px-3 py-1.5 text-right">{details.covers_face ? "Yes" : "No"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
