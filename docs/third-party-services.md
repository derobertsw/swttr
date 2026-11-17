# Third-party services and paid tiers (#308)

This page lists every outside service SWTTR uses, in the app and in how it's built and reviewed. For each one it covers what the free tier allows and what would push us to a paid plan or another provider. Provider pages were checked on **November 16, 2026**. Prices are in USD, before tax, unless noted. Pricing pages change, so check again before buying anything.

The standing decision is to stay on free tiers until launch and product-market fit, then pay where needed ([#208 decision, October 12, 2026](https://github.com/derobertsw/swttr/issues/208#issuecomment-6134840726)). Launch work is P3: Clerk production (#16), a custom domain (#17), the App Store (#149). The post-launch review of map providers is #283.

## At a glance

| Service | What for | Our plan | Free tier stops fitting when | Paid tier |
|---|---|---|---|---|
| [Vercel](#vercel) | Hosting, API routes, CDN | Not verified | Any commercial use, including real payments through the agent API; or more than 1M function calls, 4 CPU-hours or 100 GB of transfer a month | Pro, $20/month per developer seat |
| [Supabase](#supabase) | Postgres for everything users save | **Free** (verified) | Launch: the project pauses after a week without activity and has no backups. Also more than 500 MB of data or 5 GB of egress a month | Pro, $25/month |
| [Clerk](#clerk) | Sign-in and accounts | Development instance (last checked October 14) | More than 100 users (development instances' cap), or launch; production needs a domain we own | Free up to 50,000 retained users; Pro $25/month for MFA, passkeys, no Clerk branding |
| [Open-Meteo](#open-meteo) | Forecasts and weather place search | Free API, no key | Any commercial use (subscriptions, ads, paid features); more than 10,000 calls a day | Standard, $29/month for 1M calls |
| [Geoapify](#geoapify) | Trip place search, drive times, route lines | Free | More than 3,000 credits a day or 5 requests a second, over and over | API 10, $59/month |
| [OpenFreeMap](#openfreemap-maplibre-and-openstreetmap) | Map tiles | Public instance, no key | Outages (there's no SLA) or the service shutting down | No paid plan; self-host or switch |
| [MPP](#mpp-paid-agent-api) | Paid agent API | Testnet or mainnet: not verified | Taking real money makes the product commercial for Vercel and Open-Meteo | Protocol is free; network and Stripe fees not published on mpp.dev |
| [GitHub](#github) | Code, CI, CodeQL, Dependabot | Public repo, free | The repository goes private | Actions: $12/month of compute free; CodeQL needs Code Security, $30 per committer a month |
| [CodeRabbit](#coderabbit-greptile-and-codex) | Review that approves merges | Free for public repos | The repository goes private | Essentials, $24–30 per developer a month |
| [Greptile](#coderabbit-greptile-and-codex) | Second reviewer | Trial used up on October 9 | Only if we want it back | $1 per credit, or the open-source program |
| [Apple Developer Program](#apple-developer-program) | TestFlight, App Store, Mac App Store | Not verified | Before the TestFlight beta (#144) | $99 a year |

## What triggers a change

**Before taking real money through the paid agent API** (switching `MPP_TESTNET` off):
- Vercel Pro. Hobby is for personal or non-commercial use only.
- Open-Meteo Standard. Its terms list apps with paid features as commercial. The paid routes don't call Open-Meteo themselves (callers send the weather), but a conservative reading still counts the product as commercial.
- A Tempo wallet for `MPP_RECIPIENT_ADDRESS`, and a Stripe account if the money needs to reach a bank.

**Before launch** (open sign-ups, a custom domain, the App Store):
- Clerk production instance, after #17 gives us a domain.
- Supabase Pro, so the database never pauses and gets daily backups.
- Vercel Pro, if launch includes anything commercial. Its runtime logs also go from 1 hour to 1 day.
- Open-Meteo Standard, if the app has subscriptions, ads or other paid features.
- Check that Open-Meteo's CC BY 4.0 credit is met (see [Open-Meteo](#open-meteo)).

**On usage**, whichever comes first:
- Open-Meteo: 10,000 calls a day, 5,000 an hour, 600 a minute. Limits apply per IP, and Open-Meteo warns that shared hosts like Vercel can hit them sooner.
- Geoapify: 3,000 credits a day.
- Vercel Hobby: 1M function calls, 4 active CPU-hours or 100 GB of transfer a month.
- Supabase: 500 MB of data or 5 GB of egress a month.
- Clerk: 100 users on the development instance; 50,000 retained users a month on a free production instance.

**If the repository goes private**: GitHub Actions minutes start counting, CodeQL needs a paid add-on, and CodeRabbit's free reviews stop. CodeRabbit is the approval the `main` ruleset normally gets, so merging would block on review.

## Vercel

- **What for:** hosting `swttr.vercel.app`, every API route, the CDN for `public/` (catalog images stay there, per #83), and preview deployments. The required Vercel check is the only production build in CI.
- **In code:** no SDK. `VERCEL_ENV` gates `/design` to previews (`src/app/design/page.tsx`). Trip forecasts use Next's Data Cache for five minutes (`src/lib/trip-forecast.ts`).
- **Our plan:** not verified. The Vercel connector had no team access on November 16, and [`docs/privacy.md`](privacy.md) also leaves it open.
- **Hobby, free** ([Hobby plan](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines), checked November 16):
  - Each month: 1M function invocations, 4 hours of active CPU, 360 GB-hours of memory, 100 GB of fast data transfer, 10 GB of origin transfer, 1M CDN requests.
  - One developer seat, 100 deployments a day, 1 hour of runtime logs, no log drains.
  - Over a limit, a feature usually stops until 30 days have passed. There's no paying for extra usage on Hobby.
  - [Terms, section 4](https://vercel.com/legal/terms) (updated October 19, 2026): Hobby may be used only for personal or non-commercial use.
- **Forces Pro:** commercial use (real agent-API payments, ads, subscriptions, a business behind the app), hitting a monthly cap (which would take the app down until the month resets), or needing longer logs or drains to debug production.
- **Pro:** $20 a month per developer seat, with a $20 monthly usage credit, 1 TB of transfer, 10M CDN requests, 1 day of runtime logs, drains and spend management. Usage beyond the credit is billed as it goes.
- **Alternatives considered:** a standalone backend was rejected (#33 closed). API routes stay in Next.js, and the iOS shell and the paid API depend on the same deploy. No other host was evaluated.

## Supabase

- **What for:** the Postgres database for the catalog, wardrobes, preferences, trips and crews. Supabase Auth and Storage aren't used.
- **In code:** `src/lib/supabase.ts` (server-only service-role client) and `supabase/migrations/`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Local development points at the production project.
- **Our plan:** **Free**, verified on November 16 with the Supabase connector (organization "Swttr", plan `free`).
- **Free** ([pricing](https://supabase.com/pricing), checked November 16):
  - 500 MB of database, 5 GB of egress, 1 GB of file storage.
  - Two active projects, one day of API and database logs, no automatic backups.
  - Projects pause after one week without activity.
- **Forces Pro:**
  - Launch. A paused project stops resolving, and since #118 the recommendation routes then fail with 500s. It paused and was restored on September 24, 2026, which took about three minutes. Losing data with no backup is the other risk.
  - Database size nearing 500 MB, or egress nearing 5 GB a month.
- **Pro:** from $25 a month, including $10 of compute credit (one Micro instance). Paid projects don't pause.
- **Alternatives considered:** Supabase Storage for images was rejected because free projects pause (#83). Moving off Supabase hasn't been discussed.

## Clerk

- **What for:** sign-in, sessions and account UI. The Clerk user ID keys every user row in Supabase.
- **In code:** `src/proxy.ts` (middleware), `ClerkProvider` in `src/app/layout.tsx`, `requireUser()` in `src/lib/api.ts`. Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
- **Our plan:** production runs on Clerk's **development** instance. The live site served a `pk_test_` key when last checked on October 14, and its sign-in card shows the Development mode badge.
- **Development instance limits** ([environments](https://clerk.com/docs/guides/development/managing-environments), checked November 16): capped at **100 users**, and user data can't be moved to another instance. It isn't meant for production; it uses shared OAuth credentials for some social sign-ins and an `accounts.dev` domain.
- **Free (Hobby) plan** ([pricing](https://clerk.com/pricing), checked November 16):
  - 50,000 monthly retained users per app, custom domain, up to 3 dashboard seats, 1 day of logs.
  - Not included: removing Clerk branding, MFA, passkeys, SMS codes, custom session length (fixed at 7 days), more than 3 social connections.
- **Forces a change:**
  - Getting near 100 users, or launch. We'd need a production instance, which needs a domain we own ([production guide](https://clerk.com/docs/guides/development/deployment/production)). So #16 waits on #17. Users from the development instance don't carry over.
  - Pro is needed for MFA, passkeys, no branding, longer sessions, or more than 50,000 retained users.
- **Pro:** $25 a month ($20 billed annually), with 50,000 retained users included, then $0.02 a month per user from 50,001 to 100,000.
- **Alternatives considered:** none recorded.

## Open-Meteo

- **What for:** hourly and current forecasts, and the weather place search on the home page.
- **In code:**
  - Forecasts: `src/app/api/weather/route.ts`, `src/app/api/plan-ahead/route.ts`, `src/lib/trip-forecast.ts`, `src/lib/trip-tour-plans.ts`.
  - Search: `src/app/api/geocode/route.ts`.
  - All server-side, with no key. The API names Open-Meteo in its weather provenance, which `src/components/WeatherSourceDetails.tsx` shows.
- **Free** ([pricing](https://open-meteo.com/en/pricing), [terms](https://open-meteo.com/en/terms), checked November 16):
  - **Non-commercial only.** The terms give these examples:
    - Non-commercial: private or non-profit apps with no subscriptions or ads, and voluntary donations.
    - Commercial: apps with subscriptions or ads, and commercial products.
  - Fewer than 10,000 calls a day, 5,000 an hour, 600 a minute (300,000 a month). Limits apply per IP and per app, and the terms name Vercel as a shared host that may hit them sooner.
  - A request for more than 10 variables, or more than two weeks at one place, counts as more than one call. Our 16-day `forecast_days=16` requests count as a little over one call each.
  - No uptime guarantee. Data is CC BY 4.0, which requires credit. The app names Open-Meteo in weather source details without a link; check that this meets the licence before launch.
- **Forces Standard:**
  - Commercial use: a subscription, ads, or the paid agent API taking real money.
  - Sustained traffic near 10,000 calls a day, or rate-limit errors from Vercel's shared IPs.
- **Paid:** Standard, 1M calls a month, $29 a month. Professional, 5M calls a month, $99 a month. Both include geocoding. The amounts come from Open-Meteo's [June 12, 2023 announcement](https://openmeteo.substack.com/p/api-subscriptions-for-commercial); the pricing page we fetched listed call volumes but no prices.
  - **Buying a plan alone changes nothing.** Paid plans are served from the customer endpoint `customer-api.open-meteo.com`, with the plan's API key on each request. All four forecast files above call the free `api.open-meteo.com` with no key, and `src/app/api/geocode/route.ts` calls the free `geocoding-api.open-meteo.com`. Each needs its host changed and a server-side key added (an env var, never sent to the browser) before the plan's terms and limits apply. Check Open-Meteo's docs for the customer host for geocoding.
- **Alternatives considered:** weather search was deliberately kept on Open-Meteo when trip search moved to Geoapify (#208). No other forecast provider has been evaluated.

## Geoapify

- **What for:** trip place search (stays, access points), drive-time estimates (Route Matrix) and route lines on trip maps (Routing).
- **In code:** `src/lib/locations/provider.ts` (autocomplete), `routing.ts` (Route Matrix), `geometry.ts` (Routing), `closures.ts` (winter-closure avoid points). Env: `GEOAPIFY_API_KEY`, server-only. Without it, search says it's unavailable. Usage logs record counts only (`location_search`, `drive_matrix`).
- **Free** ([pricing](https://www.geoapify.com/pricing/), checked November 16):
  - 3,000 credits a day, up to 5 requests a second across the account.
  - Commercial production use is allowed, with a visible "Powered by Geoapify" link and OpenStreetMap credit, which the app shows.
  - Limits are soft. Geoapify generally doesn't throttle, but asks accounts that keep going over to upgrade, and may block ones that ignore it.
  - Credit details and storage permissions: [`docs/trip-locations.md`](trip-locations.md), [`docs/trip-map-data.md`](trip-map-data.md) and [`docs/qa/208-trip-locations/README.md`](qa/208-trip-locations/README.md).
- **Forces a paid plan:** daily credits passing 3,000 regularly. Drive-estimate batches are the big spender (Route Matrix credits grow with origins × destinations). Also sustained bursts over 5 requests a second; batches go out in parallel with no account-wide limiter.
- **Paid:** API 10, $59 a month (10,000 credits a day, 12 requests a second). API 25, $109 a month (25,000 a day, 15 a second).
- **Alternatives considered** (#208, October 12): Google, Mapbox, Apple, Stadia, LocationIQ and openrouteservice. Google, Mapbox and Apple were ruled out because their terms don't allow storing saved coordinates. Re-review after launch is #283.

## OpenFreeMap, MapLibre and OpenStreetMap

- **What for:** trip map backgrounds. The browser loads the Positron style and tiles straight from OpenFreeMap and draws them with MapLibre GL JS.
- **In code:** style URL and credits in `src/lib/trip-map.ts`; renderer in `src/components/trips/TripMapCanvas.tsx`. No key.
- **OpenFreeMap** ([home](https://openfreemap.org/), [terms](https://openfreemap.org/tos/), checked November 16):
  - Free, with no limit on map views or requests, no registration and no keys. Commercial use is allowed.
  - Credit: "OpenFreeMap © OpenMapTiles" and "Data from OpenStreetMap". MapLibre adds it.
  - No SLA or support, and the service can be discontinued without notice. It's funded by donations.
  - Offline area downloads are capped at 3,000 tiles or 50 MB each; we don't offer them.
- **MapLibre GL JS** (BSD-3-Clause, v6.15) and **OpenStreetMap data** ([ODbL credit](https://www.openstreetmap.org/copyright)) cost nothing. The credit has to stay visible.
- **Forces a change:** OpenFreeMap going down for long or shutting down, needing an SLA after launch, or offline maps. The options are self-hosting OpenFreeMap's open-source stack or a paid tile provider. `docs/trip-maps.md` says a paid provider's browser key must be restricted to our origins.
- **Alternatives considered:** decided with Geoapify in #208. Display providers are part of #283.

## MPP (paid agent API)

- **What for:** `/api/agent/recommendations/*`, paid per request over HTTP 402 (see [`docs/paid-agent-api-mpp.md`](paid-agent-api-mpp.md)).
- **In code:** `src/lib/payments/mpp.ts`, `src/app/api/agent/recommendations/*/route.ts`, the `mppx` and `viem` packages (both MIT). Env: `MPP_SECRET_KEY` (self-generated), `MPP_TESTNET`, `MPP_RECIPIENT_ADDRESS`, `MPP_CURRENCY`, `MPP_PRICE_*`. Without the secret, the routes answer 503.
- **Costs** ([mpp.dev](https://mpp.dev), [FAQ](https://mpp.dev/faq.md), checked November 16): the protocol is free and open, with no licensing fees. The FAQ promises low, stable Tempo transaction fees but gives no amounts. Stripe's fees for card or fiat settlement aren't stated there. Testnet (chain 42431) costs nothing.
- **Forces a change:** going to mainnet (chain 4217) to take real money. That needs a real recipient wallet, and a Stripe or Tempo account to settle to a bank. It also makes SWTTR commercial for Vercel's Hobby terms and, read conservatively, Open-Meteo's.
- **Which network production uses:** not verified. Env values weren't read.

## Links and build-time services (no account or tier)

| Service | Use | Where | Terms note |
|---|---|---|---|
| Apple Maps and Google Maps directions | Directions links from a stay to the access point | `src/lib/trip-drive.ts` | Plain URLs. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) need no API key. |
| OpenStreetMap place links | "Open map" for a saved place | `src/lib/trip-location.ts` | Plain link |
| avalanche.org and conditions sources | Touring equipment guidance link; organizer-entered forecast, weather and access links | `src/components/trips/TouringEquipment.tsx`, `src/lib/trip-conditions.ts` | Links only. SWTTR doesn't read bulletins. Fetching forecast data later would need each center's terms checked first. |
| Google Forms | Support and feedback | `src/app/feedback/route.ts` | Free form; replies stay in the maintainer's Google account |
| Google Fonts (Geist) | Fonts | `next/font/google` in `src/app/layout.tsx` | Downloaded at build and served from our own domain |
| Catalog image URLs | Product photos | `item_image_url` on catalog rows ([`docs/catalog-images.md`](catalog-images.md)) | Paths in `public/` or hosted HTTPS URLs; no bulk scraping (#94) |

## GitHub

- **What for:** the repository (public), pull requests, the `main-protection` ruleset, Actions, CodeQL and Dependabot.
- **In code:** `.github/workflows/merge-requirements.yml` (Ubuntu, Node 22: test plan check, lint, typecheck, knip, tests) and `.github/workflows/macos-app.yml` (a `macos-15` runner, only when `apple/` or `macos/` change).
- **Free** ([Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [security plans](https://github.com/security/plans), checked November 16): standard runners are free for public repositories, and CodeQL is free for public repositories.
- **Forces a change:** making the repository private.
  - Actions then draws on $12 a month of included compute on GitHub Free, about 2,000 Linux minutes. macOS runners cost far more per minute.
  - CodeQL would need GitHub Code Security, $30 per active committer a month.

## CodeRabbit, Greptile and Codex

- **CodeRabbit** reviews every PR and, with `auto_approve` on in `.coderabbit.yaml`, gives the one approval the ruleset needs.
  - [Pricing](https://www.coderabbit.ai/pricing), checked November 16: free for public repositories, but it rate-limits ("Review limit reached") and PRs then wait.
  - Essentials (formerly Pro) is $30 per developer a month, or $24 billed annually.
  - Forces a change: making the repository private, or if the rate limits slow merges enough to pay for.
- **Greptile** used up its 50-credit trial on October 9 (PR #262) and no longer approves.
  - [Pricing](https://www.greptile.com/pricing), checked November 16: Starter is free with 50 credits a month for one developer. Pro is $1 per credit (a base review is 1 credit).
  - It's free for qualifying non-commercial projects with an OSI-approved license. SWTTR has no license file, so it wouldn't qualify as it stands.
- **Codex** (`chatgpt-codex-connector`) comments on PRs but doesn't approve. It runs on the maintainer's ChatGPT account; that plan wasn't checked.

## Apple Developer Program

- **What for:** TestFlight and the App Store for the iPhone app (#144 at P2, #149 at P3), and the Mac App Store (#135).
- **In code:** `ios/` (Capacitor, MIT), `apple/`, `macos/`.
- **Cost** ([what's included](https://developer.apple.com/programs/whats-included/), checked November 16): $99 per membership year. Fee waivers exist for eligible nonprofits, schools and government entities. The membership isn't per platform, so it covers the Mac app too.
- **Forces it:** the first TestFlight build. Whether the membership is already active wasn't checked.

## Keeping this page current

Update it when a feature adds an outside service or a new env var for one, or when we change plans. Recheck the provider pages and change the dates. Never put key values here; env var names are enough.
