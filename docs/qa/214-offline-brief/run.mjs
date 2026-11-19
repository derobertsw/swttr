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
import { api, BASE, click, focused, go, key, launch, newTab, overflow, readDevice, readWorker, signInAs, sleep, text } from './browser.mjs';

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
  await click(page, 'Save for offline') || await click(page, 'Change saved days');
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
