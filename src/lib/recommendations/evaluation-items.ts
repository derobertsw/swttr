import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvaluatedBodyPart, EvaluationItem, PhaseEvaluationInput } from '@/types/biophysics';
import { EVALUATED_BODY_PARTS } from './layer-evaluation';
import { itemThermalMetadata, knownClo } from './item-thermal-metadata';
import { cacheCatalogRows, cachedCatalogRow } from './evaluation-catalog-cache';
import { garmentMetadata } from '@/lib/garment-metadata';
import { hoodInsulation } from './extremities';
import type { GarmentRow } from './types';

type ItemType = NonNullable<EvaluationItem['item_type']>;
type Row = Record<string, unknown> & { id: string };
const TABLES: Record<ItemType, string> = {
  garment: 'garments', handwear: 'handwear', headwear: 'headwear', custom: 'user_custom_items',
};

function resolveItem(item: EvaluationItem, part: EvaluatedBodyPart, row: Row | undefined): EvaluationItem {
  const unknown: EvaluationItem = {
    sourceId: item.sourceId, item_type: item.item_type, thermal_data_status: 'unknown',
  };
  // A source-free estimate is explicitly identified as such, never a substitute
  // for a catalog record that failed to load or was deleted.
  if (!item.sourceId) {
    return item.thermal_provenance?.generic_estimate && knownClo(item.rcl)
      ? { rcl: item.rcl, item_type: item.item_type, thermal_provenance: { generic_estimate: true }, thermal_data_status: 'known' } : unknown;
  }
  if (!row) return unknown;
  const metadata = itemThermalMetadata(item.item_type!, row);
  const matchesPart = item.item_type === 'garment' ? part === 'torso' || part === 'legs'
    : item.item_type === 'handwear' ? part === 'hands'
    : item.item_type === 'headwear' ? part === 'headNeck' : row.body_part === part;
  const localClo = item.item_type === 'garment'
    ? part === 'torso' ? metadata.rcl_torso : part === 'legs' ? metadata.rcl_legs : undefined
    : metadata.rcl_clo;
  const rcl = matchesPart && metadata.thermal_data_status === 'known' && knownClo(localClo) ? localClo : undefined;
  return {
    ...unknown, ...garmentMetadata(metadata), rcl,
    thermal_data_status: knownClo(rcl) ? 'known' : 'unknown',
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
    const byId = new Map<string, Row>();
    rows.set(type, byId);
    if (supabase && type !== 'custom') {
      for (const id of ids) {
        const cached = cachedCatalogRow(supabase, type, id);
        if (cached) byId.set(id, cached as Row);
      }
    }
    const missing = ids.filter(id => !byId.has(id));
    if (!missing.length) return;
    if (!supabase) throw new Error('Catalog unavailable');
    let query = supabase.from(TABLES[type])
      .select(type === 'garment' ? '*, garment_thermal_properties(*), garment_protection(*)' : '*').in('id', missing);
    if (type === 'custom') query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw new Error('Failed to load evaluation items');
    const loaded = (data ?? []) as unknown as Row[];
    if (type !== 'custom') cacheCatalogRows(supabase, type, loaded);
    for (const row of loaded) byId.set(row.id.toLowerCase(), row);
  }));
  return phases.map(phase => {
    if (!phase.items) return phase;
    const items = Object.fromEntries(EVALUATED_BODY_PARTS.map(part => [part,
      phase.items![part].map(item => resolveItem(item, part,
        item.item_type && item.sourceId ? rows.get(item.item_type)?.get(item.sourceId) : undefined)),
    ])) as NonNullable<PhaseEvaluationInput['items']>;
    return {
      ...phase, items,
      ...(phase.extremityMaxTargets ? {
        hoodClo: hoodInsulation(
          [...new Set(items.torso.filter(item => item.item_type === 'garment').map(item => item.sourceId))]
            .flatMap(id => {
              const row = id ? rows.get('garment')?.get(id) : undefined;
              return row ? [row as unknown as GarmentRow] : [];
            }),
          items.headNeck.some(item => item.item_type === 'headwear' && item.sourceId
            && rows.get('headwear')?.get(item.sourceId)?.headwear_type === 'ski_helmet'),
        ),
      } : {}),
      itemClo: Object.fromEntries(EVALUATED_BODY_PARTS.map(part => [part,
        items[part].map(item => item.rcl ?? null),
      ])) as PhaseEvaluationInput['itemClo'],
    };
  });
}
