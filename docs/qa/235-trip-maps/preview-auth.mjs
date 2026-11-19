// QA-only edits that let a local build open the fictional fixture trips
// signed out:  node docs/qa/235-trip-maps/preview-auth.mjs apply|revert
//
// - src/proxy.ts skips Clerk for /trips/trip-drive|trip-edge|trip-split pages.
//   Builds from before #382 (the load comparison's older commits) run every
//   request through clerkMiddleware, so there the fixture trips skip it.
// - useUserId and TripProvider take the viewer from localStorage.qa235User.
// Trip API requests never reach the server: run.mjs answers them in the
// browser from fixtures.json. Apply only around `next build`, then revert
// before anything else; `revert` fails unless the three files match HEAD.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const MARK = '/* QA-235 PREVIEW ONLY */';
const FIXTURE_TRIP = '/^\\/trips\\/trip-(drive|edge|split)(\\/|$)/.test(request.nextUrl.pathname)';
// Each file lists the anchors it may have, newest first; exactly one must match once.
const EDITS = [
  ['src/proxy.ts', [
    // Since #382 the condition goes on (|| the saved briefs route), so the anchor stops at the first test.
    ['if (PUBLIC_INFORMATION_ROUTES.includes(request.nextUrl.pathname)',
      `if (PUBLIC_INFORMATION_ROUTES.includes(request.nextUrl.pathname) || ${FIXTURE_TRIP} ${MARK}`],
    // October 2026 (b60faa4, 1b07628): every request went through Clerk, whose
    // development handshake redirects to Clerk. Skip it for the fixture trips,
    // as main's proxy does for its public information pages.
    ['export default clerkMiddleware(async (auth, request) => {',
      `export default function qaProxy(request: Parameters<typeof qaClerk>[0], event: Parameters<typeof qaClerk>[1]) { return ${FIXTURE_TRIP} ? NextResponse.next() : qaClerk(request, event); } ${MARK}\nconst qaClerk = clerkMiddleware(async (auth, request) => {`],
  ]],
  ['src/hooks/useUserId.ts', [[
    '  const { userId, isLoaded } = useAuth();\n',
    `  const { userId, isLoaded } = useAuth();\n  const qa = typeof window === "undefined" ? null : window.localStorage.getItem("qa235User"); ${MARK}\n  if (qa) return qa;\n`]]],
  ['src/components/trips/TripProvider.tsx', [[
    'enabled={isLoaded && !!userId}>',
    `enabled={(isLoaded && !!userId) || (typeof window !== "undefined" && !!window.localStorage.getItem("qa235User")) ${MARK}}>`]]],
];

const root = process.cwd();
const mode = process.argv[2];
if (mode === 'apply') {
  for (const [file, anchors] of EDITS) {
    const path = resolve(root, file), text = await readFile(path, 'utf8');
    if (text.includes(MARK)) throw new Error(`${file} is already patched`);
    const found = anchors.find(([from]) => text.split(from).length === 2);
    if (!found) throw new Error(`${file}: anchor not found exactly once; update preview-auth.mjs`);
    await writeFile(path, text.replace(found[0], found[1]));
  }
  console.log('Applied QA-only preview edits. Revert them right after the build.');
} else if (mode === 'revert') {
  for (const [file, anchors] of EDITS) {
    const path = resolve(root, file), text = await readFile(path, 'utf8');
    const applied = anchors.find(([, to]) => text.includes(to));
    if (applied) await writeFile(path, text.replace(applied[1], applied[0]));
  }
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...EDITS.map(([file]) => file)], { cwd: root, stdio: 'inherit' });
  console.log('Reverted; the three files match HEAD.');
} else {
  throw new Error('Usage: node docs/qa/235-trip-maps/preview-auth.mjs apply|revert');
}
