// Fictional trips for the #211 browser checks, seeded into db.mjs's in-memory
// Postgres. No account, trip or source here is real. The trip ids start with
// 00000211-, which shim.patch recognises. Sources and reviews aren't seeded:
// run.mjs adds them through the app's own pages and API, as people would.

export const TOUR = '00000211-0000-4000-8000-000000000001';
export const CANADA = '00000211-0000-4000-8000-000000000002';
export const VIEWERS = { organizer: 'user-alex', blair: 'user-blair', casey: 'user-casey', outsider: 'user-zoe' };

const id = (n) => `00000211-0000-4000-8000-1000000000${String(n).padStart(2, '0')}`;
export const STOPS = { pinkham: id(1), rogers: id(2) };
export const DAYS = { fri: id(11), sat: id(12), sun: id(13), canada: id(21) };
export const DATES = { fri: '2027-01-08', sat: '2027-01-09', sun: '2027-01-10', canada: '2027-01-15' };

const point = (label, latitude, longitude) => JSON.stringify({ label, latitude, longitude, precision: 'exact', source: 'manual' });

export async function seed(db) {
  await db.query(`INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES
    ($1, 'user-alex', 'Presidential tour weekend', '2027-01-08', '2027-01-10'),
    ($2, 'user-alex', 'Rogers Pass tour', '2027-01-15', '2027-01-15')`, [TOUR, CANADA]);
  await db.query(`INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES
    ($1, 'user-alex', 'You', 'organizer', 'joined'), ($1, 'user-blair', 'Blair', 'member', 'joined'), ($1, 'user-casey', 'Casey', 'member', 'joined'),
    ($2, 'user-alex', 'You', 'organizer', 'joined'), ($2, 'user-blair', 'Blair', 'member', 'joined')`, [TOUR, CANADA]);
  await db.query(`INSERT INTO trip_stops (id, trip_id, position, name, latitude, longitude, activities, access_point) VALUES
    ($1, $2, 0, 'Pinkham Notch', 44.2576, -71.2531, '{Backcountry}', $3::jsonb),
    ($4, $5, 0, 'Rogers Pass', 51.3, -117.52, '{Backcountry}', NULL)`,
    [STOPS.pinkham, TOUR, point('Pinkham Notch visitor center lot', 44.2571, -71.2530), STOPS.rogers, CANADA]);
  await db.query(`INSERT INTO trip_days (id, trip_id, stop_id, date, activity) VALUES
    ($1, $5, $6, '2027-01-08', 'Backcountry'), ($2, $5, $6, '2027-01-09', 'Backcountry'), ($3, $5, $6, '2027-01-10', 'Backcountry'),
    ($4, $7, $8, '2027-01-15', 'Backcountry')`, [DAYS.fri, DAYS.sat, DAYS.sun, DAYS.canada, TOUR, STOPS.pinkham, CANADA, STOPS.rogers]);
  // Rogers Pass's day has its own access point, the place a suggestion checks.
  await db.query(`UPDATE trip_days SET access_point = $1::jsonb, access_point_stop_id = $2 WHERE id = $3`,
    [point('Rogers Pass summit lot', 51.3012, -117.5197), STOPS.rogers, DAYS.canada]);
  await db.query(`INSERT INTO trip_day_tour_plans (trip_id, trip_day_id, objective, route_url, backup_plan, created_by, updated_by) VALUES
    ($1, $2, 'Tuckerman Ravine', 'https://example.org/routes/tuckerman', 'Hillman''s Highway if the bowl is loaded', 'user-alex', 'user-alex'),
    ($1, $3, 'Gulf of Slides', NULL, NULL, 'user-alex', 'user-alex')`, [TOUR, DAYS.fri, DAYS.sat]);
}

// Avalanche Canada's public forecast API as src/lib/avalanche-centers.test.ts
// stubs it: one fictional square around Rogers Pass, named Glacier and
// forecast by Parks Canada. It carries ratings, which SWTTR must never show.
const square = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
export const AVALANCHE_CANADA = {
  areas: { type: 'FeatureCollection', features: [{ id: 'glacier', type: 'Feature', geometry: { type: 'Polygon', coordinates: [square(-118, 51, -117, 51.6)] } }] },
  metadata: [{
    product: { type: 'avalancheforecast', title: 'Glacier' }, area: { id: 'glacier', name: 'Glacier' },
    owner: { value: 'parks-glacier', display: 'Parks Canada', isExternal: false, url: 'Parks Canada' },
    icons: [{ type: 'ratings', ratings: { alp: 'considerable', tln: 'moderate', btl: 'low' } }],
    highestDanger: { value: 'considerable', display: 'Considerable', colour: 'orange' },
  }],
};
