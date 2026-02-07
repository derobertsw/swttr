import { WardrobeItem } from "@/types/wardrobe";
import { SectionHeader } from "./SectionHeader";
import { ThermalTable } from "./ThermalTable";

export function HandwearDetails({ details }: { details: WardrobeItem["details"] }) {
  return (
    <>
      <ThermalTable
        title="Thermal Resistance"
        unit="clo"
        hands={details.rcl_clo}
      />

      <SectionHeader>Performance</SectionHeader>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Dexterity Score</td>
              <td className="px-3 py-1.5 text-right font-mono">
                {details.dexterity_score !== undefined ? `${details.dexterity_score}/10` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
