// QA-only edits that let a local build open the fictional fixture trips
// signed out:  node docs/qa/235-trip-maps/preview-auth.mjs apply|revert
//
// - src/proxy.ts skips Clerk for /trips/trip-drive|trip-edge|trip-split pages.
// - useUserId and TripProvider take the viewer from localStorage.qa235User.
// Trip API requests never reach the server: run.mjs answers them in the
// browser from fixtures.json. Apply only around `next build`, then revert
// before anything else; `revert` fails unless the three files match HEAD.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const MARK = '/* QA-235 PREVIEW ONLY */';
const EDITS = [
  ['src/proxy.ts',
    // Since #382 the condition goes on (|| the saved briefs route), so the anchor stops at the first test.
    'if (PUBLIC_INFORMATION_ROUTES.includes(request.nextUrl.pathname)',
    `if (PUBLIC_INFORMATION_ROUTES.includes(request.nextUrl.pathname) || /^\\/trips\\/trip-(drive|edge|split)(\\/|$)/.test(request.nextUrl.pathname) ${MARK}`],
  ['src/hooks/useUserId.ts',
    '  const { userId, isLoaded } = useAuth();\n',
    `  const { userId, isLoaded } = useAuth();\n  const qa = typeof window === "undefined" ? null : window.localStorage.getItem("qa235User"); ${MARK}\n  if (qa) return qa;\n`],
  ['src/components/trips/TripProvider.tsx',
    'enabled={isLoaded && !!userId}>',
    `enabled={(isLoaded && !!userId) || (typeof window !== "undefined" && !!window.localStorage.getItem("qa235User")) ${MARK}}>`],
];

const root = process.cwd();
const mode = process.argv[2];
if (mode === 'apply') {
  for (const [file, from, to] of EDITS) {
    const path = resolve(root, file), text = await readFile(path, 'utf8');
    if (text.includes(MARK)) throw new Error(`${file} is already patched`);
    if (text.split(from).length !== 2) throw new Error(`${file}: anchor not found exactly once; update preview-auth.mjs`);
    await writeFile(path, text.replace(from, to));
  }
  console.log('Applied QA-only preview edits. Revert them right after the build.');
} else if (mode === 'revert') {
  for (const [file, from, to] of EDITS) {
    const path = resolve(root, file), text = await readFile(path, 'utf8');
    if (text.includes(MARK)) await writeFile(path, text.replace(to, from));
  }
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...EDITS.map(([file]) => file)], { cwd: root, stdio: 'inherit' });
  console.log('Reverted; the three files match HEAD.');
} else {
  throw new Error('Usage: node docs/qa/235-trip-maps/preview-auth.mjs apply|revert');
}
