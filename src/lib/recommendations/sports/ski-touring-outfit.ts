/**
 * Ski touring outfits (#372): a climb fitted region by region, and descent
 * pack layers added per region on top of the climb clothing.
 */
import { classifyPrecipitation, needsXCWindProtection } from '@/lib/biophysics/xc-policy';
import type { PrecipitationType } from '@/types/weather';
import { garmentCapabilities } from '../garment-semantics';
import { sortByBreathability } from '../sorting';
import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';
import { buildRegionalEnsemble } from './regional-ensemble';
import { xcProtection, xcRegionFit } from './xc-outfit';

type Region = 'torso' | 'legs';
type Regional = PhaseTargets['regional'];

/** Protection the climb itself must wear. */
export interface ClimbProtection { wind: boolean; wet: boolean }

/** Layers added at the transition, each for its own region. */
interface DescentPack {
  shell: GarmentRow | null;
  /** Upper-body warmth: a fleece or puffy. */
  insulation: GarmentRow | null;
  legs: GarmentRow | null;
}

/** Shells whose purpose is protection rather than warmth. */
const PROTECTIVE_SHELLS = ['hard_shell', 'windbreaker'];
const MID_LAYERS = ['mid_layer_light', 'mid_layer_heavy'];
const PUFFIES = ['insulation_down', 'insulation_synthetic'];
/** Leg layers that go on over climbing pants at the transition. Base and
 * fleece layers go underneath, so they are never added for the descent. */
const LEG_INSULATION = ['outer_insulated', ...PUFFIES];
const OVER_PANTS = ['hard_shell', 'soft_shell', 'windbreaker', ...LEG_INSULATION];
const PROTECTIVE_OUTERS = [...PROTECTIVE_SHELLS, 'outer_insulated'];

/**
 * The climb's wind and wet needs. Wind uses the XC thresholds at the climb's
 * own effective wind, the same wind its targets use. Rain, mixed or
 * near-melting snow is wet; colder snow alone does not force a waterproof
 * layer.
 */
export function climbProtection(
  tempC: number, climbWindMs: number, precipitation: boolean, precipitationType?: PrecipitationType,
): ClimbProtection {
  return {
    wind: needsXCWindProtection(tempC, climbWindMs),
    wet: classifyPrecipitation(precipitation, precipitationType, tempC) === 'wet',
  };
}

/** A base or mid layer, or a reviewed standalone garment, can sit next to skin. */
const nextToSkin = (g: GarmentRow) =>
  g.category === 'base_layer' || MID_LAYERS.includes(g.category) || garmentCapabilities(g).standalone;
/** Reviewed standalone clothing or any mid or outer covers thermal underwear. */
const covering = (g: GarmentRow) =>
  garmentCapabilities(g).standalone || (g.category !== 'base_layer' && g.usage !== 'underlayer');
const evap = (g: GarmentRow) => g.garment_thermal_properties?.evap_potential ?? 0;

/**
 * Pick the climb outfit per region with the regional search shared with
 * alpine and XC (one garment per slot per covered region). No base layer is
 * mandatory: a reviewed standalone garment can be worn alone. Puffies and
 * insulated outerwear stay in the pack. A hard shell or windbreaker is worn
 * only when the climb needs wind or wet protection, or when it is the only
 * thing that can cover a region; otherwise it goes in the pack.
 *
 * Rank: cover every region, then no unneeded protective shell, then
 * required protection (waterproof when wet), then a layer that can sit next
 * to skin, then no severe excess, then more than thermal underwear alone,
 * then the regional fit, breathability and fewer layers. Fit uses the shared
 * regional prediction, as the evaluation does.
 */
export function buildTouringClimbEnsemble(
  categorized: CategorizedGarments,
  targets: Regional,
  needs: ClimbProtection,
  minEvapPotential: number,
): GarmentRow[] {
  const climb: CategorizedGarments = { ...categorized, insulation: [] };
  const protectionNeeded = needs.wind || needs.wet;
  return buildRegionalEnsemble(climb, targets, {
    puffyFitsUnder: () => true,
    rank: () => [], // The climb uses the assessment below.
    assess: (outfit, region) => {
      const regional = outfit.filter((g) => g[`covers_${region}`]);
      const { deficit, excess, severeExcess } = xcRegionFit(outfit, targets, region);
      const waterproof = regional.some((g) => g.garment_protection?.waterproof_rating === 'waterproof'
        && xcProtection([g], region, { wind: false, wet: true }));
      return [
        Number(regional.length === 0),
        protectionNeeded ? 0 : regional.filter((g) => PROTECTIVE_SHELLS.includes(g.category)).length,
        Number(!xcProtection(outfit, region, needs)),
        needs.wet ? Number(!waterproof) : 0,
        Number(regional.length > 0 && !regional.some(nextToSkin)),
        severeExcess,
        Number(regional.length > 0 && !regional.some(covering)),
        deficit + excess,
        excess,
        regional.filter((g) => evap(g) < minEvapPotential).length,
        regional.length,
        -regional.reduce((sum, g) => sum + evap(g), 0),
      ];
    },
  });
}

