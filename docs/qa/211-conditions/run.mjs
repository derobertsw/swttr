// Headless Chrome checks for #211 (conditions sources and reviews), driven
// over the DevTools protocol with #337's helpers (../337-group-planning/cdp.mjs),
// against the worktree's Next server with shim.patch applied and api.mjs
// serving the fixture trips. See README.md's "Re-running".
//
//   BASE=http://localhost:3431 API=http://127.0.0.1:34312 CDP_PORT=39431 OUT=/tmp/qa211 \
//     node docs/qa/211-conditions/run.mjs [group ...]
//
// Groups run in order on one fixture database (each journey builds on the
// last): organizer, review, crew, changes, reuse, copy, centers, recovery,
// failures, access, keyboard, layout (default: all). Results go to
// OUT/results.json, screenshots to OUT/*.png.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Cdp, emulate, key, newPage, sleep, tab, visit } from '../337-group-planning/cdp.mjs';
import { CANADA, DATES, DAYS, TOUR, VIEWERS } from './fixtures.mjs';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = Number(process.env.CDP_PORT ?? 39431);
/**
 * Headless Chrome that can reach only this machine: a source opened in a new
 * tab, Clerk's script and fonts all fail to resolve, so no check reaches a real site.
 */
async function launch() {
  const profile = resolve(process.env.PROFILE ?? join(OUT, 'chrome'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    'about:blank'], { stdio: 'ignore' });
  let version;
  for (let attempt = 0; attempt < 80 && !version; attempt += 1) {
    version = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json()).catch(() => null);
    if (!version) await sleep(250);
  }
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  return { cdp, version, close: async () => { chrome.kill(); await sleep(300); } };
}

const BASE = process.env.BASE ?? 'http://localhost:3431';
const API = process.env.API ?? 'http://127.0.0.1:34312';
const OUT = resolve(process.env.OUT ?? '/tmp/qa211');
const ALL = ['organizer', 'review', 'crew', 'changes', 'reuse', 'copy', 'centers', 'recovery', 'failures', 'access', 'keyboard', 'layout'];
const groups = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const results = [];
function check(group, name, pass, evidence) {
  results.push({ group, name, pass: !!pass, evidence });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${group}] ${name}${pass ? '' : `\n     ${JSON.stringify(evidence).slice(0, 600)}`}\n`);
}

// ------------------------------------------------------------- fixture API
const qa = (path, body, method = body === undefined ? 'GET' : 'POST') =>
  fetch(`${API}/__qa/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }).then((r) => r.json());
const sql = (query) => qa('sql', query);
/** The app's own API as `viewer`, the way another device or session would call it. */
async function as(viewer, method, path, body) {
  const response = await fetch(`${API}/api/v1/trips/${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-qa211-viewer': viewer }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const trip = async (viewer = VIEWERS.organizer, id = TOUR) => (await as(viewer, 'GET', id)).body;
/** Requests the browser sent since `since` (an index into the API log), as "METHOD path". */
async function sentSince(since, filter = () => true) {
  return (await qa('log')).slice(since).filter(filter);
}
const logLength = async () => (await qa('log')).length;
const writes = (entries) => entries.filter((entry) => !entry.key.startsWith('GET '));

// ------------------------------------------------------------- page helpers
/** Installed in each page: finding and using controls the way a person names them. */
const HELPERS = `window.qa = {
  name(el) { return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\\s+/g, ' ').trim(); },
  shown(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true }); },
  scope() { return document.querySelector('[role=dialog]') ?? document; },
  button(name, scope = qa.scope()) { return [...scope.querySelectorAll('button, a[href], summary')].find((el) => qa.shown(el) && (qa.name(el) === name || el.textContent.trim() === name)); },
  click(name, scope) { const el = qa.button(name, scope); if (!el) throw new Error('No control named ' + name); el.click(); return true; },
  field(label, scope = qa.scope()) {
    const found = [...scope.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(label));
    return found ? (found.querySelector('input, textarea, select') ?? document.getElementById(found.htmlFor)) : null;
  },
  set(label, value, scope) {
    const el = qa.field(label, scope);
    if (!el) throw new Error('No field ' + label);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    return true;
  },
  section() { return document.getElementById('conditions-heading')?.closest('section') ?? null; },
  text(el = qa.section()) { return (el?.innerText ?? '').replace(/[ \\t]+/g, ' '); },
  dialogText() { return document.querySelector('[role=dialog]')?.innerText ?? ''; },
  status() { return qa.section()?.querySelector('[aria-live=polite]')?.textContent ?? ''; },
  row(name) { return [...(qa.section()?.querySelectorAll('li') ?? [])].find((li) => li.querySelector('p.font-semibold')?.textContent === name) ?? null; },
  tick(text, scope = qa.scope()) {
    const label = [...scope.querySelectorAll('label')].find((l) => l.textContent.includes(text) && l.querySelector('input[type=checkbox], input[type=radio]'));
    if (!label) throw new Error('No checkbox ' + text);
    label.querySelector('input').click();
    return true;
  },
  buttons(scope = qa.scope()) { return [...scope.querySelectorAll('button')].filter(qa.shown).map(qa.name); },
};`;

async function open(page, viewer, path) {
  await page.send('Network.setCookie', { name: 'qa211_viewer', value: viewer, url: BASE });
  await visit(page, path);
  await page.eval(HELPERS);
  await page.waitFor(`document.getElementById('conditions-heading') || document.body.innerText.includes('Not found')`, 30_000);
}
const day = (date, id = TOUR) => `/trips/${id}/days/${date}`;
const evalIn = (page, expression) => page.eval(`(() => { ${expression} })()`);
const closed = (page) => page.waitFor(`!document.querySelector('[role=dialog]')`, 15_000);
/** A PNG of the page (or just the viewport), kept for the record; a slow capture is skipped, not a failure. */
async function shot(page, name, full = true) {
  try {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    await writeFile(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  } catch (error) { process.stdout.write(`  (no screenshot ${name}: ${error.message})\n`); }
}

// ------------------------------------------------------------- journeys
const MWAC = 'Mount Washington Avalanche Center';
const WEATHER = 'Summit weather desk';
const WEATHER_RENAMED = 'Summit weather desk (higher summits)';
const ACCESS = 'Forest road status';

async function organizer(page) {
  const g = 'organizer';
  await open(page, VIEWERS.organizer, day(DATES.fri));
  const empty = await page.eval('qa.text()');
  check(g, 'An empty day asks the organizer to add or check an official source', empty.includes('No sources yet. Add or check an official source'), empty.slice(0, 300));

  // From the verified list: it fills the name and link, and saves nothing by itself.
  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  let since = await logLength();
  await page.eval(`qa.click('Choose an official center')`);
  await page.waitFor(`qa.dialogText().includes('Suggested for this day')`);
  const picker = await page.eval('qa.dialogText()');
  check(g, 'A U.S. day gets no suggestion, and the picker says SWTTR doesn\'t suggest U.S. centers',
    picker.includes("don't include this day's access point today") && picker.includes("SWTTR doesn't suggest U.S. centers"), picker.slice(0, 600));
  await page.eval(`qa.set('Official center', 'mwac')`);
  const filled = await page.eval(`({ name: qa.field('Source name').value, url: qa.field('Link').value, area: qa.field('Area or region').value,
    said: document.querySelector('[role=dialog] [aria-live=polite]')?.textContent })`);
  let sent = writes(await sentSince(since));
  check(g, 'Choosing a center fills only the name and link, and saves nothing', filled.name === MWAC
    && filled.url === 'https://www.mountwashingtonavalanchecenter.org/forecasts/' && filled.area === '' && sent.length === 0, { filled, sent });
  await page.eval(`qa.set('Area or region', 'Presidential Range')`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.status().includes('Source added.')`);
  const row = await page.eval(`(() => { const r = qa.row(${JSON.stringify(MWAC)}); const a = r?.querySelector('a[href]'); return r && { text: r.innerText, href: a?.getAttribute('href'), link: a?.textContent, target: a?.target, rel: a?.rel }; })()`);
  check(g, 'The row shows type and area, Open forecast in a new tab, unknown validity and that the organizer added it', row
    && row.text.includes('Avalanche forecast · Presidential Range') && row.link === 'Open forecast (new tab)' && row.target === '_blank'
    && row.rel === 'noopener noreferrer' && row.href === filled.url && row.text.includes('Validity not available in SWTTR — check the source.')
    && row.text.includes('Added by the organizer'), row);

  // A custom weather source.
  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.set('Type', 'weather'); qa.set('Source name', ${JSON.stringify(WEATHER)}); qa.set('Area or region', 'Presidential Range'); qa.set('Link', 'https://example.org/summit-forecast')`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.row(${JSON.stringify(WEATHER)})`);

  // An invalid link: the server refuses it, focus goes to Link and the typed source stays.
  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.set('Type', 'access'); qa.set('Source name', ${JSON.stringify(ACCESS)}); qa.set('Link', 'ftp://example.org/roads')`);
  since = await logLength();
  await page.eval(`qa.click('Save source')`);
  await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`);
  await sleep(300);
  const invalid = await page.eval(`({ alert: document.querySelector('[role=dialog] [role=alert]').textContent, focused: document.activeElement === qa.field('Link'),
    invalid: qa.field('Link').getAttribute('aria-invalid'), described: qa.field('Link').getAttribute('aria-describedby'), name: qa.field('Source name').value })`);
  sent = writes(await sentSince(since));
  check(g, 'An invalid link is refused by the server with focus on Link, and the typed source is kept', invalid.alert.includes('Use a complete http or https link')
    && invalid.focused && invalid.invalid === 'true' && invalid.described === 'conditions-source-error' && invalid.name === ACCESS && sent[0]?.status === 400, { invalid, sent });
  await page.eval(`qa.set('Link', 'https://example.org/road-status')`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.row(${JSON.stringify(ACCESS)})`);

  // Edit: a new name.
  await page.eval(`qa.click(${JSON.stringify(`Edit source ${WEATHER}`)})`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.set('Source name', ${JSON.stringify(WEATHER_RENAMED)})`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.status().includes('Source saved.') && qa.row(${JSON.stringify(WEATHER_RENAMED)})`);
  check(g, 'The organizer edits a source', true, await page.eval(`qa.status()`));

  // Remove from the day, after confirming; the source stays on the trip.
  await page.eval(`qa.click(${JSON.stringify(`Edit source ${ACCESS}`)})`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.click('Remove from this day')`);
  await page.waitFor(`qa.dialogText().includes('will no longer be listed for')`);
  const confirm = await page.eval('qa.dialogText()');
  await page.eval(`qa.click('Remove source')`);
  await closed(page);
  await page.waitFor(`qa.status().includes('Source removed from')`);
  const kept = await sql(`SELECT s.name, (SELECT count(*) FROM trip_day_conditions_sources a WHERE a.source_id = s.id) AS days FROM trip_conditions_sources s WHERE s.trip_id = '${TOUR}' ORDER BY s.created_at`);
  check(g, 'Removing a source from the day asks first, says its reviews are kept, and keeps the source on the trip',
    confirm.includes('Reviews already recorded for it are kept.') && !(await page.eval(`!!qa.row(${JSON.stringify(ACCESS)})`))
    && kept.some((source) => source.name === ACCESS && Number(source.days) === 0), { confirm: confirm.slice(0, 300), status: await page.eval('qa.status()'), kept });
  await shot(page, 'organizer-sources-1440');
}

