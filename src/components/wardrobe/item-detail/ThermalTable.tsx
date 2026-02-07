import { formatValue } from "../wardrobe-utils";
import { SectionHeader } from "./SectionHeader";
import { WholeBodyCloExplainer } from "./WholeBodyCloExplainer";

export function ThermalTable({
  title,
  unit,
  head,
  torso,
  arms,
  hands,
  legs,
  wholeBody,
  showWholeBodyExplainer,
}: {
  title: string;
  unit?: string;
  head?: number | null;
  torso?: number | null;
  arms?: number | null;
  hands?: number | null;
  legs?: number | null;
  wholeBody?: number | null;
  showWholeBodyExplainer?: boolean;
}) {
  return (
    <>
      <SectionHeader>{title}{unit && ` (${unit})`}</SectionHeader>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left font-medium text-muted-foreground px-3 py-2">Segment</th>
              <th className="text-right font-medium text-muted-foreground px-3 py-2">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">
                Whole Body
                {showWholeBodyExplainer && (
                  <WholeBodyCloExplainer
                    wholeBody={wholeBody}
                    torso={torso}
                    arms={arms}
                    legs={legs}
                  />
                )}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(wholeBody)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Head</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(head)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Torso</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(torso)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Arms</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(arms)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Hands</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(hands)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Legs</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatValue(legs)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
