// QA-only edits that let a local production build open the fictional #337
// fixture trips with no Clerk session, for the #214 browser checks:
//
//   node docs/qa/214-offline-brief/preview-auth.mjs apply|revert
//
// - next.config.ts aliases `@clerk/nextjs` to fake-clerk.tsx (who's signed in
//   is the qa337_viewer cookie; it doesn't load offline, as Clerk doesn't).
// - src/proxy.ts sends /api/v1/trips, /api/v1/trips/qa337-* and /qa214/* to
//   the fixture API (api.mjs), and skips Clerk's middleware for the pages the
//   checks open: /, /trips, /trips/qa337-*, /privacy.
//
// Apply only around `next build`, then revert before anything else; `revert`
// fails unless both files match HEAD again. Nothing here is ever committed.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const MARK = '/* QA-214 PREVIEW ONLY */';
const EDITS = [
  ['next.config.ts',
    '  /* config options here */\n',
    `  /* config options here */\n  turbopack: { resolveAlias: { "@clerk/nextjs": "./docs/qa/214-offline-brief/fake-clerk.tsx" } }, ${MARK}\n`],
  ['src/proxy.ts',
    'export default function proxy(request: NextRequest, event: NextFetchEvent) {\n',
    `export default function proxy(request: NextRequest, event: NextFetchEvent) {
  ${MARK}
  const qaPath = request.nextUrl.pathname;
  if (/^\\/(api\\/v1\\/trips(\\/qa337-[^/]+(\\/.*)?)?|qa214\\/.*)$/.test(qaPath)) {
    return NextResponse.rewrite(new URL(\`\${qaPath}\${request.nextUrl.search}\`, process.env.QA214_API ?? "http://127.0.0.1:39214"));
  }
  if (qaPath === "/" || qaPath === "/trips" || qaPath.startsWith("/trips/qa337-")) return NextResponse.next();
`],
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
  console.log('Reverted; next.config.ts and src/proxy.ts match HEAD.');
} else {
  throw new Error('Usage: node docs/qa/214-offline-brief/preview-auth.mjs apply|revert');
}