/** Comes back to the tab an hour later, as after reading the source: the trip is read again (TripProvider). */
async function comeBack(page) {
  const before = (await qa('log')).filter((entry) => entry.key === `GET /api/v1/trips/${TOUR}` || entry.key === `GET /api/v1/trips/${CANADA}`).length;
  await page.eval(`(() => { const real = Date.now; Date.now = () => real() + 3_600_000; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); })()`);
  for (let i = 0; i < 60; i += 1) {
    if ((await qa('log')).filter((entry) => entry.key === `GET /api/v1/trips/${TOUR}` || entry.key === `GET /api/v1/trips/${CANADA}`).length > before) break;
    await sleep(250);
  }
  await sleep(800);
}

/** Records the viewer's own review with `note` from the row's button; returns the status said. */
async function record(page, source, note, mode = 'record') {
  const opener = { record: `Record my review of ${source}`, correct: `Edit note on my review of ${source}`, withdraw: `Withdraw review of ${source}` }[mode];
  await page.eval(`qa.click(${JSON.stringify(opener)})`);
  await page.waitFor(`document.querySelector('[role=dialog]')`);
  if (mode !== 'withdraw') {
    await page.waitFor(`qa.field('Note (optional)')`);
    await page.eval(`qa.set('Note (optional)', ${JSON.stringify(note)})`);
  }
  await page.eval(`qa.click(${JSON.stringify({ record: 'Save review', correct: 'Save note', withdraw: 'Withdraw review' }[mode])}, document.querySelector('[role=dialog]'))`);
  await closed(page);
  await page.waitFor(`qa.status()`);
  return page.eval('qa.status()');
}

