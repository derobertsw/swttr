# Catalog problem reports — #277

People can report a problem with a catalog item from its details in Wardrobe: **Report a problem** opens a short form on top of the details. Reports go to `public.catalog_item_reports` (migration `20261124120000_catalog_item_reports.sql`), and the team triages them by hand with the queries below. There's no admin screen.

## What a report holds

| Column | What it is |
| --- | --- |
| `user_id` | The Clerk user who reported it. Account deletion removes their reports (`delete_user_data`). |
| `item_type`, `item_id` | The catalog row: `garment` → `garments`, `handwear` → `handwear`, `headwear` → `headwear`. Custom items can't be reported; people edit those themselves. |
| `item_snapshot` | `{brand, model_name}` when the report was last sent, so a report still makes sense after the catalog row is renamed or removed. |
| `reasons` | One or more of `wrong_photo`, `wrong_specs` (weight, material, fit), `wrong_warmth` (warmth or rating), `wrong_category` (category or type), `duplicate`, `discontinued`, `other`, in that order. |
| `note` | Optional, up to 1,000 characters. Required with `other`. |
| `product_url` | Optional http(s) link to the maker's or a store's page, up to 500 characters. Treat it as untrusted: open it only if it looks like a real product page. |
| `status` | `open` → `in_progress` → `resolved` or `dismissed`. `resolved_at` is set exactly when the status is `resolved` or `dismissed` (a check constraint enforces it). |
| `triage_note` | Free text for whoever triages: what was fixed, in which PR or migration, or why it was dismissed. |

## How reports arrive

`POST /api/wardrobe/reports` (signed in only) checks the input (`parseCatalogReport` in `src/lib/catalog-reports.ts`), then calls `submit_catalog_item_report`, which:

- answers 404 when no catalog row has that type and ID;
- keeps **one open report per person and item**: while their report is `open` or `in_progress`, reporting the item again adds the new reasons to it, and a new note or link replaces the old one (200, "Report updated"). Once it's `resolved` or `dismissed`, the next report starts a new row;
- allows **20 new reports per person per 24 hours**, counting every status (429 after that). Adding to an open report doesn't count.

Photos can't be attached. Product images live in `public/` and are added by PR ([catalog-photos-84.md](catalog-photos-84.md)), so a `wrong_photo` report is a prompt to find and commit a better one.

## Triage queries

Run these in the Supabase SQL editor. The first three only read.

Open reports, oldest first, with the item as the catalog has it now:

```sql
SELECT r.id, r.created_at::date AS reported, r.status, r.item_type,
  coalesce(g.brand, h.brand, w.brand, r.item_snapshot->>'brand') AS brand,
  coalesce(g.model_name, h.model_name, w.model_name, r.item_snapshot->>'model_name') AS model,
  (g.id IS NULL AND h.id IS NULL AND w.id IS NULL) AS item_gone,
  r.reasons, r.note, r.product_url
FROM catalog_item_reports r
LEFT JOIN garments g ON r.item_type = 'garment' AND g.id = r.item_id
LEFT JOIN handwear h ON r.item_type = 'handwear' AND h.id = r.item_id
LEFT JOIN headwear w ON r.item_type = 'headwear' AND w.id = r.item_id
WHERE r.status IN ('open', 'in_progress')
ORDER BY r.created_at;
```

Items with the most open reports, to fix first. Several people reporting the same reason is a strong signal:

```sql
SELECT r.item_type, r.item_id, max(r.item_snapshot->>'brand') AS brand, max(r.item_snapshot->>'model_name') AS model,
  count(DISTINCT r.id) AS reports, count(DISTINCT r.user_id) AS people,
  array_agg(DISTINCT reason ORDER BY reason) AS reasons, min(r.created_at)::date AS first_reported
FROM catalog_item_reports r, unnest(r.reasons) AS reason
WHERE r.status IN ('open', 'in_progress')
GROUP BY r.item_type, r.item_id
ORDER BY people DESC, first_reported;
```

How many open reports there are for each reason:

```sql
SELECT reason, count(*) FROM catalog_item_reports, unnest(reasons) AS reason
WHERE status IN ('open', 'in_progress') GROUP BY reason ORDER BY count(*) DESC;
```

Mark a report as being worked on, then resolved or dismissed. Replace the IDs and note; these change data, so check the `WHERE` before running:

```sql
UPDATE catalog_item_reports SET status = 'in_progress', updated_at = now()
WHERE id = '<report id>' AND status = 'open';

UPDATE catalog_item_reports
SET status = 'resolved', resolved_at = now(), updated_at = now(), triage_note = 'Fixed in PR #<n> / migration <file>'
WHERE id IN ('<report id>') AND status IN ('open', 'in_progress');

UPDATE catalog_item_reports
SET status = 'dismissed', resolved_at = now(), updated_at = now(), triage_note = '<why>'
WHERE id IN ('<report id>') AND status IN ('open', 'in_progress');
```

To close every open report on an item once it's fixed, use `WHERE item_type = '<type>' AND item_id = '<id>' AND status IN ('open', 'in_progress')` instead.

## Fixing what's reported

Catalog fixes still go through a migration in this repo, as #41 and #84 did: check for an existing item before adding one, and record the evidence for any thermal change ([catalog-thermal-calibration.md](catalog-thermal-calibration.md)). People aren't told when their report is resolved; that would need notifications this app doesn't have.
