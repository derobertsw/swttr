// Reproducible local fixture, with the production map/list and bundled styles.
// No auth bypass, database calls or test route in the deployed application.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const root = process.cwd();
const directory = resolve(root, 'docs/qa/233-overview-map/preview');
const aliases = { '@': resolve(root, 'src'), 'server-only': resolve(root, 'node_modules/server-only/empty.js'), 'next/navigation': resolve(directory, 'navigation.tsx'), 'next/dynamic': resolve(directory, 'dynamic.tsx'), 'next/link': resolve(directory, 'link.tsx') };
const server = await createServer({ configFile: false, root: directory, plugins: [react()], css: { postcss: { plugins: [tailwind()] } }, resolve: { alias: aliases }, server: { host: '127.0.0.1', port: 3000, strictPort: true, fs: { allow: [root] } } });
const { tripMapFixture } = await server.ssrLoadModule(resolve(root, 'src/test/tripMap.ts'));
const fixture = await tripMapFixture();
fixture.places[0].name = 'The exceptionally long Green Mountain Lodge and Backcountry Learning Center';
fixture.places[0].precision = 'approximate';
fixture.places[0].address = 'Fictional accommodation, Vermont';
fixture.dates.push({ date: '2027-01-12', label: 'Tue Jan 12 · unassigned' });
await writeFile(resolve(directory, 'fixture.json'), JSON.stringify(fixture, null, 2));
await server.listen();
server.printUrls();