async function review(page, browser) {
  const g = 'review';
  await open(page, VIEWERS.blair, day(DATES.fri));
  const view = await page.eval(`({ text: qa.text(), buttons: qa.buttons(qa.section()) })`);
  check(g, 'A member sees the sources without organizer actions', view.text.includes('Sources are managed by the organizer. You record your own reviews.')
    && !view.buttons.some((name) => /^(Add source|Add a saved source|Edit source|Use on other days)/.test(name)), view.buttons);
  check(g, 'The summary counts only the member\'s own reviews of the listed sources', view.text.includes('Your reviews: 0 of 2 recorded for Friday'), view.text.slice(0, 200));

  // Opening the link opens a new tab and records nothing, nor does coming back.
  const since = await logLength();
  const tabs = async () => (await browser.cdp.send('Target.getTargets')).targetInfos.filter((target) => target.type === 'page');
  const before = await tabs();
  // A real click (a script's click() on a new-tab link is a blocked popup).
  const at = await page.eval(`(() => { const a = qa.row(${JSON.stringify(MWAC)}).querySelector('a[href]'); a.scrollIntoView({ block: 'center' });
    const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  const opened = (await tabs()).filter((target) => !before.some((old) => old.targetId === target.targetId));
  for (const target of opened) await browser.cdp.send('Target.closeTarget', { targetId: target.targetId });
  await page.send('Page.bringToFront');
  await comeBack(page);
  const after = await sentSince(since);
  check(g, 'Opening a source opens it in a new tab and records nothing, and coming back records nothing',
    opened.length === 1 && opened[0].url.startsWith('https://www.mountwashingtonavalanchecenter.org/') && writes(after).length === 0
    && after.some((entry) => entry.key === `GET /api/v1/trips/${TOUR}`) && (await page.eval('qa.text()')).includes('Your reviews: 0 of 2'),
    { opened: opened.map((target) => target.url), requests: after.map((entry) => `${entry.key} ${entry.status}`) });

  // Record, with the status said in a live region that the open dialog doesn't hide.
  await page.eval(`qa.click(${JSON.stringify(`Record my review of ${MWAC}`)})`);
  await page.waitFor(`qa.field('Note (optional)')`);
  const form = await page.eval(`({ text: qa.dialogText(), hidden: !!qa.section().querySelector('[aria-live=polite]').closest('[aria-hidden=true], [inert]') })`);
  await page.eval(`(() => { const status = qa.section().querySelector('[aria-live=polite]'); window.__said = [];
    new MutationObserver(() => { if (status.textContent) window.__said.push({ text: status.textContent, hidden: !!status.closest('[aria-hidden=true], [inert]'), dialog: !!document.querySelector('[role=dialog]') }); })
      .observe(status, { childList: true, characterData: true, subtree: true }); })()`);
  await page.eval(`qa.set('Note (optional)', 'Considerable above treeline; checked the 6 AM update')`);
  await page.eval(`qa.click('Save review', document.querySelector('[role=dialog]'))`);
  await closed(page);
  await page.waitFor(`qa.status().includes('Review recorded.')`);
  const recorded = await page.eval(`({ row: qa.row(${JSON.stringify(MWAC)}).innerText, summary: qa.text(), said: window.__said, focus: qa.name(document.activeElement) })`);
  check(g, 'Record my review says opening the link records nothing, and records only on Save review', form.text.includes("Opening the link doesn't record anything."), form.text.slice(0, 300));
  check(g, 'The recorded review shows "You reviewed this source" with its time and note, and counts', /You reviewed this source \w{3} \w{3} \d+, \d+:\d\d [AP]M/.test(recorded.row)
    && recorded.row.includes('Your note: Considerable above treeline') && recorded.summary.includes('Your reviews: 1 of 2 recorded for Friday'), recorded);
  check(g, '"Review recorded." is said in a live region the open dialog leaves exposed, and focus returns to the button',
    !form.hidden && recorded.said.length > 0 && recorded.said.every((entry) => !entry.hidden) && recorded.focus === `Record my review of ${MWAC}`, { form: form.hidden, said: recorded.said, focus: recorded.focus });

  // Correct, withdraw and record again: each an attributed entry.
  const corrected = await record(page, MWAC, 'Considerable above treeline, moderate below', 'correct');
  const correctedRow = await page.eval(`qa.row(${JSON.stringify(MWAC)}).innerText`);
  const withdrawn = await record(page, MWAC, null, 'withdraw');
  const withdrawnRow = await page.eval(`qa.row(${JSON.stringify(MWAC)}).innerText`);
  const again = await record(page, MWAC, 'Rechecked after the update');
  await page.eval(`qa.click('Your review history', qa.row(${JSON.stringify(MWAC)}))`);
  await sleep(300);
  const history = await page.eval(`[...qa.row(${JSON.stringify(MWAC)}).querySelectorAll('details ol li')].filter(qa.shown).map((li) => li.textContent)`);
  const stored = await sql(`SELECT action, note, reviewed_at = first_value(reviewed_at) OVER (ORDER BY entry_number) AS kept_time FROM trip_conditions_reviews WHERE user_id = 'user-blair' AND trip_day_id = '${DAYS.fri}' ORDER BY entry_number`);
  check(g, 'A member corrects their note and withdraws their review', corrected === 'Note saved.' && correctedRow.includes('Your note: Considerable above treeline, moderate below')
    && withdrawn === 'Review withdrawn.' && /No review recorded for this day · You withdrew your review/.test(withdrawnRow), { corrected, correctedRow, withdrawn, withdrawnRow });
  check(g, 'History keeps every entry, newest first, and a correction or withdrawal keeps the review\'s time', again === 'Review recorded.'
    && history.length === 4 && /^Recorded a review/.test(history[0]) && /^Withdrew the review/.test(history[1]) && /^Corrected the note/.test(history[2]) && /^Recorded a review/.test(history[3])
    && stored.map((entry) => entry.action).join() === 'reviewed,corrected,withdrawn,reviewed' && stored[1].kept_time && stored[2].kept_time, { history, stored });
  await shot(page, 'member-review-history-1440');
}

async function crew(page) {
  const g = 'crew';
  // Casey records her own reviews; the organizer records one too.
  await open(page, VIEWERS.casey, day(DATES.fri));
  await record(page, MWAC, '');
  await record(page, WEATHER_RENAMED, 'Summit winds 60 mph by noon');
  await open(page, VIEWERS.organizer, day(DATES.fri));
  await record(page, WEATHER_RENAMED, '');
  const organizerView = await page.eval(`({ summary: qa.text(), crew: [...qa.row(${JSON.stringify(MWAC)}).querySelectorAll('details summary')].map((x) => x.textContent).find((x) => x.startsWith('Crew')) })`);

  await open(page, VIEWERS.blair, day(DATES.fri));
  const collapsed = await page.eval(`(() => { const d = [...qa.row(${JSON.stringify(MWAC)}).querySelectorAll('details')].find((x) => x.querySelector('summary').textContent.startsWith('Crew reviews')); return { summary: d.querySelector('summary').textContent, open: d.open, visible: d.querySelector('ul').checkVisibility() }; })()`);
  await page.eval(`qa.click('Crew reviews (1)', qa.row(${JSON.stringify(MWAC)}))`);
  await page.eval(`qa.click('Crew reviews (2)', qa.row(${JSON.stringify(WEATHER_RENAMED)}))`);
  await sleep(300);
  const blair = await page.eval(`({ mwac: qa.row(${JSON.stringify(MWAC)}).innerText, weather: qa.row(${JSON.stringify(WEATHER_RENAMED)}).innerText, summary: qa.text() })`);
  check(g, 'Crew reviews are collapsed under their own heading, apart from yours', collapsed.summary === 'Crew reviews (1)' && !collapsed.open && !collapsed.visible, collapsed);
  check(g, 'Each crew review is attributed and dated: "Casey recorded a review", "Organizer recorded a review"',
    /Casey recorded a review · \w{3} \w{3} \d+, \d+:\d\d [AP]M/.test(blair.mwac) && /Organizer recorded a review/.test(blair.weather)
    && blair.weather.includes('Summit winds 60 mph by noon'), blair);
  check(g, 'Another person\'s review doesn\'t count as yours', blair.summary.includes('Your reviews: 1 of 2 recorded for Friday')
    && blair.weather.includes('No review recorded for this day') && organizerView.summary.includes('Your reviews: 1 of 2') && organizerView.crew === 'Crew reviews (2)', { blair: blair.summary.slice(0, 160), organizerView });
  await open(page, VIEWERS.casey, day(DATES.fri));
  await page.eval(`qa.click('Crew reviews (1)', qa.row(${JSON.stringify(MWAC)}))`);
  await sleep(200);
  const casey = await page.eval(`qa.row(${JSON.stringify(MWAC)}).innerText`);
  check(g, 'Casey sees Blair\'s current review and note, with Blair\'s history on demand', casey.includes('Blair recorded a review') && casey.includes('Rechecked after the update')
    && casey.includes("Blair's review history") && casey.includes('You reviewed this source'), casey);
}

const PLAN_FIELDS = ['objective', 'route_url', 'return_time', 'return_day_offset', 'distance', 'distance_unit', 'ascent', 'ascent_unit', 'duration_minutes',
  'metrics_source', 'metrics_source_url', 'approach_notes', 'access_notes', 'access_url', 'backup_plan', 'checkin_notes', 'pickup_notes'];
/** The organizer changes Friday's tour plan from another device. */
async function changePlan(change, date = DATES.fri, dayId = DAYS.fri) {
  const plan = (await trip()).tour_plans.find((entry) => entry.trip_day_id === dayId);
  const fields = Object.fromEntries(PLAN_FIELDS.map((key) => [key, plan[key]]));
  return as(VIEWERS.organizer, 'PUT', `${TOUR}/days/${date}/tour-plan`, { plan: { ...fields, ...change }, day_id: dayId, expected_revision: plan.revision, mutation_id: randomUUID() });
}
const sourceNamed = async (name, viewer = VIEWERS.organizer) => (await trip(viewer)).conditions.find((entry) => entry.name === name && entry.date === DATES.fri);

async function changes(page) {
  const g = 'changes';
  // Cosmetic: day notes, the backup plan and a source's name.
  const notes = await as(VIEWERS.organizer, 'PUT', `${TOUR}/days/${DATES.fri}/notes`, { day_id: DAYS.fri, notes: 'Bring the group shelter.', expected: { notes: null } });
  const backup = await changePlan({ backup_plan: 'Lower snowfields if the bowl is loaded' });
  const weather = await sourceNamed(WEATHER_RENAMED);
  const rename = await as(VIEWERS.organizer, 'POST', `${TOUR}/days/${DATES.fri}/conditions`, { action: 'save', source_id: weather.id, expected_revision: weather.revision,
    day_id: DAYS.fri, mutation_id: randomUUID(), expected_days: [{ date: DATES.fri, day_id: DAYS.fri }],
    source: { category: weather.category, name: 'Summit weather desk', region: weather.region, url: weather.url } });
  await open(page, VIEWERS.blair, day(DATES.fri));
  const cosmetic = await page.eval(`({ mwac: qa.row(${JSON.stringify(MWAC)}).innerText, summary: qa.text() })`);
  check(g, 'Notes, the backup plan and a source\'s new name leave reviews as recorded', [notes, backup, rename].every((r) => r.status === 200)
    && cosmetic.mwac.includes('You reviewed this source') && !cosmetic.summary.includes('Plan changed'), { status: [notes.status, backup.status, rename.status], mwac: cosmetic.mwac.slice(0, 200) });

  // Relevant: the route's link.
  const route = await changePlan({ route_url: 'https://example.org/routes/tuckerman-lip' });
  await open(page, VIEWERS.blair, day(DATES.fri));
  const stale = await page.eval(`({ mwac: qa.row(${JSON.stringify(MWAC)}).innerText, summary: qa.text(), task: document.querySelector('a[href="#conditions-heading"]')?.textContent })`);
  check(g, 'A route change marks the review "Plan changed — review again" with its reason, and it stops counting', route.status === 200
    && stale.mwac.includes('Plan changed — review again') && stale.mwac.includes('Route changed') && /You reviewed it .*, before the change\./.test(stale.mwac)
    && stale.summary.includes('Your reviews: 0 of 2 recorded for Friday') && stale.task === 'Conditions · Your reviews: 0 of 2 recorded · 1 reviewed before the plan changed', stale);
  await shot(page, 'member-plan-changed-1440');
  await open(page, VIEWERS.casey, day(DATES.fri));
  await page.eval(`qa.click('Crew reviews (1)', qa.row(${JSON.stringify(MWAC)}))`);
  await sleep(200);
  const crewView = await page.eval(`qa.row(${JSON.stringify(MWAC)}).innerText`);
  const entries = await sql(`SELECT count(*)::int AS n FROM trip_conditions_reviews WHERE trip_day_id = '${DAYS.fri}'`);
  check(g, 'The crew sees it too, and every entry is kept', crewView.includes('Plan changed since · Route changed') && entries[0].n === 7, { crewView, entries });

  // A source's link: only that source's reviews.
  await open(page, VIEWERS.organizer, day(DATES.fri));
  await page.eval(`qa.click('Edit source Summit weather desk')`);
  await page.waitFor(`qa.field('Link')`);
  await page.eval(`qa.set('Link', 'https://example.org/summit-forecast/higher-summits')`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.status().includes('Source saved.')`);
  const organizerRow = await page.eval(`qa.row('Summit weather desk').innerText`);
  check(g, 'A new link marks that source\'s reviews "Source link changed"', organizerRow.includes('Plan changed — review again') && organizerRow.includes('Source link changed'), organizerRow.slice(0, 300));

  // Blair reviews again against the plan as it is now.
  await open(page, VIEWERS.blair, day(DATES.fri));
  const said = await record(page, MWAC, 'Rechecked with the new route');
  const fresh = await page.eval(`({ row: qa.row(${JSON.stringify(MWAC)}).innerText, summary: qa.text() })`);
  check(g, 'Recording again after a change clears "Plan changed" and keeps the history', said === 'Review recorded.' && fresh.row.includes('You reviewed this source')
    && !fresh.row.includes('Plan changed') && fresh.summary.includes('Your reviews: 1 of 2'), fresh.row.slice(0, 300));
}

