/** Personal requirements from accepted saved kits (#177); checks belong to #171. */
export interface TripPackingUse {
  date: string;
  purpose: "wear" | "carry";
  phase: string;
  kit_id: string;
}

export interface TripPackingRequirement {
  id: string;
  name: string;
  kind: "owned" | "suggestion" | "unresolved" | "manual";
  quantity: number;
  uses: TripPackingUse[];
}

export interface TripPackingManualItem {
  id: string;
  name: string;
  quantity: number;
}

export interface TripPackingSnapshot {
  revision: number;
  requirements: TripPackingRequirement[];
  manual_items: TripPackingManualItem[];
  quantities: Record<string, number>;
}

export interface TripPackingChanges {
  added: TripPackingRequirement[];
  removed: TripPackingRequirement[];
  changed: Array<{ before: TripPackingRequirement; after: TripPackingRequirement }>;
}

export interface TripPackingReview extends TripPackingSnapshot {
  proposed: TripPackingRequirement[];
  changes: TripPackingChanges;
  source_revision: string;
  proposal_revision: string;
}
