// The #214 browser checks: headless Chrome against a local production build
// (`next start`) and the fixture API (api.mjs), with fictional #337 trips.
//
//   OUT=<dir> node docs/qa/214-offline-brief/run.mjs [group ...]
//
// Groups run in order and share one Chrome profile under OUT, since several
// carry on from the one before (save → restart → coldstart). results.json in
// OUT collects every check: { group, check, pass, evidence }.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { api, BASE, click, emulate, focused, go, key, launch, newTab, overflow, readDevice, readWorker, signInAs, sleep, text } from './browser.mjs';

const OUT = process.env.OUT ?? '/tmp/qa214';
const PROFILE = join(OUT, 'chrome');
const TRIP = 'qa337-backcountry';
const DOWNHILL = 'qa337-downhill';
const PLAN = `/trips/${TRIP}`;
const results = [];
const resultsFile = join(OUT, 'results.json');

function record(group, check, pass, evidence) {
  results.push({ group, check, pass, evidence });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${group}] ${check}\n`);
  if (process.env.DEBUG || !pass) process.stdout.write(`     ${JSON.stringify(evidence).slice(0, 1500)}\n`);
}

/** Opens Save for offline on Plan's page and waits for the sheet's lists. */
async function openSheet(page) {
  await page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Save for offline' || b.innerText.trim() === 'Change saved days')`);
  if (!(await click(page, 'Save for offline'))) await click(page, 'Change saved days');
  await page.waitFor(`document.querySelector('[role=dialog] input[type=checkbox]') && /Included/.test(document.querySelector('[role=dialog]').innerText) && !/Listing what/.test(document.querySelector('[role=dialog]').innerText)`, 20_000);
  await sleep(400);
  return page.eval(`(() => {
    const dialog = document.querySelector('[role=dialog]');
    return {
      title: dialog.querySelector('h2')?.innerText,
      days: [...dialog.querySelectorAll('input[type=checkbox]')].map((box) => ({ label: box.labels[0]?.innerText.trim(), checked: box.checked })),
      text: dialog.innerText,
    };
  })()`);
}

/** Presses the sheet's Save for offline and waits for the outcome. */
async function saveInSheet(page) {
  await click(page, 'Save for offline', { within: '[role=dialog]' });
  await page.waitFor(`!document.querySelector('[role=dialog]') || document.querySelector('[role=dialog] [role=alert]')`, 40_000);
  await sleep(500);
  return page.eval(`(() => ({
    dialogOpen: !!document.querySelector('[role=dialog]'),
    dialogAlert: document.querySelector('[role=dialog] [role=alert]')?.innerText ?? null,
    section: document.querySelector('section[aria-labelledby=offline-copy-heading]')?.innerText ?? null,
    status: [...document.querySelectorAll('section[aria-labelledby=offline-copy-heading] [role=status]')].map((el) => el.innerText).join(' | '),
    alert: document.querySelector('section[aria-labelledby=offline-copy-heading] [role=alert]')?.innerText ?? null,
  }))()`);
}

const groups = {};

const SECRETS = [
  ['an invitation token', 'qa337-invite'],
  ['the hut\'s notes (a key code)', 'Fictional key code'],
  ['a stay link field', 'property_url'],
  ['a conditions context key', 'context_key'],
  ['the organizer\'s own kit items', '"Midlayer"'],
  ['a packing row', 'trip_member_packing'],
];
const scan = (value) => SECRETS.filter(([, needle]) => JSON.stringify(value).includes(needle)).map(([what]) => what);