async function reuse(page) {
  const g = 'reuse';
  await open(page, VIEWERS.organizer, day(DATES.fri));
  await page.eval(`qa.click(${JSON.stringify(`Use on other days: ${MWAC}`)})`);
  await page.waitFor(`qa.dialogText().includes('Already listed on 1 day.')`);
  await page.eval(`qa.tick('Sat, Jan 9')`);
  let since = await logLength();
  await page.eval(`qa.click('Review 1 day')`);
  await page.waitFor(`qa.dialogText().includes('Adds it to 1 day')`);
  const preview = await page.eval('qa.dialogText()');
  const sent = await sentSince(since);
  check(g, 'Use on other days previews the dates it adds and says reviews don\'t come along', preview.includes(`Lists ${MWAC} on Sat Jan 9.`)
    && preview.includes('Reviews stay with the day they were recorded for, so none come from other days.') && preview.includes('No review recorded for this day.')
    && sent.length === 1 && sent[0].body.includes('"preview":true'), { preview: preview.slice(0, 500), sent: sent.map((entry) => entry.body) });
  await page.eval(`qa.click('List on 1 day')`);
  await closed(page);
  await page.waitFor(`qa.status().includes('added to 1 day')`);
  await open(page, VIEWERS.blair, day(DATES.sat));
  const saturday = await page.eval(`({ row: qa.row(${JSON.stringify(MWAC)})?.innerText, summary: qa.text() })`);
  const entries = await sql(`SELECT count(*)::int AS n FROM trip_conditions_reviews WHERE trip_day_id = '${DAYS.sat}'`);
  check(g, 'The other day lists the source with "No review recorded for this day" and no reviews', saturday.row?.includes('No review recorded for this day')
    && !saturday.row.includes('Crew reviews') && saturday.summary.includes('Your reviews: 0 of 1 recorded for Saturday') && entries[0].n === 0, { saturday, entries });

  // Editing a reused source reviews the days first; Back to editing keeps the change, Discard saves nothing.
  await open(page, VIEWERS.organizer, day(DATES.fri));
  const revision = (await sourceNamed(MWAC)).revision;
  await page.eval(`qa.click(${JSON.stringify(`Edit source ${MWAC}`)})`);
  await page.waitFor(`qa.field('Link')`);
  await page.eval(`qa.set('Link', 'https://www.mountwashingtonavalanchecenter.org/forecasts/presidential-range')`);
  await page.eval(`qa.click('Save source')`);
  await page.waitFor(`qa.dialogText().includes('Days it changes')`);
  const edit = await page.eval(`({ text: qa.dialogText(), focus: document.activeElement?.textContent })`);
  await page.eval(`qa.click('Back to editing')`);
  await page.waitFor(`qa.field('Link')`);
  const keptLink = await page.eval(`qa.field('Link').value`);
  await page.eval(`qa.click('Cancel')`);
  await page.waitFor(`qa.dialogText().includes('Discard changes?')`);
  await page.eval(`qa.click('Discard changes')`);
  await closed(page);
  check(g, 'An edit to a source on two days previews both dates and the reviews to record again', edit.text.includes("Save on every day it's listed?")
    && edit.text.includes(`Your change to ${MWAC} applies to both days it's listed on: Fri Jan 8 and Sat Jan 9.`) && edit.text.includes('1 review to record again')
    && edit.focus === 'Days it changes' && keptLink.endsWith('/presidential-range') && (await sourceNamed(MWAC)).revision === revision, { edit, keptLink });
}

