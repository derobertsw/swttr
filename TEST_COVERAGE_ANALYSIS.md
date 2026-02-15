# Test Coverage Analysis

**Date:** 2026-02-15
**Test runner:** Vitest 3.0.5 with @testing-library/react
**Results:** 22 test files, 326 tests, all passing

---

## Current Coverage Summary

### What's Tested

| Area | Files Tested | Tests | Quality |
|------|-------------|-------|---------|
| Biophysics core | 4 of 7 | ~57 | Strong (ireq excellent, others fair) |
| Recommendation logic | 2 of 10 | ~38 | Partial (shared/extremities good) |
| API routes | 7 of 18 | ~115 | Mixed (ski-touring excellent, others sparse) |
| Components | 5 of 67 | ~111 | Good for tested files |
| Hooks | 0 of 11 | 0 | **None** |
| Utilities | 4 of 8 | ~45 | Good |

### Estimated Line Coverage by Module

Based on file analysis (actual instrumented coverage unavailable due to tooling version mismatch):

| Module | Source LOC | Estimated Coverage |
|--------|-----------|-------------------|
| `lib/biophysics/` | ~900 | ~50% (ireq/targets/exertion covered, comfort/ensemble/scorer not) |
| `lib/recommendations/` | ~550 | ~15% (shared.ts covered, 8 files untested) |
| `lib/` (root utils) | ~400 | ~60% (getTempRange, utils well-tested; layers barely) |
| `hooks/` | ~1,750 | **0%** |
| `app/api/` | ~2,200 | ~35% |
| `components/` | ~4,500+ | ~20% (only 5 of 67 files) |

---

## Priority Recommendations

### Tier 1 — Critical Gaps (High impact, high risk)

#### 1. Biophysics Engine: `comfort.ts`, `ensemble.ts`, `scorer.ts`

These three files form the core thermal calculation engine and have **zero tests**.

- **`comfort.ts`** (138 LOC, 4 functions) — Calculates thermal comfort scores (0-100 scale) and comfort decisions. Has complex branching for cold/overheat conditions and regional deficit penalties. Incorrect scores directly mislead users about what to wear.

- **`ensemble.ts`** (186 LOC, 7 functions) — Implements USARIEM regression equations to predict ensemble thermal properties. Calculates weighted averages, evaporative potential, and permeability indices. Scientific accuracy is essential.

- **`scorer.ts`** (265 LOC, 4 functions) — Scores ensembles across 5 dimensions (cold protection, overheat prevention, breathability, weather protection, weight). 245 lines of weighted scoring logic with activity-specific targets.

**Recommended tests:**
- Unit tests with known input/output pairs for each mathematical function
- Boundary tests at comfort zone transitions
- Golden-value regression tests for USARIEM equations
- Edge cases: zero CLO, extreme temperatures, empty garment lists

#### 2. `useGearUp.ts` — App Orchestration Hook

At 619 LOC with a `useReducer` handling 11 action types, this is the single most complex untested file in the codebase. It orchestrates weather fetching, location search, multi-day planning, and biophysics integration.

**Recommended tests:**
- Reducer unit tests for each action type (extract reducer for isolated testing)
- State transition tests for the manual → plan-ahead mode switch
- Form submission flow tests with mocked fetch
- Event listener cleanup verification

#### 3. `layers.test.ts` — Currently Has Only 1 Test

The `layers.ts` utility maps garment categories to display layers. The existing test file covers exactly one case (`outer_insulated` → mid layer for torso). This needs expansion across all categories and body regions.

**Recommended tests:**
- All garment category → layer mappings
- All body regions (torso, legs, hands, headNeck)
- Multiple garments per layer
- Unknown/invalid categories

---

### Tier 2 — High Value (Significant logic untested)

#### 4. Recommendation Pipeline: `validation.ts`, `response-builder.ts`, `database.ts`

The recommendation system has good tests for the algorithm endpoints (especially ski-touring at 55 tests) but the shared infrastructure is untested:

- **`validation.ts`** (56 LOC) — Unit conversions (F→C, mph→m/s) and auth verification. A bug here breaks every recommendation route.
- **`response-builder.ts`** (117 LOC) — Orchestrates scoring, formatting, and comfort calculation. Integration point for the three untested biophysics files above.
- **`database.ts`** (122 LOC) — Supabase queries with RLS policy dependencies. Per CLAUDE.md, RLS issues are a common source of bugs.

**Recommended tests:**
- Unit conversion accuracy (especially 0°F, negative temps, 32°F boundary)
- Response builder integration with mocked scoring/formatting
- Database function tests with Supabase mocks verifying query structure

#### 5. Biking & Running Recommendation Routes

