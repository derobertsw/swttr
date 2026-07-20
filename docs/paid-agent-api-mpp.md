# Paid Agent API (MPP / HTTP 402)

**Date**: 2026-07-20
**Branch**: feat/trip-nudges-and-member-detail

## Summary

swttr exposes a **paid, machine-facing mirror** of its recommendation API, gated by the
[Machine Payments Protocol](https://mpp.dev) (MPP) — the Stripe + Tempo standard that
revives HTTP `402 Payment Required` for per-request, agent-to-server payments.

Machine callers (AI agents) pay per request on the Tempo network; the existing
Clerk-authenticated frontend keeps using the free `/api/v1/*` routes untouched.

| Concern | Location |
| --- | --- |
| Shared MPP handler | `src/lib/payments/mpp.ts` |
| Paid routes | `src/app/api/agent/recommendations/{running,alpine,biking,xc,ski-touring}/route.ts` |
| Clerk public-route allowlist | `src/proxy.ts` (`/api/agent(.*)`) |
| Config | `.env.local` (`MPP_*` vars) |
| SDK | [`mppx`](https://www.npmjs.com/package/mppx) + `viem` (peer dep) |

## How it works

Each paid route is a thin wrapper that reuses the free v1 handler — **zero logic
duplication**:

```ts
// src/app/api/agent/recommendations/running/route.ts
export const POST = mppx.charge({ amount: process.env.MPP_PRICE_RUNNING ?? '0.02' })(
  (request: Request) => runningHandler(request as NextRequest),
);
```

Request flow:

1. Agent `POST`s to `/api/agent/recommendations/<sport>` with no payment.
2. Server responds `402` with a `WWW-Authenticate: Payment ...` challenge
   (method `tempo`, intent `charge`, amount, currency, recipient, chainId).
3. Agent's wallet pays on Tempo and retries with a signed credential in `Authorization`.
4. Server verifies, runs the v1 recommendation logic, and returns the JSON with a
   `Payment-Receipt` header.

`/v1` stays free because MPP wraps only the `/agent` copy. Clerk would otherwise
`307`-redirect unauthenticated agents to sign-in, so `/api/agent(.*)` is listed as a
public route in `src/proxy.ts` — payment (402), not Clerk, is the gate.

> Next 16 renamed `middleware.ts` → `proxy.ts`; the Clerk middleware lives there.

## Configuration (`.env.local`)

```bash
# Self-generated — signs 402 challenges. NOT issued by Stripe.
MPP_SECRET_KEY=$(openssl rand -base64 32)
# true = Tempo testnet (moderato). Set false for mainnet settlement.
MPP_TESTNET=true
# Tempo wallet that receives funds. Required — settlement throws
# "Address undefined is invalid" if empty (the 402 challenge still succeeds).
MPP_RECIPIENT_ADDRESS=0x...
# Optional overrides:
# MPP_CURRENCY=0x20c0000000000000000000000000000000000000   # pathUSD (TIP-20)
# MPP_PRICE_RUNNING=0.02   # per-sport: MPP_PRICE_{RUNNING,ALPINE,BIKING,XC,SKI_TOURING}
```

`MPP_SECRET_KEY` is generated locally, not obtained from Stripe. A Stripe/Tempo account
is only needed for **mainnet** payout.

## Networks

| Network | chainId | RPC |
| --- | --- | --- |
| Testnet ("moderato") | `42431` | `https://rpc.moderato.tempo.xyz` |
| Mainnet | `4217` | Tempo public RPC |

The server picks the network via `MPP_TESTNET`; the caller must match with
`mppx --network testnet|mainnet`. A mismatch yields
`Error (CHAIN_MISMATCH): Challenge requires chainId 42431, but RPC is chainId 4217`.

## Testing the full loop (testnet)

```bash
# 1. Create + fund a testnet caller wallet (stored in OS keychain)
npx mppx account create
npx mppx account fund
npx mppx account view          # prints address + testnet balances

# 2. Run the dev server (kill stale :3000 first)
lsof -ti:3000 | xargs kill -9 2>/dev/null; npm run dev

# 3. Make a paid request — CLI handles 402 -> pay -> retry automatically
npx mppx --network testnet -X POST \
  http://localhost:3000/api/agent/recommendations/running \
  -H 'Content-Type: application/json' \
  -d '{"weather":{"temperature":45,"wind_speed":5}}'
```

Request body matches the v1 routes: `weather.temperature` (°F) and `weather.wind_speed`
(mph) are required (`src/lib/recommendations/validation.ts`). A successful call returns
the recommendation JSON and deducts the charge from the caller's testnet balance.

## Adding a paid route for a new sport

1. Ensure the free `POST` exists at `src/app/api/v1/recommendations/<sport>/route.ts`.
2. Create `src/app/api/agent/recommendations/<sport>/route.ts` copying an existing
   wrapper and swapping the imported handler + `MPP_PRICE_<SPORT>` env name.

No `src/proxy.ts` change is needed — `/api/agent(.*)` already covers new sub-paths.

## Dependencies

`mppx` requires `viem` (>= 2.54.0) as a **peer dependency** that npm does not install
automatically. A missing/old `viem` surfaces as `Module not found: Can't resolve
'viem/tempo'` at build time. Both are pinned in `package.json`.