async function copy(page) {
  const g = 'copy';
  await open(page, VIEWERS.organizer, day(DATES.fri));
  await page.eval(`qa.click('Copy to other days', document)`);
  await page.waitFor(`[...document.querySelectorAll('label')].some((l) => l.textContent.includes('Also list its conditions sources'))`);
  await page.eval(`qa.tick('Sun, Jan 10', document); qa.tick('Also list its conditions sources', document)`);
  await page.eval(`qa.click('Review copy to 1 day', document)`);
  await page.waitFor(`document.body.innerText.includes('with no review recorded for this day: reviews stay on')`, 20_000);
  const review = await page.eval(`(document.querySelector('[role=dialog]') ?? document.querySelector('#main-content')).innerText`);
  const confirm = await page.eval(`qa.buttons().filter((name) => /^Copy/.test(name))`);
  check(g, 'Copy day\'s review says each copied source starts with no review on the new day', review.includes(`Lists ${MWAC} and Summit weather desk too, with no review recorded for this day: reviews stay on Fri Jan 8.`), { review: review.slice(0, 800), confirm });
  await page.eval(`qa.click(${JSON.stringify(confirm[0])})`);
  await page.waitFor(`!document.querySelector('[role=dialog]') && /Copied|copied/.test(document.body.innerText)`, 20_000);
  await open(page, VIEWERS.blair, day(DATES.sun));
  const sunday = await page.eval(`({ text: qa.text(), mwac: qa.row(${JSON.stringify(MWAC)})?.innerText, weather: qa.row('Summit weather desk')?.innerText })`);
  const entries = await sql(`SELECT count(*)::int AS n FROM trip_conditions_reviews WHERE trip_day_id = '${DAYS.sun}'`);
  check(g, 'A copied day lists the sources with "No review recorded for this day"', sunday.mwac?.includes('No review recorded for this day')
    && sunday.weather?.includes('No review recorded for this day') && !sunday.text.includes('Crew reviews') && entries[0].n === 0, { sunday, entries });
}