These two API routes (211 and 214 LOC respectively) are structurally similar to the tested ski-touring route but have zero tests. They have activity-specific ensemble building logic and guidance generation.

**Recommended tests:**
- Mirror the ski-touring test structure (request validation, response shape, IREQ calculations)
- Parameterized tests that exercise both routes with the same weather conditions to validate activity-specific differences

#### 6. `useWardrobe.ts` — Search and Filter Logic

387 LOC with a 5-level search ranking algorithm and multiple interacting filters (brand, body part, layer type, sort order). The ranking logic determines what users see when searching their wardrobe.

**Recommended tests:**
- Search ranking accuracy (exact match > starts-with > includes > brand match)
- Filter combinations (multiple filters applied simultaneously)
- Add/remove/restore operations with mocked API
- Empty state handling

#### 7. Wardrobe API Routes: `gear/route.ts`

The most complex wardrobe endpoint at 296 LOC with 4 HTTP methods. Handles 3 different item types (garments, handwear, headwear) with existence checks and detail fetching.

**Recommended tests:**
- CRUD operations for each item type
- Duplicate detection (PostgreSQL error code 23505)
- Detail fetching across 3 tables
- Authorization checks

---

### Tier 3 — Medium Value (Lower risk, but worth covering)

#### 8. `usePreferences.ts` — Server/localStorage Sync

202 LOC handling hydration for SSR and bidirectional sync between localStorage and the server. Bugs here cause preferences to silently reset.

**Recommended tests:**
- Hydration order (localStorage read before server fetch)
- Sync failure handling (server unreachable)
- Input validation (VALID_SENSITIVITIES whitelist)

#### 9. Wardrobe/Available Route — Currently 2 Tests

`wardrobe/available/route.test.ts` has only 2 test cases for an endpoint that fetches across garments, handwear, and headwear tables with thermal property normalization.

**Recommended tests:**
- Empty database response
- Handwear and headwear retrieval
- Thermal property null handling
- Error responses

#### 10. Alpine and XC Recommendation Routes — Minimal Tests

- **Alpine** has 3 tests (only algorithm-level, no API tests)
- **XC** has 7 tests (tests `buildXCEnsemble` function, not the route handler)

**Recommended tests:**
- Full API endpoint tests matching the ski-touring pattern
- Request validation and error handling
- Response structure verification

---

### Tier 4 — Lower Priority

These are worth testing but have lower risk profiles:

- **Recommendation utilities** (`categorization.ts`, `formatting.ts`, `sorting.ts`) — Simple utility functions, quick to test
- **`useLocalStorage.ts`** — 40 LOC generic hook
- **`useBiophysicsRecommendation.ts`** — Fetch wrapper with loading states
- **Remaining components** (BiophysicsDetails, PlanAheadForm, LocationAutocomplete, etc.) — UI components where bugs are visible and caught quickly
- **shadcn/ui wrappers** — Third-party components that don't need testing

---

## Existing Test Quality Issues

### Tests That Need Improvement

1. **`wardrobe/available/route.test.ts`** — 2 tests for a multi-table endpoint. Should have 8-10 minimum.

2. **`alpine/route.test.ts`** — 3 tests with no request validation, error handling, or response structure checks. Compare to ski-touring's 55 tests.

3. **`layers.test.ts`** — 1 test case. This is effectively untested.

4. **`bodyMetrics.test.ts`** — 4 tests for mathematical functions. Needs boundary value testing.

### Tests With Good Patterns to Follow

- **`ski-touring/route.test.ts`** (55 tests) — Excellent pattern for API route testing: validates request handling, response structure, calculation accuracy, and error cases.
- **`ireq.test.ts`** (~40 tests) — Good use of golden-value benchmarks and invariant testing.
- **`getTempRange.test.ts`** (32 tests) — Thorough boundary testing for every temperature bracket.
- **`LayerDisplay.test.tsx`** (50+ tests) — Strong component integration testing covering conditional rendering, user interactions, and data scenarios.

---

## Suggested Implementation Order

For maximum risk reduction with minimum effort:

1. **Add tests for `comfort.ts`, `ensemble.ts`, `scorer.ts`** — These are pure functions with no dependencies to mock. Straightforward to test, high impact.
2. **Expand `layers.test.ts`** — Quick win, currently at 1 test.
3. **Add `validation.ts` tests** — Unit conversion bugs affect every recommendation route.
4. **Extract and test the `useGearUp` reducer** — Pull the reducer function out so it can be tested without React rendering.
5. **Add biking and running route tests** — Copy the ski-touring test structure and adapt.
6. **Expand `wardrobe/available` and `alpine` tests** — Bring sparse test files up to adequate coverage.
7. **Add `useWardrobe` search ranking tests** — Extract ranking logic into a pure function for isolated testing.