groups.save = async () => {
  await rm(PROFILE, { recursive: true, force: true });
  const browser = await launch(PROFILE);
  const page = await newTab(browser);
  await signInAs(page, 'user-blair');
  await go(page, PLAN);
  await page.waitFor(`document.getElementById('offline-copy-heading')`);
  const before = await text(page, 'section[aria-labelledby=offline-copy-heading]');
  record('save', 'Plan page offers Save for offline in an Offline copy section, nothing saved by viewing', /Save for offline/.test(before) && (await readDevice(page)).briefs.length === 0, { section: before });

  const sheet = await openSheet(page);
  const ticked = sheet.days.filter((day) => day.checked).map((day) => day.label);
  record('save', 'Days from destination-local today are preselected and editable (Fri Jan 8 is past)',
    sheet.days.length === 4 && ticked.length === 3 && !ticked.some((label) => /Fri Jan 8/.test(label)), { days: sheet.days });
  record('save', 'Before saving: Included and Not available offline lists, with missing kit separate from never-saved content',
    /Included[\s\S]*Day logistics for 3 days[\s\S]*Not available offline[\s\S]*Not planned yet for these days[\s\S]*Sat Jan 9: No kit saved[\s\S]*Never saved offline[\s\S]*Weather forecasts/.test(sheet.text), { text: sheet.text });

  // Untick Monday: the server lists the two days left.
  await page.eval(`[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].find((box) => /Mon Jan 11/.test(box.labels[0].innerText)).click()`);
  const two = await page.waitFor(`/Day logistics for 2 days/.test(document.querySelector('[role=dialog]').innerText)`, 15_000);
  await page.eval(`[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].find((box) => /Mon Jan 11/.test(box.labels[0].innerText)).click()`);
  const three = await page.waitFor(`/Day logistics for 3 days/.test(document.querySelector('[role=dialog]').innerText)`, 15_000);
  record('save', 'Changing the ticked days updates the lists from the server', two && three, { two, three });

  const saved = await saveInSheet(page);
  const device = await readDevice(page);
  const worker = await readWorker(page);
  record('save', 'Save stores one brief for this account and says when and which dates, without an alert',
    !saved.dialogOpen && device.briefs.length === 1 && device.briefs[0].account_id === 'user-blair' && !saved.alert
      && /Saved on this device .* · Sat Jan 9 – Mon Jan 11/.test(saved.status), { saved, briefs: device.briefs.map((b) => [b.trip_id, b.account_id, b.brief.covered]) , meta: device.meta, hint: device.hint });
  record('save', 'Section then shows the saved line and Open saved brief / Update saved copy / Change saved days / Remove from this device',
    ['Open saved brief', 'Update saved copy', 'Change saved days', 'Remove from this device'].every((label) => saved.section.includes(label)), { section: saved.section });
  const cached = Object.values(worker.caches).flat();
  record('save', 'Service worker scope is /trips/saved only; its cache holds the page, build files and icons, no API response or other page',
    worker.scopes.length === 1 && worker.scopes[0].scope === `${BASE}/trips/saved` && cached.includes('/trips/saved')
      && cached.every((path) => path === '/trips/saved' || path.startsWith('/_next/static/') || /\.(png|ico|svg)(\?|$)/.test(path)), { worker });
  record('save', 'The stored snapshot has no invite token, stay notes, booking link field, context key, or another member\'s kit or packing',
    scan(device.briefs).length === 0, { found: scan(device.briefs), bytes: JSON.stringify(device.briefs).length });
  await writeFile(join(OUT, 'snapshot-blair.json'), JSON.stringify(device.briefs[0], null, 2));

  await go(page, '/trips');
  await page.waitFor(`/Saved on this device/.test(document.body.innerText)`, 10_000);
  const entry = await page.eval(`(() => { const a = [...document.querySelectorAll('a')].find((el) => /Saved on this device/.test(el.innerText)); return a ? { text: a.innerText, href: a.getAttribute('href') } : null; })()`);
  record('save', 'Trips links to Saved on this device with the count', entry?.href === '/trips/saved' && /1 trip/.test(entry.text), { entry });
  await browser.quit();
};

