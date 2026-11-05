# Privacy and support (#140)

Policy: `/privacy`. Support: `/faq#contact`. Both are public, including in the native shells. The contact link uses `/feedback`, which redirects to the existing Google Form. Settings closes its drawer when following either link; the sidebar, FAQ, and Mac Help menu also link to the policy.

These three exact paths skip Clerk middleware before it can issue a development-browser handshake. Merely adding a path to `isPublicRoute` does not prevent that 307 redirect for a fresh `Accept: text/html` request. Their account UI hydrates on the client; the root Clerk provider does not use server-side dynamic authentication. Every other route retains the existing authentication behavior, including similarly prefixed paths. Regression tests cover both the bypass and that boundary.

## Data-flow audit — November 1, 2026

This audit describes this checkout, including its existing trip-map work. It does not assert that every local change has been deployed or that provider dashboard settings have been inspected.

| Data | Use and storage | Evidence |
| --- | --- | --- |
| Email, name, optional profile image, user ID, authentication/session data | Clerk manages accounts; the Clerk ID associates database rows with the user. | `src/app/layout.tsx`, `src/components/AccountMenu.tsx`, `src/hooks/useUserId.ts` |
| Temperature sensitivity, default activity, optional height and weight | Account preferences in Supabase, with local preference storage. Temperature units are device-local. | `src/app/api/preferences/route.ts`, `src/hooks/usePreferences.ts`, `src/components/TemperatureUnitProvider.tsx` |
| Wardrobe and custom items | Supabase stores owned items, exclusions and item mappings for recommendations and packing. | `supabase/migrations/001_schema.sql`, `005_user_item_mappings.sql`, `010_user_custom_items.sql` |
| Trips and crew | Supabase stores owner/member IDs, display names, dates, destinations, lodging/access locations, kits, packing, notes, routes, conditions and shared gear. Shared trip content is visible to its crew. | `supabase/migrations/012_trips.sql` and subsequent trip migrations; `src/lib/trips.ts` |
| Device position | Requested on demand with permission; no background location subscription. Precise coordinates may be returned. | `src/hooks/useDeviceLocation.ts`, the iOS location bridge |
| Weather coordinates | `/api/weather?lat=…&lon=…` forwards coordinates to Open-Meteo. The route does not write to Supabase. This is **not** a promise of no retention: URLs reach Vercel and Open-Meteo logs. | `src/app/api/weather/route.ts` |
| General place searches | `/api/geocode?q=…` forwards **search text**, not device coordinates, to Open-Meteo. No database write in the route. | `src/app/api/geocode/route.ts` |
| Outing location and saved outfits | Session storage holds the outing, coordinates and last outing per guest/account; saved trip kits and trip locations persist in Supabase. Signing out does not clear every local record. | `src/lib/gearUpDraft.ts`, `src/lib/trip-saved-kits.ts`, `src/app/api/v1/trips/kits/route.ts` |
| Trip place search and driving | Geoapify receives search text and proximity coordinates, or routing coordinates. Usage console logs contain counts/outcomes, not query text or coordinates; provider/platform request logs are separate. Driving estimates are cached in Supabase. | `src/lib/locations/provider.ts`, `routing.ts`, `geometry.ts`, `src/lib/trip-drive-estimates.ts` |
| Map background | The browser requests OpenFreeMap styles/tiles directly; this discloses IP and requested map areas. | `src/lib/trip-map.ts`, `src/components/trips/TripMapCanvas.tsx` |
| Support | Public Google Form with one free-text feedback field. The person can include contact information; do not assume automatic email collection. Verified signed out without submitting a message. | `src/app/feedback/route.ts` and linked form |
| Diagnostics | Hosting requests and error logs can include IP, URLs/search parameters, user agent and errors. No advertising or cross-app tracking SDK was found in the app. | API error handlers, `package.json`, Vercel sources below |

RLS/access review: `014_restrict_to_service_role.sql` removes the older permissive policies and revokes public-role database access. `src/lib/supabase.ts` is server-only; API handlers enforce Clerk user/trip access. No database or access-policy changes are part of #140.

### Provider retention evidence

