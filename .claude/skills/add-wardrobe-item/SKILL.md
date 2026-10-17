---
name: add-wardrobe-item
description: Add a garment, glove/mitten or hat/helmet to the SWTTR gear catalog from a product link, a brand plus model name, or just a brand. It researches the product's construction, estimates regional clo, evaporative resistance (Ret), breathability, wind/water protection and activity fit against the live catalog and lab references, then writes a seed migration, opens a PR and hands over SQL to paste into the editor. Use this whenever the user pastes a gear URL, names a jacket/pant/base layer/glove/beanie/helmet they want in the catalog or wardrobe picker, asks to "add", "seed" or "import" gear, says the catalog is missing something, wants an existing item's clo or protection values corrected, or gives a brand to pull items from, even if they don't say "skill" or "migration".
---

# Add a wardrobe item to the SWTTR catalog

The recommendation engine is only as good as the numbers in the catalog. A new item's regional clo, Ret and breathability decide which sports it qualifies for, which layer slot it fills and how warm the engine thinks an outfit is. Treat each value as a small engineering estimate that someone will later need to defend: state where it came from, how sure you are, and which catalog items it was calibrated against.

The user gives one of:
- **a product URL** → research that product;
- **a brand and model** ("Rab Xenair Alpine Light") → find the product page yourself;
- **just a brand** ("Rab") or **a collection/category page** (a brand's or retailer's "ski shop" URL) → propose a shortlist first (step 2) and wait for the user's pick.

Catalog items go under the maker's brand, even when a retailer's page lists them (a Rossignol pant on Free People's site is `Rossignol`).

## 1. Check the catalog before anything else

Duplicates are the most common mistake, and names drift ("Gamma Hoody" vs "Gamma MX Hoody", "Norrøna" vs "Norrona"). Run from the repo root (any worktree works):

```bash
node .claude/skills/add-wardrobe-item/scripts/catalog-lookup.mjs find <brand> <model words>
```

It reads the live catalog (garments, handwear, headwear) and prints exact and near matches with their stored values. If the item exists, stop and show the user the existing row. Offer to correct its values instead, which is an `UPDATE` migration and needs the same evidence standard. A different generation of the same product (e.g. "Ghost Whisperer/2" vs "Ghost Whisperer UL") is a separate row only when its construction differs materially; ask if unsure.

The script only issues GET requests. It finds `.env.local` by walking up from the current directory, so it works from the main checkout and from worktrees under `.claude/worktrees/`.

## 2. Brand or collection: propose a shortlist

Run `catalog-lookup.mjs brand <brand>` and `catalog-lookup.mjs gaps`. Then look at the brand's current winter/outdoor lineup (the collection page given, or the brand's own site one category page at a time) and propose 3–6 models that:
- are not already in the catalog;
- fill thin spots in `gaps` output (e.g. there is one short-sleeve top, one pair of shorts, one heavy beanie, no softshell bibs) or give a sport a better option;
- are popular, current pieces that users are likely to own, not limited editions.

For each candidate give one line: category, what it adds, and how much published construction data exists (a product with stated fill weight and fabric specs gets a far better estimate than one with marketing copy only). Wait for the user to choose. The catalog is hand-curated by policy, so never crawl a whole brand site or bulk-add items.

## 3. Research the product's construction