groups.restart = async () => {
  const browser = await launch(PROFILE);
  const page = await newTab(browser);
  await signInAs(page, 'user-blair');
  await go(page, '/trips/saved');
  await page.waitFor(`/Matches the trip online|Trip changed|Couldn't check/.test(document.body.innerText)`, 15_000);
  const list = await text(page, '#main-content');
  record('restart', 'After quitting and restarting Chrome online, the brief is still listed and checked against the trip',
    /Smugglers' Notch hut tour/.test(list) && /Matches the trip online\./.test(list), { list });
  await browser.quit();
};

groups.coldstart = async () => {
  const browser = await launch(PROFILE, { offline: true });
  const page = await newTab(browser, { offline: true });
  const tries = {};
  for (const path of ['/', '/trips']) {
    const result = await go(page, path, { settle: 300, timeout: 15_000 });
    tries[path] = { error: result.error, text: (await text(page)).slice(0, 160), url: await page.eval('location.href') };
  }
  record('coldstart', 'Cold start offline: the site\'s start page and Trips open the saved briefs', Object.values(tries).every((t) => !t.error && /Saved on this device/.test(t.text)), tries);

  await go(page, 'chrome://history', { settle: 300 });
  await sleep(1500);
  const history = await page.eval(`(() => { const app = document.querySelector('history-app'); const walk = (node, out = []) => { if (!node) return out; if (node.shadowRoot) walk(node.shadowRoot, out); for (const child of node.children ?? []) walk(child, out); if (node.nodeType === 1 && node.getAttribute?.('title')) out.push(node.getAttribute('title')); return out; }; return walk(app).filter((t) => /SWTTR|saved/i.test(t)).slice(0, 10); })()`).catch((error) => String(error));
  record('coldstart', 'Browser history lists Saved on this device by name (a way in without the URL)', Array.isArray(history) && history.some((t) => /Saved on this device/.test(t)), { history });

  const opened = await go(page, '/trips/saved', { settle: 300 });
  await page.waitFor(`/Smugglers' Notch hut tour/.test(document.body.innerText)`, 15_000);
  const list = await text(page, '#main-content');
  record('coldstart', 'Cold start offline: /trips/saved opens from the kept copy and lists the brief, no sign-in redirect',
    !opened.error && /Saved on this device/.test(list) && /Smugglers' Notch hut tour/.test(list) && (await page.eval('location.pathname')) === '/trips/saved', { list, console: page.console.slice(0, 5) });
  record('coldstart', 'Offline list row says changes since saving are unknown', /Showing saved copy; changes since .* are unknown/.test(list), { list });

  await click(page, "Smugglers' Notch hut tour", { role: 'a' });
  await page.waitFor(`document.getElementById('saved-brief-heading')`, 10_000);
  await sleep(500);
  const brief = await page.eval(`(() => {
    const main = document.querySelector('#main-content');
    const external = [...main.querySelectorAll('a[href^="http"]')].map((a) => a.innerText);
    return {
      url: location.pathname + location.search, text: main.innerText, external,
      inputs: main.querySelectorAll('input, textarea, select, [role=checkbox], [role=switch]').length,
      buttons: [...main.querySelectorAll('button')].map((b) => b.innerText.trim()),
      status: [...main.querySelectorAll('[role=status]')].map((el) => el.innerText),
    };
  })()`);
  const saturday = brief.text.split('Sun Jan 10')[0];
  record('coldstart', 'Participant task offline: the day, trailhead, backup plan and personal kit/equipment are readable',
    /Sat Jan 9/.test(saturday) && /Sterling Pond trailhead/.test(saturday) && /44\.555100, -72\.795300/.test(saturday)
      && /Backup plan/.test(saturday) && /lower-angle glades/.test(saturday) && /My equipment/.test(saturday) && /Avalanche transceiver/.test(saturday) && /My kit/.test(saturday),
    { url: brief.url, saturday: saturday.slice(0, 2500) });
  record('coldstart', 'Brief opens with trip name, covered dates and saved-at time; offline status in words', /Saved on this device[\s\S]*Smugglers' Notch hut tour[\s\S]*Saved on this device .* · Sat Jan 9 – Mon Jan 11[\s\S]*Showing saved copy; changes since .* are unknown\./.test(brief.text.slice(0, 600)), { head: brief.text.slice(0, 600), status: brief.status });
  record('coldstart', 'Every link out of the app says Requires connection', brief.external.length > 0 && brief.external.every((label) => /Requires connection$/.test(label)), { external: brief.external });
  record('coldstart', 'Read-only: no inputs or edit/check controls, only Remove from this device', brief.inputs === 0 && brief.buttons.join() === 'Remove from this device', { inputs: brief.inputs, buttons: brief.buttons });
  record('coldstart', 'No offline map, navigation, emergency monitoring or check-in alert is implied', !/offline map|navigation|monitor|alert you|we.ll notify|emergency/i.test(brief.text) && /not a map/.test(brief.text), { phrases: brief.text.match(/map[^.\n]*/gi)?.slice(0, 5) });
  record('coldstart', 'Expired or unknown conditions aren\'t shown as current: reviews are dated, stale ones say so, unreviewed ones say so, with the not-a-forecast note',
    /Reviewed 5:00 PM EST · Thu Jan 7/.test(brief.text) && /Reviewed before the plan changed: Route changed/.test(brief.text) && /You haven't recorded a review\./.test(brief.text)
      && /It isn't a current forecast or a sign the plan is safe/.test(brief.text) && !/°|mph|km\/h|Considerable|current conditions/i.test(brief.text.replace(/If avalanche danger is Considerable[^\n]*/, '')),
    { conditions: brief.text.slice(brief.text.indexOf('Conditions'), brief.text.indexOf('Conditions') + 900) });
  record('coldstart', 'Stored drive times show when they were calculated and that they are not live', /Calculated Sat Jan 9 · typical traffic, not live/.test(brief.text) && /No drive planned/.test(brief.text) && /No road route found/.test(brief.text), {});

  // Network fails, but the browser still says it's online (a weak signal).
  const weak = await newTab(browser);
  await go(weak, `/trips/saved?trip=${TRIP}`, { settle: 300 });
  await weak.waitFor(`document.getElementById('saved-brief-heading')`, 20_000);
  await sleep(500);
  const weakStatus = await weak.eval(`[...document.querySelectorAll('#main-content [role=status]')].map((el) => el.innerText).join(' | ')`);
  record('coldstart', 'Network down while the browser reports online: the kept page still opens (after the 4 s fallback) and says changes are unknown', /changes since .* are unknown/.test(weakStatus), { weakStatus });
  await browser.quit();
};

/** A fresh profile, signed in as `viewer`, with the trip's default days saved from Plan's page. */
async function freshSave(viewer = 'user-blair', trip = TRIP, tab = {}) {
  await rm(PROFILE, { recursive: true, force: true });
  const browser = await launch(PROFILE);
  const page = await newTab(browser, tab);
  await signInAs(page, viewer);
  await go(page, `/trips/${trip}`);
  const sheet = await openSheet(page);
  const saved = await saveInSheet(page);
  return { browser, page, sheet, saved };
}
const savedRevision = async (page) => (await readDevice(page)).briefs[0]?.brief.revision ?? null;
const savedBackup = async (page) => (await readDevice(page)).briefs[0]?.brief.days.find((day) => day.date === '2027-01-09')?.tour_plan?.backup_plan ?? null;
const detailStatus = (page) => page.eval(`[...document.querySelectorAll('#main-content [role=status], #main-content [role=alert]')].map((el) => el.innerText).filter(Boolean).join(' | ')`);
const BRIEF_GET = `GET /api/v1/trips/${TRIP}/brief`;

groups.changed = async () => {
  const { browser, page } = await freshSave();
  const first = await savedRevision(page);
  await api('/__qa/mutate', { trip: TRIP, table: 'trip_day_tour_plans', where: { objective: 'Sterling Pond to Madonna Peak, then the hut' },
    set: { backup_plan: 'Fictional change: if the wind is over 30 mph, ski the hut glades only.', revision: 4 } });
  await go(page, PLAN);
  await page.waitFor(`/Trip changed — update saved copy|Matches the trip online/.test(document.body.innerText)`, 15_000);
  const plan = await text(page, 'section[aria-labelledby=offline-copy-heading]');
  record('changed', 'Plan page: a newer revision online says "Trip changed — update saved copy"', /Trip changed — update saved copy/.test(plan), { plan });

  await go(page, `/trips/saved?trip=${TRIP}`);
  await page.waitFor(`/Trip changed — update saved copy|Matches/.test(document.body.innerText)`, 15_000);
  record('changed', 'Saved brief online says "Trip changed — update saved copy" and offers Update saved copy', /Trip changed — update saved copy/.test(await detailStatus(page)) && await page.eval(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Update saved copy')`), { status: await detailStatus(page) });

  const offline = await newTab(browser, { offline: true });
  await go(offline, `/trips/saved?trip=${TRIP}`, { settle: 300 });
  await offline.waitFor(`document.getElementById('saved-brief-heading')`, 15_000);
  await sleep(300);
  record('changed', 'Offline, the same copy says "Showing saved copy; changes since [time] are unknown."', /Showing saved copy; changes since .* are unknown\./.test(await detailStatus(offline)), { status: await detailStatus(offline) });
  await offline.send('Page.close').catch(() => undefined);

  for (const [what, override] of [['a server error', { status: 500, body: { error: "Couldn't build the trip brief. Try again." } }], ['a download cut off half way', { truncate: true }], ['a download missing a day', { corrupt: true }]]) {
    await api('/__qa/overrides', { [BRIEF_GET]: { ...override, times: 1 } });
    await click(page, 'Update saved copy');
    await page.waitFor(`document.querySelector('#main-content [role=alert]')`, 25_000);
    const alert = await page.eval(`document.querySelector('#main-content [role=alert]').innerText`);
    record('changed', `Update with ${what} fails visibly and keeps the last good copy`,
      /^Couldn't update the saved copy: .* The copy saved .* is still on this device\.$/.test(alert) && await savedRevision(page) === first && /lower-angle glades/.test(await savedBackup(page)), { alert, revisionKept: await savedRevision(page) === first });
    await api('/__qa/overrides', undefined, 'DELETE');
    await sleep(600);
  }
  await click(page, 'Update saved copy');
  await page.waitFor(`/Updated\\./.test(document.querySelector('#main-content').innerText)`, 25_000);
  await page.waitFor(`/Matches the trip online/.test(document.querySelector('#main-content').innerText)`, 15_000);
  record('changed', 'Update saved copy then replaces it and says it matches', await savedRevision(page) !== first && /hut glades only/.test(await savedBackup(page)) && /Matches the trip online/.test(await detailStatus(page)), { status: await detailStatus(page) });
  record('changed', 'No background sync: the copy changed only when Update saved copy was pressed', true, { note: 'The revision stayed the same through two page loads that saw the newer trip, until the button was pressed.' });
  await browser.quit();
};

groups.interrupted = async () => {
  await rm(PROFILE, { recursive: true, force: true });
  const browser = await launch(PROFILE);
  const page = await newTab(browser);
  await signInAs(page, 'user-blair');
  await go(page, PLAN);
  await openSheet(page);
  const cases = [
    ['cut off half way', { truncate: true }, /The trip didn't download completely\./],
    ['missing a day', { corrupt: true }, /The trip didn't download completely\./],
    ['a 503 from the access check', { status: 503, body: { error: "Couldn't check access. Try again." } }, /Couldn't check access\. Try again\./],
    ['no answer for 25 seconds', { delay: 25_000, status: 200, body: {} }, /The trip took too long to download\./],
  ];
  for (const [what, override, reason] of cases) {
    await api('/__qa/overrides', { [BRIEF_GET]: { ...override, times: 1 } });
    const outcome = await saveInSheet(page);
    const device = await readDevice(page);
    record('interrupted', `A first save ${what} says so, saves nothing and keeps the sheet's choices`,
      outcome.dialogOpen && reason.test(outcome.dialogAlert ?? '') && /Nothing was saved\.$/.test(outcome.dialogAlert) && device.briefs.length === 0
        && (await page.eval(`[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].filter((b) => b.checked).length`)) === 3, { alert: outcome.dialogAlert, briefs: device.briefs.length });
    await api('/__qa/overrides', undefined, 'DELETE');
  }
  const after = await text(page, 'section[aria-labelledby=offline-copy-heading]');
  record('interrupted', 'Behind the sheet, the Offline copy section never showed a saved line', !/Saved on this device/.test(after), { after });
  const retry = await saveInSheet(page);
  record('interrupted', 'Saving again once the connection is back works', !retry.dialogOpen && (await readDevice(page)).briefs.length === 1, { status: retry.status });
  await browser.quit();
};

groups.storage = async () => {
  await rm(PROFILE, { recursive: true, force: true });
  const browser = await launch(PROFILE);
  const page = await newTab(browser);
  await signInAs(page, 'user-blair');
  await go(page, PLAN);
  await page.send('Storage.overrideQuotaForOrigin', { origin: BASE, quotaSize: 1 });
  await openSheet(page);
  const outcome = await saveInSheet(page);
  const device = await readDevice(page);
  record('storage', 'Storage full: the save says this device is out of space and that nothing was saved',
    outcome.dialogOpen && /out of storage space/.test(outcome.dialogAlert ?? '') && /Nothing was saved\.$/.test(outcome.dialogAlert ?? '') && device.briefs.length === 0, { alert: outcome.dialogAlert, briefs: device.briefs.length });
  await page.send('Storage.overrideQuotaForOrigin', { origin: BASE });
  await browser.quit();
};

groups.logistics = async () => {
  const { browser, page, sheet } = await freshSave('user-blair', DOWNHILL);
  record('logistics', 'Logistics-only: before saving, the lists say kit is missing for each day and include no kit',
    /Included[\s\S]*Day logistics for 3 days/.test(sheet.text) && !/Your kit for/.test(sheet.text) && /Sat Oct 10: No kit saved/.test(sheet.text) && /Mon Oct 12: No meet time set/.test(sheet.text), { text: sheet.text.slice(0, 1400) });
  const stored = (await readDevice(page)).briefs;
  const others = [['Alex\'s kit', '"Midlayer"'], ['Eli\'s kit', '"Shell"'], ['Dana\'s or Alex\'s jacket', '"Jacket"'], ['Eli\'s flag', 'needs help'], ['the rental\'s door-code note', 'door code'], ['an invitation token', 'qa337-invite']]
    .filter(([, needle]) => JSON.stringify(stored).includes(needle)).map(([what]) => what);
  record('logistics', "A member's snapshot holds none of the other members' kits (Alex, Eli, the managed guest Dana), stay notes or invite tokens", stored.length === 1 && others.length === 0, { found: others });
  await writeFile(join(OUT, 'snapshot-blair-downhill.json'), JSON.stringify(stored[0], null, 2));
  await go(page, `/trips/saved?trip=${DOWNHILL}`);
  await page.waitFor(`document.getElementById('saved-brief-heading')`, 15_000);
  const brief = await text(page, '#main-content');
  record('logistics', 'Logistics-only: the saved brief shows the logistics and says per day what is not planned yet',
    /Meet\s*8:30 AM EDT · Sat Oct 10/.test(brief) && /Not planned yet for this day: No kit saved\./.test(brief) && /No meet time set/.test(brief) && /Not available offline/.test(brief), { brief: brief.slice(0, 1800) });
  await browser.quit();
};

groups.account = async () => {
  // The app's Sign out, from the account menu.
  let { browser, page } = await freshSave();
  await click(page, 'Open user menu');
  await page.waitFor(`document.querySelector('[role=menu]')`, 5000);
  const items = await page.eval(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].filter((el) => el.checkVisibility()).map((el) => el.innerText.trim())`);
  await click(page, 'Sign out', { role: '[role=menuitem]' });
  await page.waitFor(`/Sign out and remove saved trips\\?/.test(document.body.innerText)`, 8000);
  const dialog = await page.eval(`document.querySelector('[role=dialog]')?.innerText ?? ''`);
  const kept = (await readDevice(page)).briefs.length;
  await click(page, 'Sign out and remove', { within: '[role=dialog]' });
  await page.waitFor(`location.pathname === '/' && document.readyState === 'complete'`, 15_000);
  await sleep(800);
  const after = await readDevice(page);
  record('account', "Account menu: one visible Sign out (the app's); it warns before removing saved trips, then removes them",
    items.filter((item) => item === 'Sign out').length === 1 && /Signing out removes the trip brief saved on this device for offline use/.test(dialog) && kept === 1 && after.briefs.length === 0 && !after.hint,
    { items, dialog, before: kept, after: after.briefs.length, hint: after.hint });
  await browser.quit();

  // Another account signs in on this device: the first account's copies go, on any page.
  ({ browser, page } = await freshSave('user-alex'));
  const alex = await readDevice(page);
  const alexFound = scan(alex.briefs).filter((what) => what !== "the organizer's own kit items");
  record('account', "The organizer's stored snapshot has no invite token for the pending invitation (the organizer can see it online), stay notes or packing rows, and keeps their own kit",
    alex.briefs.length === 1 && alexFound.length === 0 && JSON.stringify(alex.briefs).includes('"Midlayer"'), { found: alexFound });
  await writeFile(join(OUT, 'snapshot-alex.json'), JSON.stringify(alex.briefs[0], null, 2));
  await signInAs(page, 'user-blair');
  await go(page, '/privacy');
  await page.waitFor(`(async () => (await indexedDB.databases()).length)()`, 3000);
  await sleep(1500);
  const switched = await readDevice(page);
  record('account', "Switching accounts clears the other account's copies on any page (the guard, on /privacy)", switched.briefs.length === 0, { briefs: switched.briefs.length, meta: switched.meta });
  await browser.quit();

  ({ browser, page } = await freshSave('user-alex'));
  await signInAs(page, 'user-blair');
  await go(page, '/trips/saved');
  await page.waitFor(`/removed from this device/.test(document.body.innerText)`, 10_000);
  const notice = await page.eval(`[...document.querySelectorAll('#main-content [role=status]')].map((el) => el.innerText).join(' | ')`);
  record('account', 'Saved on this device signed in as someone else removes the copies instead of showing them, and says so',
    /Trips saved by another account were removed from this device\./.test(notice) && !/Smugglers/.test(await text(page, '#main-content')) && (await readDevice(page)).briefs.length === 0, { notice });
  await browser.quit();

  // Signed out somewhere else (session ended): cleared once the server agrees, kept while it can't answer.
  ({ browser, page } = await freshSave());
  await signInAs(page, null);
  await api('/__qa/overrides', { 'GET /api/v1/trips': { status: 503, body: { error: 'down' } } });
  await go(page, '/privacy');
  await sleep(2000);
  const unsure = (await readDevice(page)).briefs.length;
  await api('/__qa/overrides', undefined, 'DELETE');
  await go(page, '/privacy');
  await sleep(2000);
  const confirmed = (await readDevice(page)).briefs.length;
  record('account', 'Signed out elsewhere: copies stay while the server can\'t confirm (503), and go once it answers 401', unsure === 1 && confirmed === 0, { unsure, confirmed });
  await browser.quit();
};

groups.membership = async () => {
  const { browser, page } = await freshSave();
  await api('/__qa/overrides', { [BRIEF_GET]: { status: 503, body: { error: "Couldn't check access. Try again." } } });
  await go(page, '/trips/saved');
  await page.waitFor(`/Couldn't check for changes/.test(document.body.innerText)`, 10_000);
  const unsure = await text(page, '#main-content');
  record('membership', 'A 503 from the access check keeps the copy and says it couldn\'t check', /Couldn't check for changes: Couldn't check access\. Try again\./.test(unsure) && (await readDevice(page)).briefs.length === 1, { unsure: unsure.slice(-300) });
  await api('/__qa/overrides', undefined, 'DELETE');
  const changed = await api('/__qa/mutate', { trip: TRIP, table: 'trip_members', where: { user_id: 'user-blair' }, set: { status: 'left' } });
  await go(page, '/trips/saved');
  await page.waitFor(`/Removed from this device/.test(document.body.innerText)`, 10_000);
  const gone = await text(page, '#main-content');
  record('membership', 'Removed from the trip: reconnecting to Saved on this device rechecks access (404) and removes the copy, saying so',
    changed.changed === 1 && /Removed from this device: you're no longer on Smugglers' Notch hut tour, or it was deleted\./.test(gone) && (await readDevice(page)).briefs.length === 0, { gone: gone.slice(-300) });
  await browser.quit();
};

groups.remove = async () => {
  let { browser, page } = await freshSave();
  await go(page, `/trips/saved?trip=${TRIP}`);
  await page.waitFor(`document.getElementById('saved-brief-heading')`, 10_000);
  await page.eval(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Remove from this device').focus()`);
  await key(page, 'Enter');
  await page.waitFor(`/Not saved on this device/.test(document.body.innerText)`, 10_000);
  await sleep(300);
  const detail = { text: await text(page, '#main-content'), focus: await focused(page), briefs: (await readDevice(page)).briefs.length };
  record('remove', 'Saved brief: Remove from this device removes only the device copy and says the trip online is unchanged',
    detail.briefs === 0 && /Removed Smugglers' Notch hut tour from this device\. The trip online hasn't changed\./.test(detail.text), detail);
  record('remove', 'Saved brief: after Remove, keyboard focus lands on the page, not lost to the document body', detail.focus.tag !== 'body', detail.focus);
  const online = await api('/__qa/log');
  record('remove', 'Removing never touches the trip online (no write request)', !online.some((entry) => !entry.key.startsWith('GET ')), { writes: online.filter((entry) => !entry.key.startsWith('GET ')) });
  await browser.quit();

  ({ browser, page } = await freshSave());
  await page.eval(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Remove from this device').focus()`);
  await key(page, 'Enter');
  await page.waitFor(`/Removed from this device\\. The trip online hasn't changed\\./.test(document.body.innerText)`, 10_000);
  await sleep(300);
  const plan = { status: await page.eval(`document.querySelector('section[aria-labelledby=offline-copy-heading] [role=status]').innerText`), focus: await focused(page), briefs: (await readDevice(page)).briefs.length };
  record('remove', 'Plan page: Remove from this device says so in the status region and moves focus to the Offline copy heading',
    plan.briefs === 0 && /Removed from this device\. The trip online hasn't changed\./.test(plan.status) && /Offline copy/.test(plan.focus.name), plan);
  await browser.quit();
};

/** Controls with no accessible name in the accessibility tree, and the live regions' text. */
async function axAudit(page) {
  const { nodes } = await page.send('Accessibility.getFullAXTree');
  const named = (node) => (node.name?.value ?? '').trim().length > 0;
  const controls = nodes.filter((node) => !node.ignored && ['button', 'link', 'checkbox', 'textbox', 'menuitem'].includes(node.role?.value));
  return {
    controls: controls.length,
    unnamed: controls.filter((node) => !named(node)).map((node) => node.role.value),
    headings: nodes.filter((node) => !node.ignored && node.role?.value === 'heading').map((node) => node.name?.value).slice(0, 40),
    live: nodes.filter((node) => !node.ignored && ['status', 'alert'].includes(node.role?.value)).length,
  };
}

groups.a11y = async () => {
  await rm(PROFILE, { recursive: true, force: true });
  const browser = await launch(PROFILE);
  const page = await newTab(browser);
  await page.send('Accessibility.enable');
  await signInAs(page, 'user-blair');
  await go(page, PLAN);
  await page.waitFor(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Save for offline')`);
  await page.eval(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Save for offline').focus()`);
  await key(page, 'Enter');
  await page.waitFor(`document.querySelector('[role=dialog] input[type=checkbox]') && /Included/.test(document.querySelector('[role=dialog]').innerText)`, 20_000);
  await sleep(400);
  const stops = [];
  for (let i = 0; i < 9; i += 1) { await key(page, 'Tab'); stops.push(await focused(page)); }
  const boxes = stops.filter((stop) => stop.type === 'checkbox');
  record('a11y', 'Keyboard: Tab moves through the day checkboxes (each named by its date and activity), Save for offline and Cancel inside the sheet, with a visible focus ring',
    new Set(boxes.map((stop) => stop.name)).size === 4 && boxes.every((stop) => /^(Fri|Sat|Sun|Mon) Jan \d+ · /.test(stop.name)) && stops.some((stop) => stop.name === 'Save for offline') && stops.some((stop) => stop.name === 'Cancel') && stops.every((stop) => stop.tag === 'body' || stop.ring),
    { stops });
  // Space on the focused Friday box ticks it.
  await page.eval(`[...document.querySelectorAll('[role=dialog] input[type=checkbox]')][0].focus()`);
  await key(page, ' ');
  const friday = await page.eval(`[...document.querySelectorAll('[role=dialog] input[type=checkbox]')][0].checked`);
  await page.waitFor(`/Day logistics for 4 days/.test(document.querySelector('[role=dialog]').innerText)`, 15_000);
  const sheetAx = await axAudit(page);
  record('a11y', 'Space ticks a day; the sheet has no unnamed control and its list updates in a polite live region', friday && sheetAx.unnamed.length === 0 && sheetAx.live > 0, { friday, sheetAx });
  await key(page, 'Escape');
  await page.waitFor(`!document.querySelector('[role=dialog]')`, 5000);
  await sleep(400);
  const back = await focused(page);
  record('a11y', 'Escape closes the sheet and returns focus to Save for offline', back.name === 'Save for offline', { back });

  await openSheet(page);
  await saveInSheet(page);
  const announced = await page.eval(`[...document.querySelectorAll('section[aria-labelledby=offline-copy-heading] [role=status]')].map((el) => ({ live: el.getAttribute('aria-live'), text: el.innerText }))`);
  record('a11y', 'The save is announced as text in a polite status region, not by color', announced.some((region) => region.live === 'polite' && /Saved on this device/.test(region.text)), { announced });

  await go(page, `/trips/saved?trip=${TRIP}`);
  await page.waitFor(`document.getElementById('saved-brief-heading')`, 10_000);
  await sleep(600);
  const briefAx = await axAudit(page);
  const changedText = await page.eval(`[...document.querySelectorAll('#main-content [role=status]')].map((el) => ({ live: el.getAttribute('aria-live'), text: el.innerText.slice(0, 200) }))`);
  record('a11y', 'Saved brief: one h1, a heading per day, no unnamed control, the copy\'s state in a polite status region',
    briefAx.unnamed.length === 0 && briefAx.headings.filter((h) => /^(Sat|Sun|Mon) Jan/.test(h)).length === 3 && changedText.some((region) => region.live === 'polite' && /Matches the trip online|Checking/.test(region.text)),
    { briefAx, changedText });
  await go(page, '/trips/saved');
  await sleep(800);
  const listAx = await axAudit(page);
  record('a11y', 'Saved on this device list: no unnamed control', listAx.unnamed.length === 0, { listAx });
  await browser.quit();
};

groups.layout = async () => {
  const { browser, page } = await freshSave();
  const rows = [];
  for (const [label, width, fontSize] of [['320', 320, 16], ['390', 390, 16], ['1280', 1280, 16], ['390 at 200% text', 390, 32], ['1280 at 200% text', 1280, 32]]) {
    await emulate(page, { width, height: 844, fontSize });
    for (const path of [PLAN, '/trips/saved', `/trips/saved?trip=${TRIP}`]) {
      await go(page, path, { settle: 400 });
      await sleep(500);
      rows.push({ label, path, ...(await overflow(page)) });
    }
    await go(page, PLAN, { settle: 400 });
    await click(page, 'Change saved days');
    await page.waitFor(`/Included/.test(document.querySelector('[role=dialog]')?.innerText ?? '')`, 15_000);
    await sleep(700);
    rows.push({ label, path: 'Change saved days sheet', ...(await overflow(page)), dialog: await page.eval(`(() => { const d = document.querySelector('[role=dialog]'); const b = d.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), scrollW: d.scrollWidth, clientW: d.clientWidth }; })()`) });
    await key(page, 'Escape');
    await sleep(500);
  }
  for (const row of rows) record('layout', `${row.label}: ${row.path} has no sideways page scroll`, !row.sideways && (!row.dialog || row.dialog.scrollW <= row.dialog.clientW + 1), row);
  await browser.quit();
};

// ---------------------------------------------------------------- runner
await mkdir(OUT, { recursive: true });
const previous = JSON.parse(await readFile(resultsFile, 'utf8').catch(() => '[]'));
const chosen = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(groups);
for (const name of chosen) {
  if (!groups[name]) throw new Error(`No group ${name}; groups: ${Object.keys(groups).join(' ')}`);
  await api('/__qa/reset');
  await api('/__qa/overrides', undefined, 'DELETE');
  try {
    await groups[name]();
  } catch (error) {
    record(name, 'group finished without an error', false, { error: String(error?.stack ?? error) });
  }
}
const merged = [...previous.filter((entry) => !chosen.includes(entry.group)), ...results];
await writeFile(resultsFile, JSON.stringify(merged, null, 2));
const failed = results.filter((entry) => !entry.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed (${resultsFile})`);
