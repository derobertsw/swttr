// Writes the #235 fixture responses (see fixtures.ts) as JSON:
//   node docs/qa/235-trip-maps/fixtures.mjs <out.json>
// Loads the production projections through Vite's SSR loader, as the #233
// and #234 previews do. No network, database or provider call.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

export async function loadFixtures(root = process.cwd()) {
  const server = await createServer({
    configFile: false, root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
    // trips.ts reaches Clerk's server auth through lib/api; the fixtures never call it.
    resolve: { alias: { '@': resolve(root, 'src'), 'server-only': resolve(root, 'node_modules/server-only/empty.js'), '@clerk/nextjs/server': resolve(root, 'docs/qa/235-trip-maps/clerk-server-stub.mjs') } },
  });
  try {
    const { qaFixtures } = await server.ssrLoadModule(resolve(root, 'docs/qa/235-trip-maps/fixtures.ts'));
    return await qaFixtures();
  } finally {
    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) throw new Error('Usage: node docs/qa/235-trip-maps/fixtures.mjs <out.json>');
  await writeFile(out, JSON.stringify(await loadFixtures(), null, 2));
  console.log(`Wrote ${out}`);
}
