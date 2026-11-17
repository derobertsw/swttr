import { describe, expect, it } from 'vitest';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import type { PhaseEvaluation, ThermalDecision } from '@/types/biophysics';
import { ensembleToThermalGarments } from './formatting';
import type { GarmentRow, GarmentVentilationProps } from './types';
import { ventilationAdvice, withVentTransitionStep } from './ventilation';

function garment(id: string, overrides: Partial<GarmentRow> = {}, recl = 20): GarmentRow {
  return {
    id,
    brand: 'Test',
    model_name: id,
    category: 'hard_shell',
    covers_torso: true,
    covers_arms: true,
    covers_legs: false,
    garment_thermal_properties: {
      rcl_torso: 0.3, rcl_arms: 0.25, rcl_legs: 0.3, rcl_whole_body: 0.2,
      recl_torso: recl, recl_arms: recl, recl_legs: recl, recl_whole_body: recl,
    },
    garment_protection: { windproof_rating: 'windproof', waterproof_rating: 'waterproof' },
    ...overrides,
  };
}

const pitZips = (factor: GarmentVentilationProps['ventilation_factor'] = 0.65): GarmentVentilationProps =>
  ({ has_pit_zips: true, ventilation_factor: factor });

/** Very high evaporative resistance: breathability well below any target. */
const STUFFY = 200;
/** Very low evaporative resistance: breathability above any target. */
const AIRY = 1;

function evaluation(
  riskType: ThermalDecision['riskType'] = 'comfortable',
  status: { torso?: 'under' | 'in_range' | 'over'; legs?: 'under' | 'in_range' | 'over' } = {}
): PhaseEvaluation {
  return {
    bodyParts: {
      torso: { status: status.torso ?? 'in_range' },
      legs: { status: status.legs ?? 'in_range' },
      hands: {},
      headNeck: {},
    },
    maxRegionalDeficit: null,
    maxExtremityDeficit: null,
    hasRegionalGap: null,
    hasExtremityGap: null,
    decision: { riskType, severity: 'moderate', delta: 0 },
    comfortScore: null,
  };
}

/** Alpine skiing at 145.5 W/m² (breathability target 0.15), then the chairlift. */
function alpineAdvice(
  ensemble: GarmentRow[],
  options: { windMs?: number; precipitation?: boolean; evaluation?: PhaseEvaluation } = {}
) {
  return ventilationAdvice({
    windMs: options.windMs ?? 3,
    precipitation: options.precipitation ?? false,
    active: { phase: 'skiing', ensemble, metabolicRate: 145.5, evaluation: options.evaluation ?? evaluation() },
    rest: [{ phase: 'chairlift', ensemble }],
  });
}

function evap(ensemble: GarmentRow[]) {
  return predictEnsembleThermal(ensembleToThermalGarments(ensemble)).evapPotential;
}

