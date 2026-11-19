// Physical constants and metabolic rates
// Based on ISO 11079 and USARIEM Technical Reports

// Unit conversion
export const CLO_TO_M2KW = 0.155; // 1 clo = 0.155 m²K/W

// Metabolic rates (W/m²). The MET labels use 58.2 W/m² per MET. A Compendium
// MET (1 kcal/kg/h) is about 46.5 W/m² for the default body; running and XC
// convert that way in bodyMetrics.ts. See docs/algorithm-review.md.
export const METABOLIC_RATES = {
  resting: 58.2,              // 1 MET
  light_activity: 116.4,      // 2 MET
  moderate_activity: 174.6,   // 3 MET
  running_moderate: 348.6,    // 6 MET
  biking_moderate: 290.0,     // 5 MET
  xc_skiing_easy: 232.8,      // 4 MET
  xc_skiing_moderate: 290.0,  // 5 MET
  xc_skiing_racing: 406.2,    // 7 MET
  ski_touring_uphill: 232.8,  // 4 MET
  ski_touring_downhill: 145.5, // 2.5 MET
  alpine_skiing: 145.5,       // 2.5 MET
  chairlift: 69.8,            // 1.2 MET
} as const;

// Skin temperature targets (°C)
export const SKIN_TEMP_NEUTRAL = 33.7;
export const SKIN_TEMP_MINIMUM = 30.0; // Below this = discomfort/risk

// Weights for SWTTR's whole-body clo: a linear mean of torso, arm and leg clo.
// A convention, not T21-03's Eq. 1 (a parallel average over manikin zone areas).
// By area the three are about 0.40 / 0.20 / 0.39. See docs/algorithm-review.md.
export const REGIONAL_WEIGHTS = {
  torso: 0.50,
  arm: 0.25,
  leg: 0.25,
} as const;

// Regression coefficients from USARIEM T21-03
// y = coefficient * x (sum of individual garments)
export const ENSEMBLE_REGRESSION = {
  thermal: {
    torso: { coef: 0.836, rSquared: 0.924 },
    arm: { coef: 0.809, rSquared: 0.939 },
    leg: { coef: 0.961, rSquared: 0.854 },
    wholeBody: { coef: 0.990, rSquared: 0.655 },
  },
  evaporative: {
    torso: { coef: 0.999, rSquared: 0.572 },
    arm: { coef: 0.737, rSquared: 0.851 },
    leg: { coef: 0.950, rSquared: 0.864 },
    wholeBody: { coef: 1.12, rSquared: 0.510 },
  },
} as const;

// Air permeability of an outer fabric, in l/(m²·s), by protection rating:
// the input ISO 11079 Annex A's wind/motion correction needs. No catalog
// garment has a measured value; 1 l/(m²·s) is about 0.2 CFM at 125 Pa.
export const OUTER_AIR_PERMEABILITY = {
  membrane: 1,       // waterproof membrane or coating
  windproof: 5,      // dense wind shells, about 1 CFM
  windResistant: 50, // soft shells and wind-resistant puffies, about 10 CFM
  open: 1000,        // knits and fleece, 100–300 CFM
} as const;

// Regional IREQ multipliers by activity: each region's relative insulation
// need. calculateRegionalTargets rescales them to an area-weighted mean of 1,
// so only their ratios matter.
//
// Every sport and phase is unbiased (#375): torso, arms and legs each get the
// whole-body band. Running, cycling, XC and touring used to ask arms and legs
// for up to 1.27x and 1.4x the torso's clo, with no cited source. In all 43
// ensemble configurations USARIEM T21-03 measured (Tables 14-18), arms carry
// 0.56-0.87x and legs 0.19-0.91x the torso's clo; #317 removed alpine's leg
// bias for the same reason. Equal shares are an assumption, not a measured
// need: add a bias back only with regional evidence. See
// docs/algorithm-review.md, finding 5.
const UNBIASED_REGIONS = { torso: 1.0, arms: 1.0, legs: 1.0 } as const;

export const REGIONAL_IREQ_MULTIPLIERS = {
  running: UNBIASED_REGIONS,
  biking: UNBIASED_REGIONS,
  xc_skiing: UNBIASED_REGIONS,
  ski_touring_uphill: UNBIASED_REGIONS,
  ski_touring_downhill: UNBIASED_REGIONS,
  alpine_skiing: UNBIASED_REGIONS,
} as const;

