"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { GarmentThermalProperties, EstimationMethod } from "@/types/garments";

// Extended WardrobeItem interface with full details
interface WardrobeItemDetails {
  brand: string;
  model_name: string;
  category?: string;
  garment_type?: string;
  handwear_type?: string;
  headwear_type?: string;
  // Garment-specific
  covers_torso?: boolean;
  covers_arms?: boolean;
  covers_legs?: boolean;
  covers_head?: boolean;
  hood_type?: string;
  garment_thermal_properties?: GarmentThermalProperties | GarmentThermalProperties[];
  // Handwear-specific
  rcl_clo?: number;
  dexterity_score?: number;
  // Headwear-specific
  covers_ears?: boolean;
  covers_neck?: boolean;
  covers_face?: boolean;
}

export interface WardrobeItem {
  id: string;
  item_type: "garment" | "handwear" | "headwear";
  item_id: string;
  nickname?: string;
  details: WardrobeItemDetails;
}

interface ItemDetailCardProps {
  item: WardrobeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEstimationMethod(method: EstimationMethod | undefined): string {
  if (!method) return "—";
  const labels: Record<EstimationMethod, string> = {
    lab_tested: "Lab Tested",
    derived_from_similar: "Derived from Similar",
    calculated_from_materials: "Calculated from Materials",
  };
  return labels[method] || method;
}

function formatConfidence(score: number | undefined): string {
  if (score === undefined) return "—";
  if (score >= 0.9) return "High";
  if (score >= 0.7) return "Medium";
  return "Low";
}

function formatValue(value: number | undefined | null, decimals: number = 3): string {
  if (value === undefined || value === null) return "—";
  return value.toFixed(decimals);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4 mb-2">
      {children}
    </h4>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      {formatCategory(category)}
    </span>
  );
}

// Standardized thermal data table with all body segments
function ThermalTable({
  title,
  unit,
  head,
  torso,
  arms,
  hands,
  legs,
  wholeBody,
}: {
  title: string;
  unit?: string;
  head?: number | null;
  torso?: number | null;
  arms?: number | null;
  hands?: number | null;
  legs?: number | null;
  wholeBody?: number | null;
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
              <td className="px-3 py-1.5 text-muted-foreground">Whole Body</td>
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

function DataQualityTable({
  estimationMethod,
  confidenceScore,
}: {
  estimationMethod?: EstimationMethod;
  confidenceScore?: number;
}) {
  return (
    <>
      <SectionHeader>Data Quality</SectionHeader>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Method</td>
              <td className="px-3 py-1.5 text-right">{formatEstimationMethod(estimationMethod)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-muted-foreground">Confidence</td>
              <td className="px-3 py-1.5 text-right">{formatConfidence(confidenceScore)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function GarmentDetails({ details }: { details: WardrobeItemDetails }) {
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

function HandwearDetails({ details }: { details: WardrobeItemDetails }) {
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

function HeadwearDetails({ details }: { details: WardrobeItemDetails }) {
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

function ItemDetailContent({ item }: { item: WardrobeItem }) {
  const category =
    item.details.category ||
    item.details.handwear_type ||
    item.details.headwear_type ||
    "";

  return (
    <div className="flex flex-col gap-2">
      {category && <CategoryBadge category={category} />}

      {item.item_type === "garment" && <GarmentDetails details={item.details} />}
      {item.item_type === "handwear" && <HandwearDetails details={item.details} />}
      {item.item_type === "headwear" && <HeadwearDetails details={item.details} />}
    </div>
  );
}

export function ItemDetailCard({ item, open, onOpenChange }: ItemDetailCardProps) {
  const isMobile = useIsMobile();

  if (!item) return null;

  const title = `${item.details.brand} ${item.details.model_name}`;
  const description = item.nickname || "Wardrobe item details";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm pb-8 overflow-y-auto max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <div className="px-4">
              <ItemDetailContent item={item} />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ItemDetailContent item={item} />
      </DialogContent>
    </Dialog>
  );
}
