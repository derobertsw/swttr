# Mountain weather providers (#7)

**Decision (November 24, 2026): defer OpenSnow and keep Open-Meteo.** OpenSnow's price, access terms and forecast accuracy for SWTTR are all **unconfirmed**: nobody has contacted OpenSnow, and no trial or accuracy comparison has been run. Deferring is not a claim that OpenSnow is better or worse. Resort search and elevation-aware forecasts don't depend on this decision, and shipped on Open-Meteo.

The facts below come from the published pages linked in issue #7. They were **not rechecked for this document**, so check them again before relying on them.

## What we'd compare

| | Open-Meteo (current) | OpenSnow |
|---|---|---|
| Access | Public API, no key on the free tier ([pricing](https://open-meteo.com/en/pricing)) | [Commercial-partner API](https://opensnow.com/api/index.html) only. **Access unconfirmed.** |
| Cost | Free for non-commercial use; Standard $29/month for commercial use (see [third-party services](third-party-services.md#open-meteo)) | [Custom pricing](https://opensnow.com/api/start). **No quote.** |
| Mountain points | Any coordinates; `elevation=` downscales to the requested elevation ([docs](https://open-meteo.com/en/docs)) | A [point forecast endpoint](https://opensnow.com/api/routes/forecast_:point__GET.html); resort IDs would need mapping to ours |
| Horizon | Hourly, 16 days (`forecast_days=16`), which multi-day packing uses | The published point endpoint documents **up to 24 hourly periods and five daily periods**. Daily summaries can't replace the hourly data multi-day packing needs. Contracted endpoints **unconfirmed**. |
| Caching, attribution, commercial terms | CC BY 4.0 credit; terms define commercial use | **Unconfirmed.** Need written cache, attribution and redistribution terms. |
| Accuracy at resort points | **Unmeasured** | **Unmeasured** |

Neither service should be assumed free for commercial use.

## What a real evaluation needs

Only with authorized trial access:

1. Compare both providers at identical coordinates and elevations, from the same issue times, for **Stowe, Killington, Vail, Whistler and Chamonix**. Use the catalog's forecast points (`src/data/ski-resorts.json`).
2. Score against observations from suitably sited stations: archived forecast/observation pairs where available, otherwise a prospective sample that covers both storms and calm weather.
3. Report temperature and wind error, missing data, latency, and snowfall accuracy where there are comparable observations. Record the sample size and each station's elevation and exposure, which limit how far the results generalize.
4. Two providers disagreeing doesn't show which one is right.

## When to adopt

Retain Open-Meteo unless **all** of these hold: access is granted; cost and terms are acceptable (calls a month, caching, attribution, commercial use); the contracted endpoints cover the hourly horizon packing uses; and the measured benefit justifies it.

If it's adopted, that's a separate PR:

- A server-only OpenSnow adapter behind a feature flag, with explicit unit, time and condition-code normalization, the required attribution, bounded caching and timeouts, and a fallback to Open-Meteo for the same point and time.
- Map our resort IDs to OpenSnow's, and use base and summit temperature, wind and snowfall with clear provenance.
- Keep snowfall totals separate from precipitation probability and from clothing inputs.
- Validate any mixed-provider horizon before enabling it.
- `src/lib/weather/openMeteo.ts` is the one place that builds forecast requests, so a second provider plugs in there. Any provider that needs an app-side elevation correction needs an explicit source elevation and its own tested policy. Wind must never be scaled with a temperature lapse rate.

## Pending

- A quote and access decision from OpenSnow.
- The trial comparison above.
