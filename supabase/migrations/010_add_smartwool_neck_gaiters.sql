-- Add Smartwool neck gaiters (skip if already exists)

INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static) VALUES
('Smartwool', 'Merino 150 Neck Gaiter', 'buff_thin', 30, false, true, false, true, 0.35, false, 5, 10),
('Smartwool', 'Merino 250 Neck Gaiter', 'buff_heavy', 50, false, true, false, true, 0.65, false, -10, 0)
ON CONFLICT (brand, model_name) DO NOTHING;