async function centers(page) {
  const g = 'centers';
  const canada = day(DATES.canada, CANADA);
  // Avalanche Canada down: the list still loads.
  await qa('overrides', { 'avalanche-canada': 'down' });
  await open(page, VIEWERS.organizer, canada);
  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.click('Choose an official center')`);
  await page.waitFor(`qa.dialogText().includes('Suggested for this day')`);
  const down = await page.eval(`({ text: qa.dialogText(), options: qa.field('Official center').options.length })`);
  check(g, 'With Avalanche Canada unavailable, the picker says so and still lists every verified center', down.text.includes("Suggestions aren't available right now. You can still choose a center from the list.")
    && down.options === 28, { text: down.text.slice(0, 400), options: down.options });
  await qa('overrides', undefined, 'DELETE');
  await page.eval(`qa.click('Cancel')`);
  await closed(page);

  // A suggestion inside a published area, shown with when it was checked, used only on confirmation.
  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  const since = await logLength();
  await page.eval(`qa.click('Choose an official center')`);
  await page.waitFor(`qa.dialogText().includes('forecast by Parks Canada')`);
  const suggestion = await page.eval('qa.dialogText()');
  check(g, 'The suggestion names the area that holds the day\'s access point today, when it was checked, and that areas change',
    suggestion.includes("Avalanche Canada's forecast areas put this day's access point in “Glacier” today, forecast by Parks Canada.")
    && /Checked \d+:\d\d [AP]M\. Forecast areas change through the season/.test(suggestion) && !/considerable|moderate|danger/i.test(suggestion), suggestion.slice(0, 700));
  await page.eval(`qa.click('Use Parks Canada avalanche forecast')`);
  await sleep(300);
  const used = await page.eval(`({ name: qa.field('Source name').value, url: qa.field('Link').value, area: qa.field('Area or region').value,
    said: document.querySelector('[role=dialog] [aria-live=polite]')?.textContent })`);
  const sent = await sentSince(since);
  check(g, 'Using a suggestion only fills the name and link; nothing is saved until Save source', used.name === 'Parks Canada avalanche forecast'
    && used.url === 'https://avalanche.ca/map' && used.area === '' && used.said === 'Filled in Parks Canada avalanche forecast. Check its map covers your route, then save the source.'
    && writes(sent).length === 0 && sent.some((entry) => entry.key.endsWith('/conditions/centers')), { used, sent: sent.map((entry) => entry.key) });
  await page.eval(`qa.click('Cancel')`);
  await page.waitFor(`qa.dialogText().includes('Discard changes?')`);
  await page.eval(`qa.click('Discard changes')`);
  await closed(page);
  check(g, 'Discarding a used suggestion leaves the day without a source', (await trip(VIEWERS.organizer, CANADA)).conditions.length === 0, null);

  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.click('Choose an official center')`);
  await page.waitFor(`qa.button('Use Parks Canada avalanche forecast')`);
  await page.eval(`qa.click('Use Parks Canada avalanche forecast'); qa.set('Area or region', 'Glacier National Park')`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.row('Parks Canada avalanche forecast')`);
  const saved = await page.eval(`qa.row('Parks Canada avalanche forecast').innerText`);
  check(g, 'A confirmed suggestion is an ordinary source: the organizer\'s area, and validity still unknown', saved.includes('Avalanche forecast · Glacier National Park')
    && saved.includes('Validity not available in SWTTR — check the source.') && saved.includes('Added by the organizer'), saved);
  await shot(page, 'organizer-canada-source-1440');
  const member = await as(VIEWERS.blair, 'GET', `${CANADA}/days/${DATES.canada}/conditions/centers`);
  check(g, 'Members can\'t load the center list (organizer only)', member.status === 403, member);
}

async function recovery(page) {
  const g = 'recovery';
  // A source removed from the day while the organizer edits it: Check the latest, then save it as a new source.
  await open(page, VIEWERS.organizer, day(DATES.fri));
  await page.eval(`qa.click('Edit source Summit weather desk')`);
  await page.waitFor(`qa.field('Area or region')`);
  await page.eval(`qa.set('Area or region', 'Presidential Range summits')`);
  const weather = await sourceNamed('Summit weather desk');
  const removed = await as(VIEWERS.organizer, 'POST', `${TOUR}/days/${DATES.fri}/conditions`, { action: 'remove', source_id: weather.id, expected_revision: weather.revision, day_id: DAYS.fri, mutation_id: randomUUID() });
  await page.eval(`qa.click('Save source')`);
  await page.waitFor(`qa.button('Check the latest')`);
  const conflict = await page.eval(`document.querySelector('[role=dialog] [role=alert]')?.textContent`);
  await page.eval(`qa.click('Check the latest')`);
  await page.waitFor(`qa.dialogText().includes('any more. Save to add yours as a new source.')`);
  const notice = await page.eval(`({ text: qa.dialogText(), area: qa.field('Area or region').value })`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.status().includes('Source added.')`);
  const sources = await sql(`SELECT name, region, (SELECT count(*)::int FROM trip_conditions_reviews r WHERE r.source_id = s.id) AS reviews FROM trip_conditions_sources s WHERE trip_id = '${TOUR}' AND name = 'Summit weather desk' ORDER BY created_at`);
  check(g, 'A source removed while it was being edited has a recovery path: Check the latest, then save it again as a new source', removed.status === 200
    && conflict === 'This day or its sources changed. Review them before saving again.' && notice.text.includes("This source isn't on Fri, Jan 8 any more. Save to add yours as a new source.")
    && notice.area === 'Presidential Range summits' && sources.length === 2 && sources[0].reviews === 2 && sources[1].reviews === 0, { conflict, notice: notice.text.slice(0, 300), sources });

  // A source removed while a member is recording a review of it.
  await open(page, VIEWERS.blair, day(DATES.sat));
  await page.eval(`qa.click(${JSON.stringify(`Record my review of ${MWAC}`)})`);
  await page.waitFor(`qa.field('Note (optional)')`);
  await page.eval(`qa.set('Note (optional)', 'Saturday check')`);
  const mwac = (await trip()).conditions.find((entry) => entry.name === MWAC && entry.date === DATES.sat);
  await as(VIEWERS.organizer, 'POST', `${TOUR}/days/${DATES.sat}/conditions`, { action: 'remove', source_id: mwac.id, expected_revision: mwac.revision, day_id: DAYS.sat, mutation_id: randomUUID() });
  await page.eval(`qa.click('Save review', document.querySelector('[role=dialog]'))`);
  await page.waitFor(`qa.button('Check the latest')`);
  await page.eval(`qa.click('Check the latest')`);
  await page.waitFor(`qa.dialogText().includes('any more, so there')`);
  const gone = await page.eval('qa.dialogText()');
  check(g, 'A source removed while a member records a review says so, with nothing recorded', gone.includes("This source isn't listed for Sat, Jan 9 any more, so there's nothing to record.")
    && (await sql(`SELECT count(*)::int AS n FROM trip_conditions_reviews WHERE trip_day_id = '${DAYS.sat}'`))[0].n === 0, gone.slice(0, 300));
  await page.eval(`qa.click('Cancel')`);
  await page.waitFor(`qa.dialogText().includes('Discard changes?') || !document.querySelector('[role=dialog]')`);
  if (await page.eval(`!!qa.button('Discard changes')`)) await page.eval(`qa.click('Discard changes')`);
  await closed(page);

  // The plan changes while Casey's form is open and she reads the source in another tab (this PR's fix).
  await open(page, VIEWERS.casey, day(DATES.fri));
  await page.eval(`qa.click(${JSON.stringify(`Record my review of ${MWAC}`)})`);
  await page.waitFor(`qa.field('Note (optional)')`);
  await page.eval(`qa.set('Note (optional)', 'Read it on my phone')`);
  await changePlan({ route_url: 'https://example.org/routes/tuckerman-right-gully' });
  const since = await logLength();
  await comeBack(page);
  await page.eval(`qa.click('Save review', document.querySelector('[role=dialog]'))`);
  await page.waitFor(`qa.button('Check the latest') || !document.querySelector('[role=dialog]')`);
  const refused = await page.eval(`({ alert: document.querySelector('[role=dialog] [role=alert]')?.textContent ?? null, note: qa.field('Note (optional)')?.value })`);
  if (refused.alert) {
    await page.eval(`qa.click('Check the latest')`);
    await page.waitFor(`qa.dialogText().includes('Check the source again; your note is still here.')`);
    await page.eval(`qa.click('Save review', document.querySelector('[role=dialog]'))`);
    await closed(page);
  }
  const reviews = (await sentSince(since)).filter((entry) => entry.key.endsWith('/conditions/reviews')).map((entry) => entry.status);
  check(g, 'Coming back to an open review form after the plan changed asks to check the latest, keeping the note, instead of recording the new plan',
    refused.alert?.includes('changed since you opened it') && refused.note === 'Read it on my phone' && reviews.join() === '409,200', { refused, reviews });
}

