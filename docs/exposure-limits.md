# Exposure limits for the selected outfit (#86)

Follow-up 1 of #86. Recommendations and manual edits now report a **duration-limited exposure (DLE)** for the outfit being evaluated. It follows ISO 11079 6.2. Before this, `heuristic_exposure_estimate_v1` was a bounded 0.5–8 h formula of IREQ, cold, wind and metabolic rate. It never saw the clothing, so changing the outfit could not change it.

Code: `src/lib/biophysics/exposure.ts` (`calculateExposureLimit`), and `calculateHeatStorageRate` and `resultantInsulationFromBasic` in `src/lib/biophysics/ireq.ts`. The API reports it as `evaluation.exposure` (and `descent_evaluation.exposure` for touring), with method `iso11079_dle_selected_ensemble_v1`.

## What is calculated

For one phase and one evaluated outfit:

1. **Clothing insulation.** `basic_clo` is the outfit's whole-body clo from `evaluatePhase`: the 0.5 / 0.25 / 0.25 mean of the worn torso, arm and leg clo, after the T21-03 layering regression. This is the value the comfort check compares with the target range.
2. **Resultant insulation.** `resultant_clo` is ISO 11079 Annex A's ICLR from that basic value. It uses the phase's relative air speed, walking speed and assumed outer-fabric air permeability. `resultantInsulationFromBasic` is the exact inverse of `requiredBasicInsulation`, which converts the targets the other way, and it keeps that function's floor (resultant ≤ basic).
3. **Heat-storage rate.** `S = (M − W − Cres − Eres) − (R + C)`, in W/m². The skin is held at the criterion's temperature, and dry heat passes through `resultant_clo`. These are the respiratory terms, convective and radiative coefficients and clothing area factor that `calculateIreq` uses. So an outfit exactly at IREQ is in balance (S ≈ 0; there is a unit test for this).
4. **Duration.** If S < 0, `dle_hours = Qlim / |S|`, with ISO 11079's allowed heat debt Qlim = 144 kJ/m² (40 Wh/m²). In hours that is 40 / |S|.
5. **Two criteria,** as in ISO 11079:
   - `minimal`: DLEmin, skin at the minimal-strain temperature (SWTTR: 30°C).
   - `neutral`: DLEneutral, skin at the neutral temperature (SWTTR: 33.7°C).

   DLEneutral is always the shorter of the two.

Statuses:

| `status` | Condition | `dle_hours` | UI |
|---|---|---|---|
| `limited` | S < 0, limit within 8 h | Qlim / \|S\| | "2.9 h" |
| `more_than_8_hours` | S < 0, limit beyond 8 h | Qlim / \|S\|, not capped | "More than 8 h", ISO 11079's convention for a working day |
| `no_heat_debt` | S ≥ 0 (rounded to 0.01 W/m²) | `null` | "Not limited by whole-body cooling" |

There is no other cap and no minimum. A heat balance or surplus never gets an arbitrary finite duration.

`outside_iso_range` lists any input outside ISO 11079's stated range: metabolic rate 58–400 W/m², air at 10°C or below, air speed 0.4–18 m/s. Outside that range the number is an extrapolation, and the UI says so.

## Where the conditions come from

`phaseTargets` returns `exposureConditions`: the air temperature, humidity, metabolic rate, relative air speed, walking speed and outer permeability that the phase's IREQ and basic-clo conversion used. Responses echo them as `ireq.exposure_conditions` (and `descent_breakdown.exposure_conditions` for touring). The recommendation view forwards them unchanged with manual edits, so `POST /api/v1/ensembles/evaluate` computes the edited outfit's limit on the server. The route validates the values against plausible bounds and whitelists them.

| Sport | Phase used | Notes |
|---|---|---|
| Running, XC, cycling | The single moving phase | XC uses its effective wind (exposure floor). |
| Alpine | The 60/40 ski-and-lift cycle | Time-weighted metabolic rate and air speed (ISO 8996), the same conditions as the targets. A continuous chairlift ride cools faster: with 4.3 clo at −15°C the cycle has no heat debt, while the lift ride alone gives DLEmin 3.5 h and DLEneutral 2.3 h (reference table below). |
| Ski touring | Climb and descent separately | The descent includes the packed layers that go on. |

