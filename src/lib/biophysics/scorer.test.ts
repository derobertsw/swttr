import { describe, expect, it } from 'vitest';
import { outfitAirPermeability, scoreEnsemble, type GarmentWithProtection } from './scorer';

function jacket(category: string): GarmentWithProtection {
  return {
    garmentId: category,
    name: category,
    category,
    rclTorso: 1.5,
    rclArms: 1.2,
    rclLegs: 0,
    reclTorso: 30,
    reclArms: 30,
    reclLegs: 0,
    coversTorso: true,
    coversArms: true,
    coversLegs: false,
    windproofRating: 'windproof',
    waterproofRating: 'waterproof',
    waterproofMm: 20000,
  };
}

describe('scoreEnsemble weather protection', () => {
  it.each(['hard_shell', 'windbreaker', 'outer_insulated'])('credits a waterproof %s as the shell in wind and snow', (category) => {
    const score = scoreEnsemble(
      [jacket(category)],
      { temperature: -5, windSpeed: 9, humidity: 85, precipitation: true, precipitationType: 'snow' },
      { name: 'Alpine Skiing', metabolicRate: 145.5, hasStaticPeriods: true, staticMetabolicRate: 69.8, windExposure: 'exposed' },
      'alpine_skiing'
    );

    expect(score.componentScores.weatherProtection).toBe(100);
  });
});

describe('scoreEnsemble wind and motion', () => {
  const weather = { temperature: -5, windSpeed: 6, humidity: 60, precipitation: false };
  const skiing = { name: 'Alpine Skiing', metabolicRate: 145.5, hasStaticPeriods: false, windExposure: 'normal' as const };

  it('uses the least permeable covering layer separately for each region', () => {
    const fleece = { ...jacket('mid_layer_heavy'), windproofRating: 'none' as const, waterproofRating: 'none' as const };
    expect(outfitAirPermeability([])).toEqual({ torso: 1000, arms: 1000, legs: 1000 });
    expect(outfitAirPermeability([fleece])).toEqual({ torso: 1000, arms: 1000, legs: 1000 });
    expect(outfitAirPermeability([fleece, { ...fleece, windproofRating: 'wind_resistant' }]))
      .toEqual({ torso: 50, arms: 50, legs: 1000 });
    expect(outfitAirPermeability([fleece, { ...fleece, windproofRating: 'windproof' }]))
      .toEqual({ torso: 5, arms: 5, legs: 1000 });
    expect(outfitAirPermeability([fleece, jacket('hard_shell')])).toEqual({ torso: 1, arms: 1, legs: 1000 });
  });

  it('does not give exposed legs the membrane correction from a jacket', () => {
    const coat = jacket('hard_shell');
    const complete = scoreEnsemble([{ ...coat, coversLegs: true }], weather, skiing, 'alpine_skiing');
    const partial = scoreEnsemble([coat], weather, skiing, 'alpine_skiing');
    const open = scoreEnsemble([{ ...coat, waterproofRating: 'none', windproofRating: 'none' }], weather, skiing, 'alpine_skiing');

    expect(partial.ireq.min).toBeGreaterThan(complete.ireq.min);
    expect(partial.ireq.min).toBeLessThan(open.ireq.min);
    expect(partial.componentScores.coldProtection).toBeLessThan(complete.componentScores.coldProtection);
    // No extra insulation was added by changing shell coverage.
    expect(partial.ensembleProperties.rclClo).toBe(complete.ensembleProperties.rclClo);
  });

  it('keeps mixed torso, arm and leg protection distinct and ignores uncovered ratings', () => {
    const vest = { ...jacket('hard_shell'), coversArms: false };
    const pants = { ...jacket('soft_shell'), coversTorso: false, coversArms: false, coversLegs: true,
      waterproofRating: 'water_resistant' as const, windproofRating: 'wind_resistant' as const };
    const unused = { ...jacket('hard_shell'), coversTorso: false, coversArms: false };
    expect(outfitAirPermeability([vest, pants, unused])).toEqual({ torso: 1, arms: 1000, legs: 50 });
    expect(outfitAirPermeability([pants, unused, vest])).toEqual({ torso: 1, arms: 1000, legs: 50 });
  });

  it('asks more of an open outer layer than a windproof one in the same wind', () => {
    const open = { ...jacket('mid_layer_heavy'), windproofRating: 'none' as const, waterproofRating: 'none' as const };
    const shelled = scoreEnsemble([jacket('hard_shell')], weather, skiing, 'alpine_skiing');
    const unshelled = scoreEnsemble([open], weather, skiing, 'alpine_skiing');

    expect(unshelled.ireq.min).toBeGreaterThan(shelled.ireq.min);
  });
});
