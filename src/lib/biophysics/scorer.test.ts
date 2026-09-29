import { describe, expect, it } from 'vitest';
import { scoreEnsemble, type GarmentWithProtection } from './scorer';

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