Read the product page. Try WebFetch first. Many brand sites (Arc'teryx, Patagonia, Rab, Free People) render specs with JavaScript or return 403 to fetches; then open the page in the built-in browser and use `get_page_text`. Specs often sit in collapsed accordions ("Details", "Care + Contents") that `get_page_text` skips. Read them from the DOM with `javascript_tool`, following each header button's `aria-controls` to its panel, which works without clicking anything. Then fill gaps with targeted searches: the brand's spec sheet or tech PDF, and measured reviews (OutdoorGearLab, Blister, Switchback Travel and similar) for weights and fill. Fetch only pages about this product.

Collect, with a source for each:
- **Identity:** exact brand spelling as the catalog uses it (check step 1 output), model name without colour/gender suffix, model year if stated, MSRP USD, weight (size M; note size and men's/women's).
- **Coverage:** garment type, sleeve/leg length, hood (none/attached/removable/helmet-compatible), bib height, cut (hip vs thigh length).
- **Insulation:** type and brand (PrimaLoft Gold, Coreloft, 800FP down…), fill **weight in g/m²** per zone (body vs sleeves vs hood) or total fill grams, fill power.
- **Fabrics:** face, lining and backer fabric with gsm or denier, knit structure (grid, waffle, brushed), merino percentage.
- **Membrane and weather:** membrane (Gore-Tex Pro/ePE, eVent, proprietary), layers (2L/2.5L/3L), waterproof rating (mm), fabric RET or MVTR, air permeability (CFM), seam taping, DWR.
- **Ventilation:** pit zips (length), side/thigh/back vents, two-way zip, mesh pockets.
- **Extremities:** handwear type, insulation and liner, leather/shell, removable liner, touchscreen; headwear type, coverage (ears/neck/face), helmet fit, windproof panels.
- **Brand temperature ratings** if published, and the brand's intended use (resort, touring, Nordic, running).

Keep stated facts separate from your inferences. Missing data is normal; it widens the uncertainty, it doesn't block the item. Fashion-led brands often publish only fabric content and features. That's still enough for a `derived_from_similar` estimate at confidence 0.4–0.5, as long as the card says so.

## 4. Estimate thermal and protection values

Read `references/thermal-estimation.md` now. It explains every column the engine reads, the scales the existing catalog uses, lab anchors, and the scaling method. In short:

1. Pull 2–4 calibration analogues: `catalog-lookup.mjs analogues <category> [garment_type]` (or a handwear/headwear type). Prefer lab-tested rows and analogues with known construction.
2. Scale regional clo and Ret from the closest analogue by the construction differences you found (fill weight, fabric gsm, sleeves, length). Cross-check with the material method and the temperature-rating sanity checks.
3. Derive whole-body values with the 0.5/0.25/0.25 weights; place `evap_potential` on the catalog's breathability scale; set protection, ventilation, activity scores and semantics.
4. Choose `estimation_method`, `confidence_score`, `uncertainty_clo` and a `data_source` string honestly.

If your estimate disagrees with a close analogue by more than your uncertainty, say so and explain which number you trust. Don't silently copy an analogue, and don't silently contradict one. Some legacy rows are inconsistent; flag them to the user as possible follow-ups rather than editing them in passing.

## 5. Review the values with the user

Before writing files, show one compact card per item (the values below are illustrative, for a made-up product):

```
Acme Alpine Active Hoody — insulation_synthetic / jacket (hood: helmet_compatible), 340 g, $250
Facts: 60 g/m² synthetic body, 40 g/m² sleeves (spec sheet); air-permeable ripstop shell
clo  torso 1.15 · arms 0.90 · legs 0 → whole 0.80   (±0.25)
Ret  torso 20 · arms 17 · legs 0 → whole 14.3        evap_potential 0.33 · im 0.53
Calibrated against: Arc'teryx Atom LT Hoody (1.15/1.00, peer), Patagonia Nano-Air Hoody (lab 2.34/2.04 at the same fill → lab-scaled ≈2.3)
Protection: wind_resistant, DWR_only · vents: none · factor 1.0
Scores xc/up/down/alpine 7/8/6/5 · usage either · coverage 1/1/0 · activities: all
Method derived_from_similar · confidence 0.70
Sports it now qualifies for: running ✓ (0.33, gate 0.30: 0.29 would drop it), biking ✓, XC ✓ (score 7), touring ✓ (up 8), alpine ✓ (5)
Open questions: stored the peer-consistent 1.15, not the lab-scaled 2.3 (see the light-insulation note).
```

The "sports it qualifies for" line matters: it is where a value choice turns into product behaviour (see the gates table in the reference). Let the user adjust numbers here; they know this gear.

## 6. Write the migration in a worktree

Other sessions share the main checkout, so work in your own worktree:

```bash
MAIN=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
git fetch origin
git worktree add "$MAIN/.claude/worktrees/seed-<slug>" -b seed/<slug> origin/main
```

Run later commands from that worktree (prefix each with `cd "$MAIN/.claude/worktrees/seed-<slug>" &&`, since the shell's directory resets). Both scripts work there without `npm ci`: Node finds PGlite in the main checkout's `node_modules` further up.

**Migration number.** Files are `0NN_name.sql`. Take the highest number on `origin/main` *and* in open PRs, plus one, because other PRs often hold the next numbers:

```bash
git ls-tree --name-only origin/main supabase/migrations/ | sort | tail -3
gh pr list --state open --json number,files --jq '.[] | .number as $n | .files[].path | select(startswith("supabase/migrations/")) | "\($n) \(.)"'
```

Write `supabase/migrations/0NN_seed_<slug>.sql` using `references/sql-templates.md`. It is idempotent: guarded by `ON CONFLICT`/`NOT EXISTS`, safe to re-run, and it never overwrites existing rows. Header comment: date, what is added and why, and that you ran a duplicate check against the live catalog (with the row counts `gaps` printed). Above each item, put 2–4 comment lines with the construction facts and source URLs, the way `011_seed_ogl_recommended_items.sql` does.

**Images (optional).** New items render with the generated silhouette until a photo exists. Never hotlink a retailer image (that's the open #84 problem). If the user wants a photo, ask before downloading one; save it as `public/images/items/<brand>-<model>.jpg` and add the key to `DIRECT_ITEM_IMAGE_BY_KEY` in `src/app/api/media/item-image/route.ts`. A brand without a logo in `BRAND_LOGO_BY_KEY` (`src/app/api/media/brand-logo/route.ts`) falls back to text, which is fine.

**Validate the SQL.** The validator replays the catalog schema (001, 007, 022) in in-memory Postgres (PGlite, already a dev dependency), runs your migration twice, and checks the conventions in the reference: weighted whole-body values, covered regions not NULL, coverage matching `covers_*`, `waterproof_mm` only on waterproof items, provenance filled in, and glove ratings against the Gao rule.

```bash
node .claude/skills/add-wardrobe-item/scripts/validate-migration.mjs supabase/migrations/0NN_seed_<slug>.sql
```

Fix every error. Resolve each warning or explain it in the item card; some are legitimate (e.g. a brand-rated glove that is warmer than the rule suggests).

The golden fixture `src/test/fixtures/gear-catalog.json` is a frozen snapshot used by golden tests; don't add new items to it unless the user asks for a golden refresh.

## 7. Open the PR and hand over the SQL

Commit only the migration (and image files if any). If you edited the media route for an image, run `npm ci`, symlink `.env.local` into the worktree and run `npm run build` before pushing; a migration-only PR doesn't need a build. Push and open a PR with:
- the item card(s) from step 5, including calibration analogues and open questions;
- the sports-eligibility effect;
- `## Test Plan` with `- [x]` items (CI's `check-test-plan` needs it): duplicate check against the live catalog, validator output (idempotent, no errors, warnings explained).

Migrations are applied by hand in the Supabase SQL editor; never apply them with MCP `apply_migration`/`execute_sql`. Write a paste-ready script to the scratchpad:

```sql
BEGIN;
-- contents of supabase/migrations/0NN_seed_<slug>.sql
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('0NN', 'seed_<slug>');
COMMIT;
```

Give the user the script and a verification query (see the end of `references/sql-templates.md`). They usually apply it after the PR merges. Once they say it's applied, re-run `catalog-lookup.mjs find` to confirm the rows landed with the intended values. The item then shows up in the wardrobe picker and the catalog-mode recommendation pool, subject to the sport gates.

## What to tell the user at the end

The item card(s), the PR link, where the paste script is, and anything you were unsure about: missing specs, analogues that disagreed, legacy catalog rows that look wrong.