## Review of the heat balance against ISO 11079

ISO 11079 itself was not available, so these checks used an independent reimplementation of its Annex F program. It follows the equations pythermalcomfort's `ireq.py` uses, which the [algorithm review](algorithm-review.md) (finding 7) found reproduces T18-02 Table 3. Those equations confirm three things:

- Qlim = 40 Wh/m² (144 kJ/m²) for both criteria, with DLE = 40 / |S| hours.
- ICLR is iterated from the basic ICL with Annex A's correction, its fcl following the resultant value.
- DLE above 8 h, or with S ≥ 0, is reported as "more than 8 h".

The harness was a throwaway test and is not committed.

All cases use basic clo, air permeability 1 l/(m²·s) (membrane), relative humidity 50–70 % and walking speed from ISO's 0.0052 × (M − 58) rule, capped at 0.7 m/s.

| Case | ICLR, SWTTR / ISO | S min, W/m² | DLEmin, h | S neutral, W/m² | DLEneutral, h |
|---|---|---|---|---|---|
| Resting 58 W/m², −10°C, 0.4 m/s, 3.0 clo | 3.00 / 3.04 | −24.2 / −30.3 | 1.65 / 1.32 | −31.0 / −36.0 | 1.29 / 1.11 |
| 116 W/m², −10°C, 0.5 m/s, 2.0 clo | 1.97 / 1.97 | −5.5 / −9.6 | 7.32 / 4.18 | −15.0 / −23.5 | 2.66 / 1.70 |
| 116 W/m², −20°C, 0.5 m/s, 2.5 clo | 2.45 / 2.45 | −12.1 / −14.8 | 3.31 / 2.70 | −20.1 / −26.6 | 1.99 / 1.51 |
| 116 W/m², −30°C, 2 m/s, 3.0 clo | 2.69 / 2.69 | −35.3 / −31.3 | 1.13 / 1.28 | −43.2 / −42.4 | 0.93 / 0.94 |
| Chairlift 70 W/m², −15°C, 2 m/s, 4.3 clo | 3.90 / 3.90 | −11.4 / −12.0 | 3.52 / 3.33 | −17.1 / −17.4 | 2.34 / 2.30 |
| Alpine cycle 115 W/m², −15°C, 5 m/s, 4.3 clo | 3.28 / 3.28 | +12.0 / +16.0 | none / none | +5.1 / +6.4 | none / none |
| Touring climb 233 W/m², −4°C, 1.6 m/s, 0.6 clo | 0.60 / 0.61 | −26.2 / +3.1 | 1.53 / none | −50.9 / −52.7 | 0.79 / 0.76 |
| Cycling 290 W/m², −4°C, 5.4 m/s, 0.5 clo | 0.50 / 0.53 | −59.1 / +4.3 | 0.68 / none | −92.6 / −81.8 | 0.43 / 0.49 |

**Hand check.** Take the golden alpine "cold, windy, snowing, hard" catalog outfit (5°F, 20 mph): basic 4.34 clo becomes resultant 3.02 clo. S is −20.2 W/m² at 30°C skin and −27.7 W/m² at 33.7°C, so DLEmin = 40 / 20.2 = 1.98 h and DLEneutral = 40 / 27.7 = 1.44 h. These match the snapshot.

### Gaps found

