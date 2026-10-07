# #168 pending outing acceptance — October 6, 2026

This report completes #168 after PR #231, which added the sign-in and Wardrobe return, validated redirects and per-account drafts. This change adds the same return to multi-day packing lists and corrects the FAQ's account answer. It also records the first checks with a real account. See [the contract and acceptance mapping](../../outing-contract.md#168-acceptance-review--october-6-2026).

## Automated verification

- Full Vitest suite: **101 files, 1,281 tests pass** (`NODE_OPTIONS=--no-experimental-webstorage npx vitest run --maxWorkers=4`). Recommendation golden snapshots are unchanged.
- New page test: a guest's 3-day plan, then sign-in returning to `/?resume=packing`. The plan is asked for again, opens on Packing, `resume` leaves the address, and the next plan built from the form opens on the daily plan. It fails without the fix.
- New component tests:
  - the guest packing list's Sign in link returns to `/?resume=packing`;
  - a signed-in list with items not matched offers Add gear to `/wardrobe?from=outing`;
  - a fully matched list doesn't;
  - `initialTab="packing"` opens on the packing list;
  - Wardrobe's card offers "Get my packing list" to `/?resume=packing` for a multi-day outing.
- `resumeView` accepts only `outing` and `packing`. `safeReturnPath` keeps `/?resume=packing`.
- Lint, typecheck and knip pass.

## Real-account browser checks

Local dev (`next dev` on :3168), in the desktop app's browser pane. The repository owner signed in to their own Clerk development-instance account; Claude never entered credentials. Real Supabase data, Open-Meteo forecasts and recommendation APIs were used. Nothing was added to or removed from the account's wardrobe. Screenshots aren't committed because they show a real account's wardrobe and identity.

| Flow | Result |
|---|---|
| Guest: Alpine at Stowe, 3 days from Oct 8 → Packing → Sign in | Link is `/sign-in?redirect_url=%2F%3Fresume%3Dpacking` with "You'll come back to this plan." |
| Sign in with a real account | Clerk redirected to `/?resume=packing`. The guest's draft moved to the account, and the guest slot was removed. |
| The first plan request after returning | `/api/plan-ahead` answered 502 once (Open-Meteo). The page showed "Outing update failed", named the outing and kept every input, with Build my plan ready. A probe of Open-Meteo straight afterwards succeeded. |
| `/?resume=packing` again | The plan came back on Packing, matched to the account's wardrobe: "2 of 5 not matched to your wardrobe" with Add gear. The address was `/`, on a results history entry. |
| Packing → Add gear | `/wardrobe?from=outing` showed "Alpine Skiing at Stowe, 3 days from Thu, Oct 8" with "Get my packing list" → `/?resume=packing`. |
| Get my packing list | The plan came back on Packing with fresh requests. |
| Signed in: Running at Stowe, now | Personalized layers from the account's gear. |
| `/wardrobe?from=outing` → Get my layers | "Running at Stowe, now". Fresh `/api/weather` and `/api/v1/recommendations/running`, Personalized, address `/`, results entry. |
| Sign out (desktop header avatar) | Results gone. The form shows a fresh guest draft. The account's draft stays under its own key and isn't shown. |
| Guest: Running at Stowe → "Sign in for Running layers" → Sign in → real sign-in | Clerk redirected to `/?resume=outing`. Fresh weather and recommendation requests; Personalized Running at Stowe, address `/`, results entry. |

## Found during these checks

- **Sign-out doesn't work at phone widths (pre-existing, #253).** Under 768px, the account menu is Clerk's `UserButton` inside the ☰ sheet. The sheet is a modal Radix dialog, which sets `pointer-events: none` on `<body>`. Clerk's popover is portaled outside the sheet, so its Sign out button can't be clicked, and the sheet's overlay is the element under it. Sign-out above was done in the wider desktop layout. #253 moves the avatar out of the sheet.
- **Body metrics stay on the device after sign-out (#256).** The signed-out tab still had the account's height and weight in localStorage (values not read). #256 keeps preferences per account.

## Not verified here

- The iOS shell, and native return and deep links (#130/#146).
- Sign-up with email verification completed in a new tab, as an emailed link would open. sessionStorage doesn't reach a new tab, so that tab starts from an empty form. A verification code entered in the same tab keeps the outing, but which method the Clerk instance uses wasn't checked.
- Account switching between two real accounts. Only one account was available; jsdom page tests cover it.
- An expired session in a real browser. jsdom covers the 401 `auth_required` result and Clerk's sign-out path.