async function failures(page) {
  const g = 'failures';
  // The database fails once: the note and the day's state stay, and the retry reuses the save identity.
  await open(page, VIEWERS.blair, day(DATES.fri));
  const before = await page.eval(`({ row: qa.row('Summit weather desk').innerText, summary: qa.text().match(/Your reviews: .*/)?.[0] })`);
  await qa('overrides', { 'rpc:record_trip_conditions_review': { code: 'XX000', message: 'fixture failure', times: 1 } });
  const since = await logLength();
  await page.eval(`qa.click('Record my review of Summit weather desk')`);
  await page.waitFor(`qa.field('Note (optional)')`);
  await page.eval(`qa.set('Note (optional)', 'Checked the summit forecast at 6')`);
  await page.eval(`qa.click('Save review', document.querySelector('[role=dialog]'))`);
  await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`);
  const failed = await page.eval(`({ alert: document.querySelector('[role=dialog] [role=alert]').textContent, note: qa.field('Note (optional)').value,
    behind: qa.row('Summit weather desk').innerText, summary: qa.text() })`);
  check(g, 'A failed review save keeps the note and the prior state, and says to try again', failed.alert === "Couldn't save your review. Your note is still here; try again."
    && failed.note === 'Checked the summit forecast at 6' && failed.behind === before.row && failed.summary.includes(before.summary), { failed, before });
  await page.eval(`qa.click('Save review', document.querySelector('[role=dialog]'))`);
  await closed(page);
  await page.waitFor(`qa.status().includes('Review recorded.')`);
  const posts = (await sentSince(since)).filter((entry) => entry.key.endsWith('/conditions/reviews'));
  const ids = posts.map((entry) => JSON.parse(entry.body).mutation_id);
  const stored = await sql(`SELECT count(*)::int AS n FROM trip_conditions_reviews r JOIN trip_conditions_sources s ON s.id = r.source_id WHERE r.user_id = 'user-blair' AND s.name = 'Summit weather desk'`);
  check(g, 'The retry sends the same save identity and records one review', posts.map((entry) => entry.status).join() === '500,200' && ids[0] === ids[1] && stored[0].n === 1, { posts: posts.map((entry) => entry.status), ids, stored });

  // A 503 page instead of JSON while adding a source: the typed source stays.
  await open(page, VIEWERS.organizer, day(DATES.fri));
  await qa('overrides', { [`POST /api/v1/trips/${TOUR}/days/${DATES.fri}/conditions`]: { status: 503, times: 1 } });
  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.set('Type', 'access'); qa.set('Source name', 'Trailhead parking notices'); qa.set('Link', 'https://example.org/parking')`);
  await page.eval(`qa.click('Save source')`);
  await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`);
  const outage = await page.eval(`({ alert: document.querySelector('[role=dialog] [role=alert]').textContent, name: qa.field('Source name').value, url: qa.field('Link').value })`);
  await page.eval(`qa.click('Save source')`);
  await closed(page);
  await page.waitFor(`qa.row('Trailhead parking notices')`);
  check(g, 'A 503 page while adding a source keeps the typed source, and saving again adds it', outage.name === 'Trailhead parking notices' && outage.url === 'https://example.org/parking'
    && outage.alert.length > 0, outage);
}

async function access(page) {
  const g = 'access';
  const fri = `${TOUR}/days/${DATES.fri}`;
  const mwac = await sourceNamed(MWAC, VIEWERS.blair);
  const add = await as(VIEWERS.blair, 'POST', `${fri}/conditions`, { action: 'add', day_id: DAYS.fri, mutation_id: randomUUID(), source: { category: 'avalanche', name: 'Mine', url: 'https://example.org/mine' } });
  const edit = await as(VIEWERS.blair, 'POST', `${fri}/conditions`, { action: 'save', source_id: mwac.id, expected_revision: mwac.revision, day_id: DAYS.fri, mutation_id: randomUUID(), source: { category: 'avalanche', name: 'Renamed', url: mwac.url } });
  const remove = await as(VIEWERS.blair, 'POST', `${fri}/conditions`, { action: 'remove', source_id: mwac.id, expected_revision: mwac.revision, day_id: DAYS.fri, mutation_id: randomUUID() });
  check(g, 'Members can\'t add, edit or remove sources (403)', [add, edit, remove].every((r) => r.status === 403), [add, edit, remove]);

  // Nobody records for anyone else: a review is always the signed-in person's.
  const casey = mwac.reviews.find((entry) => entry.user_id === VIEWERS.casey);
  const withdrawCasey = await as(VIEWERS.blair, 'POST', `${fri}/conditions/reviews`, { action: 'withdraw', source_id: mwac.id, day_id: DAYS.fri, expected_entry_id: casey.current.id, mutation_id: randomUUID() });
  const asCasey = await as(VIEWERS.blair, 'POST', `${fri}/conditions/reviews`, { action: 'record', user_id: VIEWERS.casey, source_id: mwac.id, day_id: DAYS.fri,
    expected_entry_id: mwac.reviews.find((entry) => entry.user_id === VIEWERS.blair).current.id, context_key: mwac.context_key, note: 'for Casey', mutation_id: randomUUID() });
  const stored = await sql(`SELECT user_id, action FROM trip_conditions_reviews WHERE note = 'for Casey' OR id = '${casey.current.id}' ORDER BY entry_number`);
  const caseyLatest = await sql(`SELECT action FROM trip_conditions_reviews WHERE user_id = 'user-casey' AND source_id = '${mwac.id}' AND trip_day_id = '${DAYS.fri}' ORDER BY entry_number DESC LIMIT 1`);
  check(g, 'A member can\'t withdraw or record someone else\'s review: their own latest entry is checked, and a review is stored as theirs', withdrawCasey.status === 409
    && asCasey.status === 200 && stored.find((entry) => entry.action === 'reviewed' && entry.user_id === VIEWERS.blair) && caseyLatest[0].action === 'reviewed', { withdrawCasey, asCasey, stored, caseyLatest });

  // Not on the trip, and signed out.
  const outsider = await Promise.all([as(VIEWERS.outsider, 'GET', TOUR), as(VIEWERS.outsider, 'POST', `${fri}/conditions/reviews`,
    { action: 'record', source_id: mwac.id, day_id: DAYS.fri, expected_entry_id: null, context_key: mwac.context_key, mutation_id: randomUUID() })]);
  const signedOut = await fetch(`${API}/api/v1/trips/${TOUR}`).then((r) => r.status);
  await open(page, VIEWERS.outsider, day(DATES.fri));
  const page404 = await page.eval(`document.querySelector('#main-content')?.innerText ?? ''`);
  check(g, 'Someone not on the trip gets Not found, and nothing from it', outsider.every((r) => r.status === 404) && signedOut === 401
    && page404.includes('Not found') && !page404.includes(MWAC), { outsider: outsider.map((r) => r.status), signedOut, page: page404.slice(0, 200) });
}

// ------------------------------------------------------------- keyboard, names, layout
/** The focused element: its name, whether it's inside Conditions or a dialog, and whether focus is shown. */
const FOCUSED = `(() => { const el = document.activeElement; if (!el || el === document.body) return { body: true };
  const s = getComputedStyle(el), r = el.getBoundingClientRect();
  return { name: qa.name(el).slice(0, 80), tag: el.tagName.toLowerCase(), inSection: !!qa.section()?.contains(el), inDialog: !!el.closest('[role=dialog]'),
    shown: el.matches(':focus-visible') && ((s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1) || s.boxShadow !== 'none'),
    inView: r.bottom > 0 && r.top < innerHeight }; })()`;

/** Interactive nodes in the accessibility tree without a name. */
async function unnamed(page) {
  const { nodes } = await page.send('Accessibility.getFullAXTree');
  const roles = ['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'listbox', 'menuitem', 'switch', 'tab'];
  return nodes.filter((node) => !node.ignored && roles.includes(node.role?.value) && !(node.name?.value ?? '').trim()).map((node) => node.role.value);
}

async function keyboard(page) {
  const g = 'keyboard';
  await open(page, VIEWERS.blair, day(DATES.fri));
  await page.eval(`document.getElementById('conditions-heading').focus()`);
  const stops = [];
  for (let i = 0; i < 40; i += 1) {
    await tab(page);
    const state = await page.eval(FOCUSED);
    if (!state.inSection) break;
    stops.push(state);
  }
  const order = stops.map((stop) => stop.name);
  const dom = await page.eval(`[...qa.section().querySelectorAll('a[href], button, summary')].filter(qa.shown).map(qa.name)`);
  check(g, 'Tab moves through Conditions in reading order, each stop with visible focus', stops.length > 8 && order.join('|') === dom.join('|') && stops.every((stop) => stop.shown && stop.inView), { order, dom, hidden: stops.filter((stop) => !stop.shown) });

  // Open Record my review with Enter; Escape asks before discarding a note; focus comes back.
  const opener = 'Record my review of Trailhead parking notices';
  await page.eval(`qa.button(${JSON.stringify(opener)}).focus()`);
  await key(page, 'Enter', 'Enter', 13);
  await page.waitFor(`qa.field('Note (optional)')`);
  await sleep(400);
  const first = await page.eval(FOCUSED);
  const inside = [];
  for (let i = 0; i < 6; i += 1) { await tab(page); inside.push(await page.eval(FOCUSED)); }
  await page.eval(`qa.field('Note (optional)').focus()`);
  await page.send('Input.insertText', { text: 'Typed with the keyboard' });
  await key(page, 'Escape', 'Escape', 27);
  await page.waitFor(`qa.dialogText().includes('Discard changes?')`);
  const asked = await page.eval(`({ title: document.querySelector('[role=dialog] h2')?.textContent, focus: qa.name(document.activeElement) })`);
  await page.eval(`qa.click('Keep editing')`);
  await page.waitFor(`qa.field('Note (optional)')`);
  const kept = await page.eval(`qa.field('Note (optional)').value`);
  check(g, 'Enter opens the form with focus inside; Tab stays in the dialog; Escape asks before discarding the note', first.inDialog && inside.every((stop) => stop.inDialog && stop.shown)
    && asked.title === 'Discard changes?' && kept === 'Typed with the keyboard', { first, inside: inside.map((stop) => stop.name), asked, kept });

  // Save with the keyboard: Tab to Save review, Enter; the status is said and focus returns to the button.
  for (let i = 0; i < 8 && (await page.eval(`qa.name(document.activeElement)`)) !== 'Save review'; i += 1) await tab(page);
  await key(page, 'Enter', 'Enter', 13);
  await closed(page);
  await page.waitFor(`qa.status().includes('Review recorded.')`);
  await sleep(400);
  const back = await page.eval(FOCUSED);
  const live = await page.eval(`(() => { const s = qa.section().querySelector('[aria-live]'); return { live: s.getAttribute('aria-live'), text: s.textContent }; })()`);
  check(g, 'Saving from the keyboard says "Review recorded." politely and returns focus to Record my review', back.name === opener && back.shown && live.live === 'polite' && live.text === 'Review recorded.', { back, live });

  // Accessible names: the page, the source editor with the center list, and the review form.
  const names = { member: await unnamed(page) };
  await open(page, VIEWERS.organizer, day(DATES.fri));
  names.organizer = await unnamed(page);
  await page.eval(`qa.click('Add source')`);
  await page.waitFor(`qa.field('Source name')`);
  await page.eval(`qa.click('Choose an official center')`);
  await page.waitFor(`qa.field('Official center')`);
  names.editor = await unnamed(page);
  const labels = await page.eval(`['Type', 'Source name', 'Area or region (optional)', 'Link', 'Official center'].map((label) => !!qa.field(label))`);
  const described = await page.eval(`['name', 'region', 'url'].map((key) => document.getElementById(qa.scope().querySelector('[name=' + key + ']').getAttribute('aria-describedby'))?.textContent)`);
  await page.eval(`qa.click('Cancel')`);
  await closed(page);
  check(g, 'Every control has a name: fields are labelled and hints are read with them', Object.values(names).every((list) => list.length === 0) && labels.every(Boolean)
    && described.every(Boolean), { names, labels, described });
}

const LAYOUT = `(() => {
  const vw = document.documentElement.clientWidth;
  const scope = document.querySelector('[role=dialog]') ?? qa.section();
  const clippedBy = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return true; return false; };
  // A sheet is measured against its own edges: with the page wider than the screen, a drawer is as wide as the page.
  const sheet = scope.matches('[role=dialog]');
  const box = sheet ? scope.getBoundingClientRect() : { left: 0, right: vw };
  const past = [...scope.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1) && !clippedBy(el); })
    .map((el) => (el.tagName + ' ' + (el.textContent ?? '').trim().slice(0, 40)));
  // What makes the page itself wider than the screen, outermost first, for the record.
  const wide = [];
  for (const el of document.querySelectorAll('#main-content *, header *, nav *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 1 || clippedBy(el) || getComputedStyle(el).position === 'fixed' || wide.some((w) => w.node.contains(el))) continue;
    wide.push({ node: el, what: el.tagName + ' ' + (el.textContent ?? '').trim().slice(0, 40), right: Math.round(r.right), inConditions: !!qa.section()?.contains(el) });
  }
  const spilled = [...scope.querySelectorAll('a, button, label, span, p, h2, h3, li, summary, option')].filter((el) => qa.shown(el) && getComputedStyle(el).overflowX === 'visible'
    && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => el.textContent.trim().slice(0, 40));
  const small = [...scope.querySelectorAll('a[href], button, input, select, textarea, summary')].filter(qa.shown).map((el) => {
    const label = el.closest('label'); const r = (label && label.getBoundingClientRect().height > el.getBoundingClientRect().height ? label : el).getBoundingClientRect();
    return { name: qa.name(el).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((t) => t.w < 43.5 || t.h < 43.5);
  return { vw, page: document.documentElement.scrollWidth, wide: wide.map(({ node, ...rest }) => rest).slice(0, 8), scrollerWidth: scope.scrollWidth, scopeWidth: scope.clientWidth, past, spilled, small,
    root: getComputedStyle(document.documentElement).fontSize };
})()`;

async function layout(page) {
  const g = 'layout';
  const rows = [];
  for (const [width, fontSize] of [[320, 16], [390, 16], [1440, 16], [320, 32], [390, 32], [1440, 32]]) {
    await emulate(page, { width, height: width < 768 ? 800 : 1000, fontSize });
    for (const viewer of [VIEWERS.organizer, VIEWERS.blair]) {
      await open(page, viewer, day(DATES.fri));
      const section = await page.eval(LAYOUT);
      // The sheets: the review form, and for the organizer the source editor with the center list.
      await page.eval(`qa.click(${JSON.stringify(viewer === VIEWERS.blair ? 'Record my review of Trailhead parking notices' : 'Add source')})`);
      await page.waitFor(`qa.field(${JSON.stringify(viewer === VIEWERS.blair ? 'Note (optional)' : 'Source name')})`);
      if (viewer === VIEWERS.organizer) { await page.eval(`qa.click('Choose an official center')`); await page.waitFor(`qa.field('Official center')`); }
      await sleep(600);
      const sheet = await page.eval(LAYOUT);
      if (width !== 1440 && fontSize === 16) await shot(page, `${viewer === VIEWERS.blair ? 'member-review-sheet' : 'organizer-source-sheet'}-${width}`);
      await page.eval(`qa.click('Cancel')`);
      await closed(page);
      rows.push({ width, text: fontSize === 32 ? '200%' : '100%', viewer, section, sheet });
      if (fontSize === 16 && width === 390 && viewer === VIEWERS.blair) await shot(page, 'member-conditions-390');
      if (fontSize === 32 && width === 320 && viewer === VIEWERS.organizer) await shot(page, 'organizer-conditions-320-200pct');
    }
  }
  for (const row of rows) {
    const touch = row.width < 1280;
    const fits = (part, sheet) => part.past.length === 0 && part.spilled.length === 0 && (!sheet || part.scrollerWidth <= part.scopeWidth + 1);
    const targets = (part) => !touch || part.small.length === 0;
    check(g, `${row.width}px, ${row.text} text, ${row.viewer}: Conditions and its sheet fit without sideways scroll${touch ? ', with 44px targets' : ''}`,
      fits(row.section, false) && fits(row.sheet, true) && targets(row.section) && targets(row.sheet), { root: row.section.root, section: row.section, sheet: row.sheet });
    check(g, `${row.width}px, ${row.text} text, ${row.viewer}: the day page itself doesn't scroll sideways`, row.section.page <= row.section.vw,
      { page: row.section.page, vw: row.section.vw, wide: row.section.wide });
  }
  await emulate(page, { width: 1440, height: 1000 });
}

// ------------------------------------------------------------- main
const JOURNEYS = { organizer, review, crew, changes, reuse, copy, centers, recovery, failures, access, keyboard, layout };

async function main() {
  await mkdir(OUT, { recursive: true });
  if (groups.includes('organizer')) await qa('reset', {});
  const browser = await launch();
  const page = await newPage(browser.cdp);
  await emulate(page, { width: 1440, height: 1000 });
  try {
    for (const group of ALL.filter((name) => groups.includes(name))) {
      try { await JOURNEYS[group](page, browser); }
      catch (error) { check(group, `${group} journey ran to the end`, false, String(error?.stack ?? error).slice(0, 800)); await shot(page, `error-${group}`).catch(() => {}); }
      if (page.console.length) results.push({ group, console: [...page.console] });
    }
  } finally {
    await writeFile(join(OUT, 'results.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, chrome: browser.version.Browser, results }, null, 2));
    await browser.close();
  }
  const failed = results.filter((result) => result.pass === false).length;
  console.log(`\n${results.filter((result) => result.pass).length} passed, ${failed} failed. ${join(OUT, 'results.json')}`);
}
await main();
