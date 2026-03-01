import { describe, it, expect } from 'vitest';
import { predictEnsembleThermal, garmentToThermalProps, type ThermalGarment } from './ensemble';
import { ENSEMBLE_REGRESSION } from './constants';

describe('predictEnsembleThermal', () => {
  it('should include arm clo from long-sleeved garments', () => {
    const garments: ThermalGarment[] = [
      {
        rclTorso: 0.69,
        rclArms: 0.55,
        rclLegs: 0,
        reclTorso: 12.96,
        reclArms: 10.0,
        reclLegs: 0,
        coversTorso: true,
        coversArms: true,
        coversLegs: false,
      },
    ];

    const result = predictEnsembleThermal(garments);

    expect(result.rcl.arm).toBeCloseTo(0.55 * ENSEMBLE_REGRESSION.thermal.arm.coef, 4);
    expect(result.rcl.arm).toBeGreaterThan(0);
  });

  it('should not contribute arm clo when coversArms is false', () => {
    const garments: ThermalGarment[] = [
      {
        rclTorso: 0.69,
        rclArms: 0.55,
        rclLegs: 0,
        reclTorso: 12.96,
        reclArms: 10.0,
        reclLegs: 0,
        coversTorso: true,
        coversArms: false,
        coversLegs: false,
      },
    ];

    const result = predictEnsembleThermal(garments);

    expect(result.rcl.arm).toBe(0);
  });

  it('should sum arm clo from multiple arm-covering garments', () => {
    const garments: ThermalGarment[] = [
      {
        rclTorso: 0.69,
        rclArms: 0.55,
        rclLegs: 0,
        reclTorso: 12.96,
        reclArms: 10.0,
        reclLegs: 0,
        coversTorso: true,
        coversArms: true,
        coversLegs: false,
      },
      {
        rclTorso: 1.15,
        rclArms: 1.00,
        rclLegs: 0,
        reclTorso: 20.0,
        reclArms: 18.0,
        reclLegs: 0,
        coversTorso: true,
        coversArms: true,
        coversLegs: false,
      },
    ];

    const result = predictEnsembleThermal(garments);

    const expectedArm = (0.55 + 1.00) * ENSEMBLE_REGRESSION.thermal.arm.coef;
    expect(result.rcl.arm).toBeCloseTo(expectedArm, 4);
  });

  it('should produce zero arm clo when rclArms is 0 despite coversArms true (the bug)', () => {
    const garments: ThermalGarment[] = [
      {
        rclTorso: 0.69,
        rclArms: 0, // Bug: arm clo is 0 for a long-sleeved garment
        rclLegs: 0,
        reclTorso: 12.96,
        reclArms: 0,
        reclLegs: 0,
        coversTorso: true,
        coversArms: true,
        coversLegs: false,
      },
    ];

    const result = predictEnsembleThermal(garments);

    // This demonstrates the bug: arm clo is 0 even though the garment covers arms
    expect(result.rcl.arm).toBe(0);
    // Torso still has insulation
    expect(result.rcl.torso).toBeGreaterThan(0);
  });
});

describe('garmentToThermalProps', () => {
  it('should map rcl_arms from thermal properties', () => {
    const result = garmentToThermalProps(
      {
        id: 'test-id',
        brand: 'Patagonia',
        model_name: 'Capilene Midweight',
        category: 'base_layer',
        covers_torso: true,
        covers_arms: true,
        covers_legs: false,
      },
      {
        rcl_torso: 0.69,
        rcl_arms: 0.55,
        rcl_legs: 0,
        rcl_whole_body: 0.45,
        recl_torso: 12.96,
        recl_arms: 10.0,
        recl_legs: 0,
        recl_whole_body: 8.5,
      }
    );

    expect(result.rclArms).toBe(0.55);
    expect(result.coversArms).toBe(true);
  });

  it('should default rcl_arms to 0 when not provided', () => {
    const result = garmentToThermalProps(
      {
        id: 'test-id',
        brand: 'Test',
        model_name: 'Garment',
        category: 'base_layer',
        covers_torso: true,
        covers_arms: true,
        covers_legs: false,
      },
      {
        rcl_torso: 0.69,
        // rcl_arms not provided - this is the bug scenario
      }
    );

    expect(result.rclArms).toBe(0);
    expect(result.coversArms).toBe(true);
  });
});
