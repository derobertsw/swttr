// Reproducible local fixture for the selected-day map (#234): production
// components and styles, fictional itinerary data and a stubbed geometry API.
// No auth bypass, database call or routing request.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const root = process.cwd();
const directory = resolve(root, 'docs/qa/234-day-map/preview');
const shims = resolve(root, 'docs/qa/233-overview-map/preview');
const aliases = { '@': resolve(root, 'src'), 'server-only': resolve(root, 'node_modules/server-only/empty.js'), 'next/navigation': resolve(shims, 'navigation.tsx'), 'next/dynamic': resolve(shims, 'dynamic.tsx'), 'next/link': resolve(shims, 'link.tsx') };
const port = Number(process.env.PORT ?? 3000);
const server = await createServer({ configFile: false, root: directory, plugins: [react()], css: { postcss: { plugins: [tailwind()] } }, resolve: { alias: aliases }, server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [root] } } });
const { tripMapFixture, storedDrive } = await server.ssrLoadModule(resolve(root, 'src/test/tripMap.ts'));
const { driveTrip } = await server.ssrLoadModule(resolve(root, 'src/test/driveTrip.ts'));
const { buildTourPlanSummary } = await server.ssrLoadModule(resolve(root, 'src/lib/trip-tour-plans.ts'));
const now = Date.now();
const full = driveTrip();
full.tour_plans = [buildTourPlanSummary({ id: 'tour', trip_id: full.trip.id, trip_day_id: full.days[1].id, objective: 'Spruce Peak north glades', route_url: 'https://example.com/fictional-tour',
  meet_time: '08:00', meet_day_offset: 0, return_time: null, time_zone: 'America/New_York', revision: 1, updated_at: '2027-01-01T12:00:00Z',
  access_notes: 'Fictional: uphill travel pass required at the ticket window.', pickup_notes: 'Fictional: second car waits at the lower lot.',
  approach_notes: 'Fictional: skin about 40 minutes up the summer road.' }, '2027-01-09')];
const fixture = await tripMapFixture(full, { rows: [storedDrive(full, '2027-01-09', new Date(now - 3_600_000).toISOString()), storedDrive(full, '2027-01-10', new Date(now - 3_600_000).toISOString())], now });
await writeFile(resolve(directory, 'fixture.json'), JSON.stringify(fixture, null, 2));
await server.listen();
server.printUrls();