// Extremity multipliers by activity: scale the whole-body IREQ of the phase
// the hands and head follow. Values above 1 stand for exposure that IREQ
// doesn't capture, such as alpine's chairlift rides between skiing runs.
export const EXTREMITY_IREQ_MULTIPLIERS = {
  running: {
    hands: 1.05,   // High exertion keeps hands warmer
    head: 0.90,    // Heat loss during exertion
  },
  biking: {
    hands: 1.20,   // Wind exposure, lower hand movement
    head: 1.00,    // Wind exposure
  },
  xc_skiing: {
    hands: 1.10,   // Pole work keeps hands warmer
    head: 0.90,    // More heat loss during exertion
  },
  ski_touring_uphill: {
    hands: 1.05,   // Pole work keeps hands warmer
    head: 0.95,    // High exertion = heat loss through head
  },
  ski_touring_downhill: {
    hands: 1.40,   // Wind exposure, less movement
    head: 1.10,    // Wind exposure
  },
  alpine_skiing: {
    hands: 1.45,   // Chairlift + wind exposure
    head: 1.15,    // Chairlift exposure
  },
} as const;

export const DEFAULT_EXTREMITY_MULTIPLIERS = {
  hands: 1.30,
  head: 1.00,
} as const;

// Hood thermal contribution (additional clo)
export const HOOD_CLO_VALUES = {
  none: 0,
  attached: 0.4,
  removable: 0.3,
  helmet_compatible: 0.5,
  insulated: 1.0,
} as const;

export type HoodType = keyof typeof HOOD_CLO_VALUES;

// Activity scoring weights
export const ACTIVITY_WEIGHTS = {
  running: {
    coldProtection: 0.10,
    overheatPrevention: 0.45,
    breathability: 0.30,
    weatherProtection: 0.10,
    weight: 0.05,
  },
  biking: {
    coldProtection: 0.20,
    overheatPrevention: 0.30,
    breathability: 0.25,
    weatherProtection: 0.15,
    weight: 0.10,
  },
  xc_skiing: {
    coldProtection: 0.15,
    overheatPrevention: 0.40,
    breathability: 0.30,
    weatherProtection: 0.10,
    weight: 0.05,
  },
  ski_touring_uphill: {
    coldProtection: 0.15,
    overheatPrevention: 0.35,
    breathability: 0.30,
    weatherProtection: 0.10,
    weight: 0.10,
  },
  ski_touring_downhill: {
    coldProtection: 0.30,
    overheatPrevention: 0.15,
    breathability: 0.15,
    weatherProtection: 0.30,
    weight: 0.10,
  },
  alpine_skiing: {
    coldProtection: 0.35,
    overheatPrevention: 0.10,
    breathability: 0.15,
    weatherProtection: 0.30,
    weight: 0.10,
  },
} as const;

export type ActivityType = keyof typeof ACTIVITY_WEIGHTS;
export type ExtremityIreqActivity = keyof typeof EXTREMITY_IREQ_MULTIPLIERS;

// Alpine skiing direct clo targets by temperature range
// Based on empirical data for downhill/resort skiing with chairlift exposure
export const ALPINE_CLO_TARGETS = {
  // Mild: -5°C to 0°C (23°F to 32°F)
  mild: {
    torso: { min: 2.0, neutral: 3.0 },
    legs: { min: 1.5, neutral: 2.0 },
    head: { min: 0.5, neutral: 1.0 },
    hands: { min: 1.0, neutral: 1.5 },
  },
  // Cold: -15°C to -5°C (5°F to 23°F)
  cold: {
    torso: { min: 3.5, neutral: 4.5 },
    legs: { min: 2.0, neutral: 3.0 },
    head: { min: 1.0, neutral: 1.5 },
    hands: { min: 1.5, neutral: 2.5 },
  },
  // Very Cold: below -15°C (below 5°F)
  veryCold: {
    torso: { min: 5.0, neutral: 6.0 },
    legs: { min: 3.0, neutral: 4.0 },
    head: { min: 1.5, neutral: 2.0 },
    hands: { min: 2.5, neutral: 3.5 },
  },
} as const;

/**
 * Get alpine skiing clo targets based on temperature
 */
export function getAlpineCloTargets(tempC: number) {
  if (tempC >= -5) {
    return ALPINE_CLO_TARGETS.mild;
  } else if (tempC >= -15) {
    return ALPINE_CLO_TARGETS.cold;
  } else {
    return ALPINE_CLO_TARGETS.veryCold;
  }
}
