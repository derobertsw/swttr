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
| 73 garments | 10.742 ms | 0.304 ms | 35.39x |
| 365 garments (5x) | 1077.18 ms | 30.772 ms | 35.01x |

These timings vary by machine and load. They are benchmark evidence, not CI time
limits. The previous 5x search has a noisy five-sample baseline; the cached search
averaged 17 samples with 0.40% relative margin of error in this run.

## Regional warning capacity

Alpine's warning check searches all compatible outfit combinations independently
of the builder's torso-first choices. A full-body layer therefore cannot hide a
warmer outfit made from separate tops and bottoms. The check retains each
region's selected base and outer coverage, plus its waterproof outer coverage
when wet.

The search groups alternatives by garment ID and tracks layer occupancy,
puffy/outer compatibility and waterproof coverage with six three-bit masks.
For each state it retains the maximum torso, arms and legs warmth independently;
those maxima can come from different wearable outfits. Future compatibility
depends only on the masks, and IDs are processed once, so equivalent states
can be merged without losing any regional maximum. This avoids enumerating
every outfit as a separate array. Capacity is calculated once per recommendation
and only when a regional shortfall exceeds the warning tolerance.

Run the capacity benchmark alone, without other checks:

```sh
npx vitest bench --run src/lib/recommendations/sports/alpine-ensemble.bench.ts --maxWorkers=1 -t 'complete capacity search'
```

An isolated Node.js 26.10.0/macOS run measured 0.786 ms for the 73-garment catalog
and 4.370 ms for the 365-garment pool (637 and 115 samples, respectively).
`regional-capacity.test.ts` compares the search against exhaustive subset
enumeration of a small wardrobe, including duplicate IDs, bibs, incompatible
puffy/outer combinations, rain protection and reversed input order.

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
