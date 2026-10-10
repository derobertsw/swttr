import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvaluatedBodyPart, EvaluationItem, PhaseEvaluationInput } from '@/types/biophysics';
import type { GarmentRow } from './types';
import { EVALUATED_BODY_PARTS } from './layer-evaluation';
import { hasUsableThermalData } from './garment-semantics';
import { formatGarmentResponse } from './formatting';

type ItemType = NonNullable<EvaluationItem['item_type']>;
type Row = Record<string, unknown> & { id: string };
const TABLES: Record<ItemType, string> = {
  garment: 'garments', handwear: 'handwear', headwear: 'headwear', custom: 'user_custom_items',
};

function known(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function resolveItem(item: EvaluationItem, part: EvaluatedBodyPart, row: Row | undefined): EvaluationItem {
  const unknown: EvaluationItem = {
    sourceId: item.sourceId, item_type: item.item_type, thermal_data_status: 'unknown',
  };
  // A source-free estimate is explicitly identified as such, never a substitute
  // for a catalog record that failed to load or was deleted.
  if (!item.sourceId) {
    return item.thermal_data_status !== "unknown" && item.thermal_provenance?.generic_estimate && known(item.rcl)
      ? { ...item, thermal_data_status: 'known' } : unknown;
  }
  if (!row) return unknown;
  if (item.item_type === 'garment') {
    const garment = row as unknown as GarmentRow;
    const response = formatGarmentResponse(garment);
    const region = part === 'torso' ? 'torso' : part === 'legs' ? 'legs' : null;
    const rcl = region && garment[`covers_${region}`]
      && hasUsableThermalData(garment) ? garment.garment_thermal_properties?.[`rcl_${region}`] : undefined;
    return {
      sourceId: item.sourceId, item_type: 'garment',
      garment_type: response.garment_type, usage: response.usage,
      coverage_torso: response.coverage_torso, coverage_arms: response.coverage_arms,
      coverage_legs: response.coverage_legs, suitable_activities: response.suitable_activities,
      thermal_provenance: response.thermal_provenance, protection: response.protection,
      thermal_data_status: known(rcl) ? 'known' : 'unknown', rcl: known(rcl) ? rcl : undefined,
    };
  }
  const matchesPart = item.item_type === 'handwear' ? part === 'hands'
    : item.item_type === 'headwear' ? part === 'headNeck' : row.body_part === part;
  const rcl = matchesPart && known(row.rcl_clo) ? row.rcl_clo : undefined;
  return {
    ...unknown, rcl, thermal_data_status: known(rcl) ? 'known' : 'unknown',
    ...(item.item_type === 'custom' && {
      thermal_provenance: { generic_estimate: true, data_source: 'user_custom_items' },
    }),
  };
}

/** One batched lookup per item type for both phases. Catalog records are public
 * through the API; custom records are restricted to the authenticated owner.
 * Query failures throw rather than masquerading as missing thermal data. */
export async function resolveEvaluationItems(
  phases: PhaseEvaluationInput[], supabase: SupabaseClient | null, userId: string | null,
): Promise<PhaseEvaluationInput[]> {
  const rows = new Map<ItemType, Map<string, Row>>();
  await Promise.all((Object.keys(TABLES) as ItemType[]).map(async type => {
    const ids = [...new Set(phases.flatMap(phase => EVALUATED_BODY_PARTS.flatMap(part =>
      (phase.items?.[part] ?? []).filter(item => item.item_type === type && item.sourceId)
        .map(item => item.sourceId!))))];
    if (!ids.length || (type === 'custom' && !userId)) return;
    if (!supabase) throw new Error('Catalog unavailable');
    let query = supabase.from(TABLES[type])
      .select(type === 'garment' ? '*, garment_thermal_properties(*), garment_protection(*)' : '*').in('id', ids);
    if (type === 'custom') query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw new Error('Failed to load evaluation items');
    rows.set(type, new Map(((data ?? []) as unknown as Row[]).map(row => [row.id, row])));
  }));
  return phases.map(phase => {
    if (!phase.items) return phase;
    const items = Object.fromEntries(EVALUATED_BODY_PARTS.map(part => [part,
      phase.items![part].map(item => resolveItem(item, part,
        item.item_type && item.sourceId ? rows.get(item.item_type)?.get(item.sourceId) : undefined)),
    ])) as NonNullable<PhaseEvaluationInput['items']>;
    return {
      ...phase, items,
      itemClo: Object.fromEntries(EVALUATED_BODY_PARTS.map(part => [part,
        items[part].map(item => item.rcl ?? null),
      ])) as PhaseEvaluationInput['itemClo'],
    };
  });
}
