// Physical constants and metabolic rates
// Based on ISO 11079 and USARIEM Technical Reports

// Unit conversion
export const CLO_TO_M2KW = 0.155; // 1 clo = 0.155 m²K/W

// Metabolic rates (W/m²)
export const METABOLIC_RATES = {
  resting: 58.2,              // 1 MET
  light_activity: 116.4,      // 2 MET
  moderate_activity: 174.6,   // 3 MET
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

// Regional weights for whole-body calculation (USARIEM Eq. 1)
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

// Regional IREQ multipliers by activity
// Adjusts whole-body IREQ to body-region-specific targets
export const REGIONAL_IREQ_MULTIPLIERS = {
  xc_skiing: {
    torso: 0.85,   // Core runs hot, needs less
    arms: 1.0,     // Poles = arm movement = moderate
    legs: 1.15,    // Legs work hard but get cold air exposure
  },
  ski_touring_uphill: {
    torso: 0.80,   // Very hot core while climbing
    arms: 0.95,    // Pole work
    legs: 1.10,    // Working hard but wind on descents
  },
  ski_touring_downhill: {
    torso: 1.0,    // Standard
    arms: 1.05,    // Less movement, wind exposure
    legs: 1.15,    // Wind hits legs hard at speed
  },
  alpine_skiing: {
    torso: 1.0,    // Standard
    arms: 1.0,     // Less arm work than XC
    legs: 1.20,    // Chairlift + wind = cold legs
  },
} as const;

// Default multipliers for unknown activities
export const DEFAULT_REGIONAL_MULTIPLIERS = {
  torso: 1.0,
  arms: 1.0,
  legs: 1.0,
} as const;

// Extremity base multipliers by activity
// Hands and head need proportionally more insulation than core
export const EXTREMITY_IREQ_MULTIPLIERS = {
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
export type MetabolicRateKey = keyof typeof METABOLIC_RATES;
export type RegionalIreqActivity = keyof typeof REGIONAL_IREQ_MULTIPLIERS;
export type ExtremityIreqActivity = keyof typeof EXTREMITY_IREQ_MULTIPLIERS;