1. **No skin evaporation.** ISO includes diffusion through the skin at wettedness 0.06 (minimal) or 0.001 × M (neutral). SWTTR has no skin-evaporation term, in IREQ or here. So both lose heat more slowly than ISO, most of all at low output in light air: DLEneutral is 2.66 h against 1.70 h at 2 MET and −10°C.
2. **Fixed skin temperatures.** ISO lowers both with metabolic rate: minimal 33.34 − 0.0354 M and neutral 35.7 − 0.0285 M. SWTTR fixes 30°C and 33.7°C.
   - DLEmin is longer than ISO's at rest, where ISO's minimal skin is 31.3°C.
   - At 233–290 W/m², where ISO's minimal skin is 25.1–23.1°C, DLEmin is much shorter than ISO's or present where ISO has none. This is conservative.
   - Neutral agrees within 0.06 h on the chairlift and at 233–290 W/m².
3. **Convective coefficient.** SWTTR uses hc = max(3, 8.3 v^0.6, natural convection) and a bounded hr. ISO derives hc from the dynamic air insulation (hc = 1/Ia,r − hr). Even with ISO's skin evaporation removed and SWTTR's skin temperatures used, ISO's balance gives about 20–40 % faster cooling at 0.5 m/s (−7.8 against −5.5 W/m² minimal, at 2 MET and −10°C).
4. **ICLR floor.** In still air ISO's ICLR can come out slightly above the basic value (3.04 against 3.00 clo at rest). SWTTR keeps `requiredBasicInsulation`'s floor, so ICLR never exceeds basic. The effect is within 0.04 clo.

Because of gaps 1–3, the reported limits run **longer than ISO's at low output in light wind** (16–75 % here). They are close for the chairlift, the touring climb and cycling on the neutral criterion. Fixing this means aligning `calculateIreq` with Annex F: skin temperature by metabolic rate, skin evaporation, and hc from Ia,r. That would move IREQ, every target and the golden snapshot together, so it is left as a follow-up rather than changing only the exposure side.

## Assumptions and applicability limits

These are assumptions, not physiological validation.

- **Whole-body heat debt only.** DLE is the time to ISO 11079's allowed whole-body heat debt. It is not a time to a core-temperature threshold, and not a frostbite, finger, toe or face injury time. Hands, head and feet are not part of the balance. Feet aren't modeled at all (#405). The clothing-surface temperature is not a skin-temperature prediction.
- **Steady state per phase.** Each phase is evaluated on its own. Stops, changing weather, heat carried between phases and shivering are not modeled (#406). Alpine uses the cycle average.
- **SWTTR's clo scale.** The outfit's clo is the torso, arm and leg mean, which reads several times higher than a manikin's whole-body clo for the same outfit (algorithm review, "Whole-body clo"). The limit is consistent with the targets, which use the same scale. Against an ISO calculation from a manikin-measured ICL it is likely optimistic.
- **Assumed outer fabric.** The air permeability is the one the phase's targets assume (membrane for alpine and touring, the sport policy's outer for running, XC and cycling), not that of the worn garments.
- **Metabolic rates** are SWTTR's sport rates (algorithm review, "Assumptions without support"). Lower rates give shorter limits.
- **Dry clothing.** Wet clothing and rain don't change insulation.
- **S ≥ 0** only means whole-body cooling doesn't limit the exposure. It says nothing about overheating, sweat or extremity cooling.

## The target-range heuristic

The old formula still widens target ranges in `calculateActivityTargetRange`, renamed `heuristicExposureHours`. It is no longer reported as DLE. Its values and effect on targets are unchanged, so no recommendation, target or comfort score changed in the golden snapshot. Removing it, or replacing it with an outfit-independent ISO quantity, would be a separate target-calibration change.

## API change

- Removed: `ireq.dle_hours`, `ireq.dle_method` and the per-phase `dle_hours` (`skiing`, `chairlift`, `uphill`, `downhill`, `transition`). They held the clothing-blind heuristic.
- Added: `ireq.exposure_conditions` and `descent_breakdown.exposure_conditions` (server-issued, forwarded with edits), and `evaluation.exposure` and `descent_evaluation.exposure` (`ExposureLimit` in `src/types/biophysics.ts`).
- `POST /api/v1/ensembles/evaluate` accepts an optional `exposureConditions` per phase and then returns `exposure` for the outfit it evaluated.
