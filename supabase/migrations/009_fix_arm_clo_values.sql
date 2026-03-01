-- Fix arm insulation values for long-sleeved garments
-- Issue #38: Long-sleeved garments with rcl_arms = 0 cause false cold risk alerts

-- Step 1: Fix garments where garment_type implies arm coverage but covers_arms is false
UPDATE garments
SET covers_arms = true
WHERE garment_type IN ('top_long_sleeve', 'jacket', 'one_piece')
  AND covers_arms = false;

-- Step 2: Fix thermal properties where garment covers arms but rcl_arms is 0 or NULL
-- Use ~80% of rcl_torso as a reasonable estimate (matches existing seed data ratios)
UPDATE garment_thermal_properties
SET rcl_arms = ROUND(rcl_torso * 0.80, 2),
    recl_arms = ROUND(recl_torso * 0.80, 2),
    estimation_method = CASE
      WHEN estimation_method = 'lab_tested' THEN 'derived_from_similar'
      ELSE estimation_method
    END,
    confidence_score = LEAST(confidence_score, 0.60)
FROM garments
WHERE garment_thermal_properties.garment_id = garments.id
  AND garments.covers_arms = true
  AND (garment_thermal_properties.rcl_arms IS NULL OR garment_thermal_properties.rcl_arms = 0)
  AND garment_thermal_properties.rcl_torso > 0;