describe('ventilationAdvice', () => {
  it('names only vents the selected garment lists, per phase', () => {
    const shell = garment('shell', { garment_ventilation: pitZips() }, STUFFY);
    const result = alpineAdvice([garment('base', { category: 'base_layer' }), shell]);

    expect(result?.advice).toEqual([
      expect.objectContaining({ garment_id: 'shell', garment_name: 'Test shell', vent: 'pit_zips', region: 'torso', phase: 'skiing', setting: 'open', basis: 'outfit', message: 'Open pit zips while skiing' }),
      expect.objectContaining({ garment_id: 'shell', vent: 'pit_zips', phase: 'chairlift', setting: 'closed', basis: 'phase', message: 'Close pit zips before the chairlift' }),
    ]);
  });

  it('gives no advice for missing, empty or non-adjustable vent records', () => {
    expect(alpineAdvice([garment('none', {}, STUFFY)])).toBeUndefined();
    expect(alpineAdvice([garment('null', { garment_ventilation: null }, STUFFY)])).toBeUndefined();
    // A factor alone (no listed vent) is not a vent the wearer can open.
    expect(alpineAdvice([garment('factor-only', { garment_ventilation: { ventilation_factor: 0.75 } }, STUFFY)])).toBeUndefined();
    expect(alpineAdvice([garment('fixed', { garment_ventilation: { has_back_vent: true, mesh_lined_pockets: true, ventilation_factor: 0.7 } }, STUFFY)])).toBeUndefined();
    // Vents a garment can't have where it doesn't cover the body are ignored.
    expect(alpineAdvice([garment('jacket', { garment_ventilation: { has_thigh_vents: true } }, STUFFY)])).toBeUndefined();
  });

  it('reads an array-shaped relation and maps leg vents to the legs', () => {
    const pants = garment('pants', {
      covers_torso: false, covers_arms: false, covers_legs: true,
      garment_ventilation: [{ has_side_vents: true, has_thigh_vents: true, ventilation_factor: '0.60' }],
    }, STUFFY);
    const skiing = alpineAdvice([garment('jacket', {}, STUFFY), pants])?.advice.filter((a) => a.phase === 'skiing');

    expect(skiing?.map((a) => [a.vent, a.region, a.setting])).toEqual([
      ['side_vents', 'legs', 'open'],
      ['thigh_vents', 'legs', 'open'],
    ]);
  });

  it('applies the factor once per garment region before the ensemble regression', () => {
    const base = garment('base', { category: 'base_layer' });
    // Pit zips and a two-way zip both vent the torso: one factor, applied once.
    const shell = garment('shell', { garment_ventilation: { has_pit_zips: true, main_zip_two_way: true, ventilation_factor: 0.6 } }, STUFFY);
    const result = alpineAdvice([base, shell]);

    const manual = ensembleToThermalGarments([base, shell]);
    manual[1] = { ...manual[1], reclTorso: manual[1].reclTorso * 0.6 };
    expect(result?.estimates).toEqual([{
      phase: 'skiing',
      garment_ids: ['shell'],
      closed_evap_potential: evap([base, shell]),
      open_evap_potential: predictEnsembleThermal(manual).evapPotential,
      breathability_target: 0.15,
      basis: 'estimate',
    }]);
    expect(result!.estimates[0].open_evap_potential).toBeGreaterThan(result!.estimates[0].closed_evap_potential);
    expect(result?.advice.filter((a) => a.setting === 'open').every((a) => a.effect_estimated)).toBe(true);
  });

  it.each([
    ['1.0 (no benefit)', 1],
    ['missing', null],
    ['below the schema range', 0.1],
    ['above 1', 1.5],
    ['not a number', 'n/a'],
  ])('keeps qualified open advice but estimates nothing when the factor is %s', (_, factor) => {
    const result = alpineAdvice([garment('shell', { garment_ventilation: pitZips(factor) }, STUFFY)]);
    const open = result?.advice.find((a) => a.phase === 'skiing');

    expect(open).toMatchObject({ setting: 'open', effect_estimated: false });
    expect(open?.reason).toContain('no breathability gain is estimated');
    expect(result?.estimates).toEqual([]);
  });

  it('does not change the garments it reads', () => {
    const shell = garment('shell', { garment_ventilation: pitZips() }, STUFFY);
    const before = structuredClone(shell);
    alpineAdvice([shell]);
    expect(shell).toEqual(before);
  });

  describe('opening conditions', () => {
    const vented = () => [garment('shell', { garment_ventilation: pitZips() }, STUFFY)];
    const skiing = (result: ReturnType<typeof alpineAdvice>) => result?.advice.find((a) => a.phase === 'skiing');

    it('keeps vents closed when precipitation is expected', () => {
      const result = alpineAdvice(vented(), { precipitation: true });
      expect(skiing(result)).toMatchObject({ setting: 'closed', basis: 'weather', message: 'Keep pit zips closed while skiing' });
      expect(skiing(result)?.reason).toMatch(/snow or rain/);
      expect(result?.estimates).toEqual([]);
      expect(result?.advice.find((a) => a.phase === 'chairlift')?.message).toBe('Keep pit zips closed on the chairlift');
    });

    it('keeps vents closed from 8 m/s of ambient wind', () => {
      expect(skiing(alpineAdvice(vented(), { windMs: 7.9 }))?.setting).toBe('open');
      expect(skiing(alpineAdvice(vented(), { windMs: 8 }))).toMatchObject({ setting: 'closed', basis: 'weather' });
    });

    it('keeps vents closed when the outfit is cooler than recommended', () => {
      expect(skiing(alpineAdvice(vented(), { evaluation: evaluation('cold') }))).toMatchObject({ setting: 'closed', basis: 'outfit' });
    });

    it('keeps vents closed over a body region below its minimum', () => {
      const shell = garment('shell', { garment_ventilation: pitZips() }, STUFFY);
      const pants = garment('pants', { covers_torso: false, covers_arms: false, covers_legs: true, garment_ventilation: { has_thigh_vents: true, ventilation_factor: 0.7 } }, STUFFY);
      const result = alpineAdvice([shell, pants], { evaluation: evaluation('comfortable', { legs: 'under' }) });
      const settings = result?.advice.filter((a) => a.phase === 'skiing').map((a) => [a.vent, a.setting]);

      expect(settings).toEqual([['pit_zips', 'open'], ['thigh_vents', 'closed']]);
      expect(result?.estimates[0].garment_ids).toEqual(['shell']);
    });

    it('keeps vents closed when the closed outfit already breathes enough', () => {
      const ensemble = [garment('shell', { garment_ventilation: pitZips() }, AIRY)];
      expect(evap(ensemble)).toBeGreaterThanOrEqual(0.15);
      expect(skiing(alpineAdvice(ensemble))).toMatchObject({ setting: 'closed', basis: 'outfit', message: 'Keep pit zips closed while skiing' });
    });

    it('opens vents on a too-warm outfit without claiming to fix the warmth', () => {
      const ensemble = [garment('shell', { garment_ventilation: pitZips() }, AIRY)];
      const open = skiing(alpineAdvice(ensemble, { evaluation: evaluation('overheat') }));
      expect(open).toMatchObject({ setting: 'open', basis: 'outfit' });
      expect(open?.reason).toContain('does not remove the extra insulation');
    });
  });

  describe('ski touring phases', () => {
    const shell = garment('shell', { garment_ventilation: pitZips() }, STUFFY);
    const pants = garment('pants', { covers_torso: false, covers_arms: false, covers_legs: true, garment_ventilation: { has_thigh_vents: true, ventilation_factor: 0.7 } }, STUFFY);
    const packShell = garment('pack', { garment_ventilation: pitZips(0.6) }, STUFFY);
    const touring = (precipitation = false) => ventilationAdvice({
      windMs: 2,
      precipitation,
      active: { phase: 'climb', ensemble: [shell, pants], metabolicRate: 232.8, evaluation: evaluation() },
      rest: [{ phase: 'transition', ensemble: [shell, pants] }, { phase: 'descent', ensemble: [shell, pants, packShell] }],
    });

    it('opens on the climb, closes at the transition and stays closed for the descent', () => {
      const messages = touring()?.advice.map((a) => `${a.phase}: ${a.message}`);
      expect(messages).toEqual([
        'climb: Open pit zips while climbing',
        'climb: Open thigh vents while climbing',
        'transition: Close pit zips at the transition',
        'transition: Close thigh vents at the transition',
        'descent: Close pit zips at the transition and keep them closed for the descent',
        'descent: Close thigh vents at the transition and keep them closed for the descent',
        'descent: Keep pit zips closed for the descent',
      ]);
      expect(touring()?.estimates[0]).toMatchObject({ phase: 'climb', garment_ids: ['shell', 'pants'], breathability_target: 0.22 });
    });

    it('keeps every phase closed in precipitation', () => {
      const result = touring(true);
      expect(result?.advice.every((a) => a.setting === 'closed')).toBe(true);
      expect(result?.advice.find((a) => a.phase === 'descent')?.message).toBe('Keep pit zips closed for the descent');
    });

    it('adds closing opened vents to the transition protocol without changing the original', () => {
      const protocol = { priority: 'normal' as const, time_limit_minutes: null, steps: ['Handle skins and ski mode at normal pace'], warnings: [] };
      const withStep = withVentTransitionStep(protocol, touring());

      expect(withStep.steps).toEqual([
        'Handle skins and ski mode at normal pace',
        'Close the vents you opened for the climb: pit zips on the Test shell, thigh vents on the Test pants',
      ]);
      expect(protocol.steps).toHaveLength(1);
      expect(withVentTransitionStep(protocol, touring(true))).toBe(protocol);
      expect(withVentTransitionStep(protocol, undefined)).toBe(protocol);
    });
  });
});