- [Vercel runtime logs](https://vercel.com/docs/logs/runtime) explicitly include **Search Params** and **Request User Agent**. Documented runtime retention varies by plan (1 hour, 1 day, 3 days, or 30 days). [Log drains](https://vercel.com/docs/drains) can retain logs elsewhere. **The actual SWTTR plan, log drains, redaction, and backup settings have not been verified.** The policy therefore discloses potential coordinate/search retention without promising an unverified duration. [Vercel's privacy notice](https://vercel.com/legal/privacy-notice) also describes IP and diagnostic data.
- [Open-Meteo terms/privacy](https://open-meteo.com/en/terms) say free-API webserver logs may include coordinates and are deleted after 90 days. SWTTR's weather/geocoding requests are server-to-server and do not attach Clerk identity fields. That does not make location uncollected.
- [Apple App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/) includes third-party retention in collection, and defines precise location as latitude/longitude with three or more decimal places. Saved trip locations and possible request-log retention mean a blanket “location not collected” answer is unsupported.

## App Privacy cross-check (#148)

| Declared category | Policy coverage |
| --- | --- |
| Contact Info: email/name | Account and support |
| Health & Fitness: optional height/weight | Preferences and body measurements |
| User Content: wardrobe/trips | Wardrobe, trips and crew (including saved locations and notes) |
| Identifiers: user ID | Account; association with saved SWTTR data |
| Location | On-demand precise location, weather/place requests, session draft, saved trip data, map providers, hosting/provider logs |

Use app functionality for these features and confirm whether Apple's product-personalization purpose also applies to recommendations. Account-linked saved locations must be declared as linked. Review diagnostic data, search history, optional profile images and support content with the actual provider configuration before submitting App Privacy answers; optional disclosure has specific criteria. No tracking is implemented in SWTTR. This change does not submit App Store answers or alter native privacy manifests (#148).

## Release dependencies and owner review

- Review the rendered policy before deployment. Confirm the actual Vercel retention/drain configuration and that the service list matches the deployed feature set.
- **#139 is not implemented in this checkout:** there is no Clerk `user.deleted` webhook. The policy accurately distinguishes deleting a Clerk account from requesting removal of SWTTR records via support. Do not change that to promise automatic deletion until #139 is deployed, configured and verified end to end.
- Extend #139's original table list to cover later user-linked data. In particular, `trip_kit_saves` retains a user ID and request receipt after a trip is removed (`019_trip_kit_save_tombstones.sql`); later conditions/tour/lodging records also need review. Deleting owned trips removes their shared data for the whole crew. #140 does not perform cleanup or delete any accounts.
- After review and deployment, set Clerk's privacy policy URL to `https://swttr.vercel.app/privacy`. Use that as the App Store privacy URL and `https://swttr.vercel.app/faq#contact` as the Support URL. Dashboard changes and publication are not performed by this code change.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test -- --run`, and `npm run build`. Check the production build signed out, without following redirects:

```sh
curl -H 'Accept: text/html' -D - http://localhost:3000/privacy -o /tmp/swttr-privacy.html
curl -H 'Accept: text/html' -D - http://localhost:3000/faq -o /tmp/swttr-faq.html
curl -H 'Accept: text/html' -D - http://localhost:3000/feedback -o /dev/null
```

`/privacy` and `/faq` must return 200. `/feedback` should return 307 to the Google Form. In a browser, open `/faq#contact`, verify Contact is visible and its feedback link opens the form without signing in. Check Settings → Privacy Policy closes the drawer and the policy remains readable on a narrow viewport. Repeat the HTTP checks on the deployed domain after release.

### PR branch verification

Verified on an isolated branch based on `cc877b6` from `main`, using `npm ci` and the committed lockfile (Next.js 16.4.2).

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run`: **214 files, 3,314 tests passed**. The flag avoids Node 26's built-in `localStorage` interfering with jsdom.
- `npm run build`: passed with the default Turbopack builder, including compilation, type checking and page generation. The earlier workspace's build limitation did not recur with main's locked dependencies; no dependency changes are included in this PR.
- Mac Help-menu change: compiled successfully in the original workspace using `swift build --package-path macos`, with temporary scratch/cache paths and SwiftPM's subprocess sandbox disabled (the outer execution sandbox does not allow nested `sandbox-exec`).
- Anonymous `curl -H 'Accept: text/html'` against this branch's production preview on port 3001: `/privacy` **200**, `/faq` **200**, `/feedback` **307** directly to the Google Form. Neither content page redirected to Clerk.
- Browser verification in the original workspace: policy rendered signed out, Settings links closed the drawer, `/faq#contact` scrolled Contact fully into view, and its feedback link opened the public SWTTR Feedback form in a new tab. No feedback was submitted.
- Narrow-screen verification remains manual: the in-app browser's viewport override did not change its actual 1280×720 viewport. Desktop rendering was visually verified.

The policy has not been deployed or approved, and Clerk/App Store dashboards have not been changed.
