# Regional outfit search performance

The alpine and XC builders cache each garment's slot, region occupancy, regional
insulation, breathability and protection once per search. They reuse the chosen
prefix and base/base-plus-mid totals rather than rebuilding each candidate.
Pairwise compatibility checks preserve the identity, slot and puffy/outer rules.
Candidate garment arrays are allocated only when a new best outfit is found.

Enumeration order, insulation summation order, ranking priorities and the
`1e-6` comparison tolerance remain unchanged. Bibs still contribute torso warmth
without occupying the torso's outer slot. Search complexity remains cubic in the
pool size; this change reduces work and allocations per combination.

## Reproduce

```sh
npx vitest bench --run src/lib/recommendations/sports/alpine-ensemble.bench.ts --maxWorkers=1
npm test -- --run src/lib/recommendations/sports/regional-ensemble.test.ts
```

Run the benchmark separately from other checks. It measures the synchronous
outfit builder using the checked-in gear catalog, excluding database access,
thermal-target computation, HTTP and response serialization. The 5x pool uses
five copies of each garment with distinct IDs so all alternatives are searched.

Local warm measurements with Node.js 26.10.0 on macOS:

| Alpine pool | Previous search, mean | Cached search, mean | Speedup |
| --- | ---: | ---: | ---: |
| 73 garments | 10.526 ms | 0.294 ms | 35.76x |
| 365 garments (5x) | 2115.36 ms | 45.748 ms | 46.24x |

These timings vary by machine and load. They are benchmark evidence, not CI time
limits. The previous 5x search has a noisy five-sample baseline; the cached search
averaged 11 samples with 0.39% relative margin of error in this run.

## Behavioral validation

`src/test/referenceRegionalEnsemble.ts` freezes the search and sport ranking
before #154. It is used only by tests and benchmarks. The parity test compares
garment IDs and dressing order across 240 temperature/wind/effort/precipitation
conditions for both alpine and XC, with catalog, wardrobe and sparse wardrobe
pools: 1440 comparisons. It also checks equal-rank ordering, input preservation
and IDs repeated across slots. Existing sport tests cover bibs, multi-region
suits, puffy compatibility, precipitation and incomplete wardrobes. API golden
snapshots pass without updates.

Keep this reference fixed for performance-only changes. An intentional change
to outfit selection requires reviewing the expected behavior and updating the
reference alongside the sport tests and golden snapshots.
