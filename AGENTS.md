# Agent instructions

Project instructions for coding agents (Codex, Claude Code and others) working on SWTTR. Setup for people is in `README.md`; feature docs are in `docs/`.

## Instruction files

- This file is the one shared source. Codex reads it, and Claude Code v2.1.277 or later reads it when there is no `CLAUDE.md` or `CLAUDE.local.md` in the working directory or above it.
- `CLAUDE.md` is gitignored, for personal notes. If you keep one, start it with `@AGENTS.md`; otherwise Claude Code reads the `CLAUDE.md` instead of this file.
- `next dev` maintains the block between the `nextjs-agent-rules` markers at the end of this file. Don't edit it by hand. If a Next.js upgrade makes `next dev` rewrite it, commit the change.

## Stack

- Next.js 16 App Router with Turbopack, React 19, TypeScript. `src/proxy.ts` is the Clerk middleware (Next 16's name for `middleware.ts`).
- Clerk for auth.
- Supabase Postgres, reached only from API routes through the server-only service-role client in `src/lib/supabase.ts`. The browser never talks to Supabase, and migration `014_restrict_to_service_role.sql` leaves the `anon` and `authenticated` roles with no table access. Access control lives in code (`requireUser()` in `src/lib/api.ts`, `requireTripAccess()` in `src/lib/trips.ts`), not in RLS policies. When an API route misbehaves, check those guards and the query first.
- shadcn/ui on Radix and Tailwind v4; `src/components/ui/` is vendored. shadcn components have their own DOM structure (for example the Select and the dual-thumb Slider), so tests should query them by role.
- Vitest, React Testing Library and jsdom. Route tests use `src/test/fakeSupabase.ts`.
- Native shells: `ios/` (Capacitor), `apple/` and `macos/` (Swift). They depend on web events, URL parameters and storage keys that knip and grep can't see; see `docs/native-shell-contract.md` before renaming any of them.

## Commands

```bash
npm ci              # install (`.npmrc` sets legacy-peer-deps=true)
npm run dev         # http://localhost:3000
npm run lint        # ESLint, zero warnings allowed
npm run typecheck   # next typegen + tsc
npm run knip        # unused files, exports and dependencies
npm test -- --run   # Vitest, single run
npm run build       # production build
```

- CI (`.github/workflows/merge-requirements.yml`, Node 22) runs lint, typecheck, knip and tests. Only Vercel builds for production, so run `npm run build` before pushing. Common build failures: missing Suspense boundaries, Supabase array access patterns, circular imports.
- `npm run build` needs `.env.local` (the Clerk publishable key); without it, prerendering `/` fails.
- On Node 26, Node's built-in `localStorage` hides jsdom's. Run tests as `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run`.
- `src/app/page.test.tsx` and `src/app/trips/new/page.test.tsx` sometimes fail in full runs under load. Rerun them alone before treating a failure as yours.
- Because of `legacy-peer-deps`, npm doesn't enforce peer ranges. After an upgrade, check the affected peers with `npm ls` (for example `vite` against `@vitejs/plugin-react`).
- Before starting a dev server, check whether port 3000 is in use. Another session may own it, so use another port (`npm run dev -- --port 3001`) rather than stopping it.

## Architecture rules

- Calculations (clo values, comfort and risk assessments, weather processing) run in API routes. Client code shows what the API returns and doesn't compute it.
- When you change calculation logic in `src/lib/biophysics/`, `src/lib/recommendations/` or the sport route handlers in `src/app/api/v1/recommendations/`, update the matching Mermaid diagrams in the "How Layer Recommendations Work" section of `README.md`. That covers the recommendation pipeline, garment categorization, ensemble building, sport variants, shell exclusion rules and extremity selection.
- The recommendation golden tests (`src/app/api/v1/recommendations/golden.test.ts`) pin output. Update the snapshot only for an intended change, and say so in the PR.
- Before adding catalog or wardrobe rows (garments, handwear, headwear), check that the item doesn't already exist. `.claude/skills/add-wardrobe-item/` describes the catalog workflow and has a read-only lookup script.

## Database migrations

- Add a migration as `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, later than the newest file. Older files use `0NN_name.sql`.
- Don't apply migrations. Production's migration history doesn't match the files, so never run `supabase db push`, and don't apply them through an MCP server either. The maintainer applies each one by hand in the Supabase SQL editor. In the PR, name the pending migration and say whether it must be applied before or after the deploy.
- `.env.local` points at the production Supabase project. Treat it as production credentials and never print its values.

## Parallel agents

Several agents (Claude Code sessions and Codex) work in this repository at the same time and share the main checkout.

- Don't edit files, switch branches or run npm in the main checkout. Start each task in its own worktree from `origin/main`, using absolute paths:

  ```bash
  git fetch origin
  git worktree add <repo>/.claude/worktrees/<name> -b <branch> origin/main
  npm ci --prefix <repo>/.claude/worktrees/<name>
  ln -s ../../../.env.local <repo>/.claude/worktrees/<name>/.env.local
  ```

  A bare `npm ci` run from the wrong directory replaces another checkout's `node_modules`.
- Before touching the main checkout for any reason, check `git status`, `git reflog -5` and whether `.git/MERGE_HEAD` exists. Another agent may be mid-task.
- Stage named paths, never `git add -A`. Don't commit files another session changed, or `.env.local`.
- Don't stop dev servers or other processes you didn't start.
- Local `npm run lint` and `npm run knip` in the main checkout also scan `.claude/worktrees/`; ignore findings there.
- Remove your worktree once its PR has merged.

## Working style

- If the maintainer interrupts or rejects an approach, stop, ask what they want instead, and don't continue the old approach.
- Prefer minimal, targeted changes over broad rewrites.

## Pull requests

- Title in plain words, ending with the issue number, for example `Add a note to each trip day for everyone (#334)`.
- Body sections: `## Summary`, `## Test Plan`, and `## Not verified` for anything you couldn't check. Reference the issue with `Refs #N`, or `Closes #N` when the PR finishes it.
- The `check-test-plan` job fails unless `## Test Plan` exists and holds at least one checkbox, all of them checked (`- [x]`). The section ends at the next `## ` heading or a `---` line, so put unchecked items under `## Not verified`.
- Merging needs one approving review (normally CodeRabbit), the Vercel, `check-test-plan` and `tests` checks, and a branch that's up to date with `main`. Don't merge, enable auto-merge or bypass the ruleset unless the maintainer asks.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