/** The descent's mandatory shell: a hard shell when any is available. */
function selectDescentShell(candidates: GarmentRow[]): GarmentRow | null {
  const hardShells = candidates.filter((s) => s.category === 'hard_shell');
  if (hardShells.length > 0) return hardShells[0];
  return sortByBreathability(candidates)[0] ?? null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Lexicographic comparison: the first differing value decides. */
function isBetter(rank: number[], than: number[]): boolean {
  const i = rank.findIndex((value, j) => value !== than[j]);
  return i >= 0 && rank[i] > than[i];
}

const upperBody = (g: GarmentRow) => (g.covers_torso || g.covers_arms) && !g.covers_legs;

/** Distance from a region's descent band. The descent is the cold phase, so
 * a shortfall counts double an excess, as in the accessory fallback. */
function descentGap(outfit: GarmentRow[], targets: Regional, region: Region): number {
  const fit = xcRegionFit(outfit, targets, region);
  return 2 * fit.deficit + fit.excess;
}

/**
 * Add one packed layer to a region when the clothing already worn falls
 * short of the region's descent minimum. Only layers that bring the region
 * closer to its band qualify. Each is scored by the share of the gap it
 * closes, traded against weight as the pack always was (70/30, or 40/60
 * with `prioritizeLightPack`). Unless a light pack is asked for, a layer
 * that reaches the minimum beats one that doesn't, however light, and when
 * none reaches it the layer leaving the smallest gap wins, with weight only
 * breaking ties: lightness never buys a colder descent (#374).
 */
function packForRegion(
  worn: GarmentRow[],
  candidates: GarmentRow[],
  targets: Regional,
  region: Region,
  prioritizeLightPack: boolean,
): GarmentRow | null {
  if (xcRegionFit(worn, targets, region).deficit <= 0) return null;
  const before = descentGap(worn, targets, region);
  let best: { garment: GarmentRow; rank: [number, number, number] } | null = null;
  for (const garment of candidates) {
    const outfit = [...worn, garment];
    const after = descentGap(outfit, targets, region);
    const closed = (before - after) / before;
    if (closed <= 1e-6) continue;
    const weightScore = Math.max(0, 1.0 - ((garment.weight_grams ?? 500) - 200) / 600);
    const score = prioritizeLightPack ? closed * 0.4 + weightScore * 0.6 : closed * 0.7 + weightScore * 0.3;
    const reaches = prioritizeLightPack || xcRegionFit(outfit, targets, region).deficit <= 0 ? 1 : 0;
    // Higher is better, compared in order.
    const rank: [number, number, number] = reaches ? [1, score, 0] : [0, -round2(after), score];
    if (!best || isBetter(rank, best.rank)) {
      best = { garment, rank };
    }
  }
  return best?.garment ?? null;
}

/**
 * Descent pack: the mandatory hard shell over the torso when the climb
 * didn't wear one, then a fleece or puffy for the upper body and a leg
 * layer over the climbing pants, each only when its region would otherwise
 * fall short of the descent minimum. The climb clothing stays on.
 */
export function selectDescentPack(
  climb: GarmentRow[],
  pool: { shells: GarmentRow[]; insulation: GarmentRow[]; legs: GarmentRow[] },
  targets: Regional,
  prioritizeLightPack: boolean,
): DescentPack {
  const worn = new Set(climb.map((g) => g.id));
  const notWorn = (g: GarmentRow) => !worn.has(g.id);
  const climbHasTorsoHardShell = climb.some((g) => g.category === 'hard_shell' && upperBody(g));
  const shell = climbHasTorsoHardShell
    ? null
    : selectDescentShell(pool.shells.filter((g) => upperBody(g) && notWorn(g)));
  const withShell = shell ? [...climb, shell] : climb;
  // A fleece or puffy goes with the shell; insulated outerwear would replace it.
  const insulation = packForRegion(withShell, pool.insulation.filter((g) => upperBody(g) && notWorn(g)
    && [...MID_LAYERS, ...PUFFIES].includes(g.category)), targets, 'torso', prioritizeLightPack);
  // Over shell or insulated pants only insulation helps; soft-shell pants
  // can take a protective shell or insulation, but not another soft shell.
  const legOuters = climb.filter((g) => g.covers_legs).map((g) => g.category);
  const overPants = legOuters.some((c) => PROTECTIVE_OUTERS.includes(c)) ? LEG_INSULATION
    : legOuters.includes('soft_shell') ? [...PROTECTIVE_SHELLS, ...LEG_INSULATION] : OVER_PANTS;
  const legs = packForRegion(climb, pool.legs.filter((g) => g.covers_legs && notWorn(g) && g.id !== shell?.id
    && overPants.includes(g.category)), targets, 'legs', prioritizeLightPack);
  return { shell, insulation, legs };
}
