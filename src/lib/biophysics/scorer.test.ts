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

  it('takes the outfit air permeability from its least permeable layer', () => {
    const fleece = { ...jacket('mid_layer_heavy'), windproofRating: 'none' as const, waterproofRating: 'none' as const };
    expect(outfitAirPermeability([fleece])).toBe(1000);
    expect(outfitAirPermeability([fleece, { ...fleece, windproofRating: 'wind_resistant' }])).toBe(50);
    expect(outfitAirPermeability([fleece, { ...fleece, windproofRating: 'windproof' }])).toBe(5);
    expect(outfitAirPermeability([fleece, jacket('hard_shell')])).toBe(1);
  });

  it('asks more of an open outer layer than a windproof one in the same wind', () => {
    const open = { ...jacket('mid_layer_heavy'), windproofRating: 'none' as const, waterproofRating: 'none' as const };
    const shelled = scoreEnsemble([jacket('hard_shell')], weather, skiing, 'alpine_skiing');
    const unshelled = scoreEnsemble([open], weather, skiing, 'alpine_skiing');

    expect(unshelled.ireq.min).toBeGreaterThan(shelled.ireq.min);
  });
});
