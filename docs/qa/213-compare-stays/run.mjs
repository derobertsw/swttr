// CDP harness for the #213 browser checks. It drives headless Chrome against
// the worktree's Next server with shim.patch applied and api.mjs serving the
// fixture trips (see README.md), and writes results.json plus PNG captures to
// OUT. It reuses #337's DevTools client (docs/qa/337-group-planning/cdp.mjs).
//
//   BASE=http://localhost:3432 API=http://127.0.0.1:3492 CDP_PORT=9432 OUT=/tmp/qa213 \
//     node docs/qa/213-compare-stays/run.mjs [group ...]
//
// Groups: content, layout, text, a11y, journeys, use, shots (default: all).
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { api, BASE, Cdp, emulate, key, newPage, sleep, tab, visit } from '../337-group-planning/cdp.mjs';

const OUT = resolve(process.env.OUT ?? join(tmpdir(), 'qa213'));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9432);
const groups = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['content', 'layout', 'text', 'a11y', 'journeys', 'use', 'shots']);

const TRIP = 'qa213-weekend';
const ONE = 'qa213-one';
const VIEWERS = { organizer: 'user-alex', member: 'user-blair' };
const [FRI, SAT, SUN, MON] = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'];
const id = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OPT = { ridge: id('3c', 1), brook: id('3c', 2), long: id('3c', 3), hilltop: id('3c', 4), notch: id('3c', 5), town: id('3c', 6), gondola: id('3c', 7) };
const STAY = { pine: id('2b', 1), village: id('2b', 2), lodge: id('2b', 3) };
const c = (key) => `candidate:${OPT[key]}`, s = (key) => `stay:${STAY[key]}`;
const compareUrl = (trip, options = [], nights) => {
  const params = new URLSearchParams();
  if (options.length) params.set('options', options.join(','));
  if (nights) { params.set('first_night', nights[0]); params.set('checkout', nights[1]); }
  return `/trips/${trip}/stays/compare${params.size ? `?${params}` : ''}`;
};

/** The comparison states the layout, text and accessibility checks visit. */
const STATES = {
  // Two options and a booked stay, all known: the sums are compared.
  known: compareUrl(TRIP, [c('ridge'), s('pine'), c('brook')]),
  // The long name, a provider failure and no location: nothing is ranked.
  unknown: compareUrl(TRIP, [c('long'), c('hilltop'), c('notch')]),
  // A drive not updated for eight days, an approximate place, and the pre-trip night (Friday: No drive planned).
  stale: compareUrl(TRIP, [c('gondola'), c('town'), s('lodge')], ['2026-10-08', MON]),
  // One saved stay, no options.
  empty: compareUrl(ONE),
};

const results = { meta: {}, content: [], layout: [], text: [], a11y: [], journeys: [], use: [], shots: [] };
const save = () => writeFile(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const record = (group, name, pass, evidence) => {
  results[group].push({ name, pass, ...evidence });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${group}: ${name}\n`);
};

async function openBrowser() {
  const profile = join(OUT, 'chrome');
  await rm(profile, { recursive: true, force: true });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let version;
  for (let attempt = 0; attempt < 60 && !version; attempt += 1) {
    version = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json()).catch(() => null);
    if (!version) await sleep(250);
  }
  if (!version) throw new Error(`Chrome didn't start on port ${CDP_PORT}`);
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  return { cdp, version, close: async () => { chrome.kill(); await sleep(300); } };
}

async function signIn(page, viewer) {
  await page.send('Network.setCookie', { name: 'qa213_viewer', value: viewer, url: BASE });
}

/** Loads the compare page and waits for the comparison (or the empty state) to settle. */
async function open(page, path) {
  await visit(page, path);
  await page.waitFor(`document.querySelector('#comparison-heading') && !document.querySelector('[role=status]')?.textContent.includes('Comparing')`, 20_000);
  await sleep(300);
}

const text = (selector = '#main-content') => `(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '')`;

// ------------------------------------------------------- in-page audits

/** Page overflow, what's past the right edge, text spilling out of its box, and which layout shows. */
function layoutAudit() {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`.slice(0, 100);
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || (r.right <= vw + 1 && r.left >= -1) || getComputedStyle(el).position === 'fixed') continue;
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) { clipped = true; break; }
    if (clipped || offenders.some((entry) => entry.node.contains(el))) continue;
    offenders.push({ node: el, el: describe(el), text: (el.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60), right: Math.round(r.right) });
  }
  const spilled = [...document.querySelectorAll('#main-content :is(a, button, label, span, p, h1, h2, h3, h4, li, th, td)')].filter((el) => visible(el)
    && getComputedStyle(el).overflowX === 'visible' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((el) => ({ el: describe(el), text: (el.innerText ?? '').slice(0, 60), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })).slice(0, 10);
  const table = [...document.querySelectorAll('#main-content table')].find(visible);
  const groups = [...document.querySelectorAll('#main-content [role=group]')].filter(visible);
  return {
    vw, scrollWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > vw,
    offenders: offenders.map(({ node, ...rest }) => rest).slice(0, 8), spilled, rootFontSize: getComputedStyle(document.documentElement).fontSize,
    layout: table ? 'table' : groups.length ? 'grouped' : 'none',
    // Phones: each day or figure, then every stay's named value beneath it.
    grouped: groups.map((group) => ({ heading: group.querySelector('h4')?.innerText, names: [...group.querySelectorAll('li > span:first-child > span:first-child')].map((el) => el.innerText.slice(0, 40)),
      shared: !group.querySelector('li') && group.innerText.includes('the same for every stay') })),
    // Wider: one column per stay, named in each table's heading.
    tables: [...document.querySelectorAll('#main-content table')].filter(visible).map((t) => ({
      headers: [...t.querySelectorAll('thead th')].map((th) => th.querySelector('span')?.innerText.slice(0, 40)),
      columns: [...t.querySelectorAll('thead th')].map((th) => Math.round(th.getBoundingClientRect().left)),
      rows: [...t.querySelectorAll('tbody tr')].filter((tr) => tr.querySelectorAll('td').length > 1).slice(0, 3).map((tr) => [...tr.querySelectorAll('td')].map((td) => Math.round(td.getBoundingClientRect().left))),
    })),
    map: !!document.querySelector('.maplibregl-map, canvas'),
  };
}

/** What has focus, and whether it's shown and in view. */
function focusState() {
  const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  const r = el.getBoundingClientRect(), st = getComputedStyle(el);
  const shown = el.matches(':focus-visible') && ((st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) >= 1) || st.boxShadow !== 'none');
  const name = (el.getAttribute('aria-label') ?? el.closest('label')?.innerText ?? el.innerText ?? el.value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return { tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), name, shown, inView: r.bottom > 0 && r.top < innerHeight && r.width > 0, inMain: !!el.closest('#main-content'), dialog: !!el.closest('[role=dialog]') };
}

async function axSummary(page) {
  const { nodes } = await page.send('Accessibility.getFullAXTree');
  const live = (node) => !node.ignored;
  const interactive = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'spinbutton']);
  const controls = nodes.filter((node) => live(node) && interactive.has(node.role?.value));
  const property = (node, name) => node.properties?.find((entry) => entry.name === name)?.value?.value;
  return {
    controls: controls.length,
    unnamed: controls.filter((node) => !String(node.name?.value ?? '').trim()).map((node) => node.role.value),
    checkboxes: controls.filter((node) => node.role.value === 'checkbox').map((node) => `${node.name?.value}${property(node, 'checked') === 'true' ? ' [checked]' : ''}${property(node, 'disabled') ? ' [disabled]' : ''}`),
    headings: nodes.filter((node) => live(node) && node.role?.value === 'heading').map((node) => `${property(node, 'level')}:${String(node.name?.value ?? '').slice(0, 60)}`),
    groups: nodes.filter((node) => live(node) && node.role?.value === 'group' && node.name?.value).map((node) => node.name.value),
    tables: nodes.filter((node) => live(node) && node.role?.value === 'table').map((node) => node.name?.value),
    live: nodes.filter((node) => live(node) && (property(node, 'live') || ['status', 'alert'].includes(node.role?.value))).map((node) => `${node.role?.value}:${property(node, 'live') ?? ''}:${String(node.name?.value ?? '').slice(0, 60)}`),
  };
}

async function traverse(page, limit = 120) {
  await page.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
  const stops = [];
  for (let index = 0; index < limit; index += 1) {
    await tab(page);
    const state = await page.run(focusState);
    if (state.body || (stops.length > 3 && stops[0].name === state.name && stops[0].tag === state.tag)) break;
    stops.push(state);
  }
  return {
    stops: stops.length, hidden: stops.filter((stop) => !stop.shown).map((stop) => `${stop.tag}:${stop.name}`),
    outOfView: stops.filter((stop) => !stop.inView).map((stop) => `${stop.tag}:${stop.name}`),
    order: stops.filter((stop) => stop.inMain).map((stop) => `${stop.tag}${stop.type ? `[${stop.type}]` : ''}:${stop.name}`),
  };
}

async function shot(page, name, { width, fontSize = 16, full = true } = {}) {
  await emulate(page, { width, dpr: 2, fontSize });
  await sleep(250);
  if (full) await emulate(page, { width, height: Math.min(await page.eval('document.documentElement.scrollHeight'), 6000), dpr: 2, fontSize });
  await sleep(400);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(data, 'base64'));
  results.shots.push({ name, width, fontSize, file });
  await emulate(page, { width, fontSize });
}

// ------------------------------------------------------------ checks

/** Strings each state must show (and must not), read from the rendered page at a phone and a desktop width. */
const EXPECT = {
  known: {
    has: ['Fri Oct 9 → Mon Oct 12 · 3 nights', 'Mornings compared: Sat Oct 10, Sun Oct 11 and Mon Oct 12 (check-out)',
      'Night of Fri Oct 9: Pine rental (3) · Village hotel (2) · Booked: Pine rental', 'Night of Sun Oct 11: Mountain lodge · Booked: Mountain lodge',
      'Sum of planned outbound drives', 'One way, each morning compared, repeat visits counted. Not total trip travel.', "Return drives aren't included.",
      "Same access point as Sat Oct 10. Each day's drive counts.", 'Shortest that morning', 'Its longest drive', '1 hr 10 min · Sun Oct 11 to Smuggs lot',
      'Pine rental has the lowest sum of planned outbound drives, 1 hr 9 min. Ridge chalet: 21 min more. Brook inn: 1 min more.',
      'Chosen for 2 of these 3 nights · 4 people', "Option you're considering · Not chosen for any nights", 'No booking recorded', 'Booked',
      "Its dates don't include the night of Sun Oct 11.", "Its nights don't include the night of Sun Oct 11.",
      'Estimated lodging cost', "Not a live price; fees and availability aren't checked.", 'About $1,260 total for Fri Oct 9 → Mon Oct 12 · 3 nights',
      'About CA$900.50 total for Fri Oct 9 → Sun Oct 11 · 2 nights', 'Its estimate is for other nights than these.', "Costs are in different currencies, so they aren't compared.",
      'All 3 drives known'],
    not: [/\bbest\b/i, /\bscore\b/i, /(?<!Not )total trip travel/i, /round trip/i],
  },
  unknown: {
    has: ['Drive estimate unavailable', 'Try again later', 'Location needed', 'Set its location to compare drives', 'Location needed for drive times',
      'Not totaled: 3 drives aren\'t known', '0 of 3 drives known', 'None known yet',
      "Sums aren't compared until every drive is known. Not known yet: Hilltop barn (3 drives) and Notch cabin (no location). A missing drive never counts as zero.",
      'The Very Long Name Of A Mountainside Chalet'],
    not: ['Shortest that morning', 'lowest sum', /\bbest\b/i, /0 min\b/],
  },
  stale: {
    has: ['Thu Oct 8 → Mon Oct 12 · 4 nights', 'Mornings compared: Fri Oct 9, Sat Oct 10, Sun Oct 11 and Mon Oct 12 (check-out)',
      'No drive planned · the same for every stay', 'Not updated: calculated 8 days ago, and checking again failed', 'Approximate location',
      'Choose the exact property for drive times', 'Approximate area · choose the exact property for drive times', 'Night of Thu Oct 8: Not planned yet',
      'Chosen for 1 of these 4 nights · 6 people', 'Nights not set'],
    not: ['Shortest that morning', 'lowest sum'],
  },
};

async function contentChecks(page) {
  await signIn(page, VIEWERS.organizer);
  for (const [state, expect] of Object.entries(EXPECT)) {
    for (const width of [390, 1440]) {
      await emulate(page, { width });
      await open(page, STATES[state]);
      const shown = await page.eval(text());
      const missing = expect.has.filter((needle) => !shown.includes(needle));
      const unwanted = expect.not.filter((needle) => typeof needle === 'string' ? shown.includes(needle) : needle.test(shown)).map(String);
      record('content', `${state} at ${width}px`, !missing.length && !unwanted.length && !page.console.length, { state, width, missing, unwanted, console: [...page.console] });
    }
  }
  // The empty state, for the organizer and a member.
  for (const [role, viewer] of Object.entries(VIEWERS)) {
    await signIn(page, viewer);
    await emulate(page, { width: 390 });
    await open(page, STATES.empty);
    const shown = await page.eval(text());
    const add = await page.eval(`[...document.querySelectorAll('#main-content button')].map((b) => b.innerText.trim()).filter((t) => t.startsWith('Add'))`);
    const requests = (JSON.parse(await api('/__qa/log', undefined, 'GET'))).filter((entry) => entry.key.endsWith('/stay-candidates/compare') && entry.key.includes(ONE)).length;
    const expected = role === 'organizer'
      ? shown.includes('Choose two or three stays to compare.') && shown.includes('A comparison puts each stay') && add.includes('Add another stay')
      : shown.includes('The organizer can add stays to compare.') && !add.length;
    record('content', `empty state (${role})`, expected && requests === 0, { role, add, compareRequests: requests, excerpt: shown.slice(shown.indexOf('Comparison'), shown.indexOf('Comparison') + 400) });
  }
  await save();
}

async function layoutChecks(page) {
  await signIn(page, VIEWERS.organizer);
  for (const [state, path] of Object.entries(STATES)) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await emulate(page, { width });
      await open(page, path);
      const audit = await page.run(layoutAudit);
      const options = state === 'empty' ? 0 : 3;
      // Every grouped row with values names all three stays; every table names them in its heading, columns aligned row to row.
      const groupedOk = audit.grouped.every((group) => group.shared || group.names.length === options);
      const tablesOk = audit.tables.every((t) => t.headers.length === options && t.rows.every((row) => row.every((left, index) => Math.abs(left - t.columns[index]) <= 1)));
      const pass = !audit.overflow && !audit.spilled.length && !audit.map && (state === 'empty' || (groupedOk && tablesOk && audit.layout !== 'none'));
      record('layout', `${state} at ${width}px (${audit.layout})`, pass, { state, width, ...audit, groupedOk, tablesOk, console: [...page.console] });
    }
  }
  await save();
}

async function textChecks(page) {
  await signIn(page, VIEWERS.organizer);
  for (const state of ['known', 'unknown']) {
    for (const width of [320, 390, 1440]) {
      await emulate(page, { width, fontSize: 32 });
      await open(page, STATES[state]);
      const audit = await page.run(layoutAudit);
      record('text', `200% text, ${state} at ${width}px (${audit.layout})`, !audit.overflow && !audit.spilled.length, { state, width, ...audit });
    }
  }
  await emulate(page, { width: 390 });
  await save();
}

async function a11yChecks(page) {
  for (const [role, viewer] of Object.entries(VIEWERS)) {
    await signIn(page, viewer);
    for (const width of [390, 1440]) {
      await emulate(page, { width });
      await open(page, STATES.known);
      const ax = await axSummary(page);
      const keyboard = await traverse(page);
      const pass = !ax.unnamed.length && !keyboard.hidden.length && !keyboard.outOfView.length;
      record('a11y', `${role} at ${width}px: ${keyboard.stops} Tab stops`, pass, { role, width, ...ax, keyboard });
    }
  }
  await save();
}

/** What's chosen on the page: the checked stays in order, the nights and the address. */
const selection = (page) => page.eval(`({
  checked: [...document.querySelectorAll('#main-content input[type=checkbox]:checked')].map((box) => box.closest('label').innerText.split('\\n')[0]),
  first_night: document.querySelector('select[name=first_night]')?.value, checkout: document.querySelector('select[name=checkout]')?.value,
  address: location.pathname + location.search, scrollY: Math.round(scrollY),
})`);
const clickText = (page, selector, label) => page.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => node.innerText.trim() === ${JSON.stringify(label)} || node.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) return false; el.click(); return true; })()`);
const compareRequests = async () => JSON.parse(await api('/__qa/log', undefined, 'GET')).filter((entry) => entry.key.endsWith('/stay-candidates/compare')).length;

async function journeyChecks(page, cdp) {
  await signIn(page, VIEWERS.organizer);
  await cdp.send('Target.setDiscoverTargets', { discover: true });
  for (const width of [390, 1440]) {
    await api('/__qa/reset');
    await emulate(page, { width });
    await open(page, compareUrl(TRIP, [c('ridge'), s('pine')], [FRI, SUN]));

    // External link: the property page opens in a new tab; coming back keeps the selection, nights and scroll.
    await page.eval(`[...document.querySelectorAll('a[target=_blank]')].find((a) => a.getBoundingClientRect().width > 0).scrollIntoView({ block: 'center' })`);
    await sleep(300);
    const before = await selection(page);
    const requestsBefore = await compareRequests();
    const opened = new Promise((done) => { cdp.on((message) => { if (message.method === 'Target.targetCreated' && message.params.targetInfo.type === 'page' && message.params.targetInfo.url.includes('example.com')) done(message.params.targetInfo); }); setTimeout(() => done(null), 8000); });
    const link = await page.eval(`(() => { const a = [...document.querySelectorAll('a[target=_blank]')].find((node) => node.getBoundingClientRect().width > 0); a.click(); return { href: a.href, rel: a.rel, label: a.getAttribute('aria-label') }; })()`);
    const target = await opened;
    if (target) await cdp.send('Target.closeTarget', { targetId: target.targetId }).catch(() => undefined);
    await page.send('Page.bringToFront');
    await page.eval(`window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))`);
    await sleep(2000);
    const after = await selection(page);
    const requestsAfter = await compareRequests();
    record('journeys', `external link return at ${width}px`, !!target && JSON.stringify(before) === JSON.stringify(after) && link.rel.includes('noopener'),
      { width, link, newTab: target?.url ?? null, before, after, comparisonRequestsOnReturn: requestsAfter - requestsBefore });

    // Reload: the address keeps the selection and nights.
    await page.send('Page.reload');
    await open(page, after.address);
    const reloaded = await selection(page);
    record('journeys', `reload keeps the choice and nights at ${width}px`, JSON.stringify(reloaded.checked) === JSON.stringify(before.checked)
      && reloaded.first_night === FRI && reloaded.checkout === SUN, { width, reloaded });

    // Add a stay to compare: a sheet on the page; on save it joins the comparison as the third, and nothing else moves.
    await page.eval(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Add a stay to compare').scrollIntoView({ block: 'center' })`);
    await sleep(300);
    const beforeAdd = await selection(page);
    await clickText(page, 'button', 'Add a stay to compare');
    await page.waitFor(`document.querySelector('[role=dialog] input[name=name]')`);
    await sleep(500);
    const focusInSheet = await page.run(focusState);
    await page.eval(`document.querySelector('[role=dialog] input[name=name]').focus()`);
    await page.send('Input.insertText', { text: `Maple farmhouse ${width}` });
    await clickText(page, '[role=dialog] button', 'Save option');
    await page.waitFor(`document.querySelector('[aria-live=polite]')?.innerText.includes('saved')`, 15_000);
    await page.waitFor(`!document.querySelector('[role=dialog]')`, 8000);
    await sleep(1500);
    const afterAdd = await selection(page);
    const focusAfter = await page.run(focusState);
    const announced = await page.eval(`document.querySelector('[aria-live=polite]')?.innerText`);
    record('journeys', `add a stay and return at ${width}px`, afterAdd.checked.length === 3 && afterAdd.checked[2].startsWith(`Maple farmhouse ${width}`)
      && afterAdd.checked.slice(0, 2).join() === beforeAdd.checked.join() && afterAdd.first_night === FRI && afterAdd.checkout === SUN
      && Math.abs(afterAdd.scrollY - beforeAdd.scrollY) <= 40, { width, beforeAdd, afterAdd, focusInSheet, focusAfter, announced });
  }

  // A member compares, but can't add, change, remove or use.
  await api('/__qa/reset');
  await signIn(page, VIEWERS.member);
  await emulate(page, { width: 390 });
  await open(page, STATES.known);
  const buttons = await page.eval(`[...document.querySelectorAll('#main-content button')].map((b) => b.getAttribute('aria-label') ?? b.innerText.trim())`);
  const shown = await page.eval(text());
  record('journeys', 'member view', !buttons.some((name) => /^(Add|Change|Remove|Use)/.test(name)) && shown.includes('Options are managed by the organizer')
    && shown.includes('Sum of planned outbound drives'), { buttons });
  await save();
}

/** The saved plan in the fixture database: who's where each night, the stays' bookings, the options. */
async function savedPlan() {
  const tables = JSON.parse(await api(`/__qa/tables?trip=${TRIP}`, undefined, 'GET'));
  return {
    revision: tables.trips[0].lodging_revision,
    nights: tables.trip_member_lodging_nights.map((row) => `${row.member_id.slice(-1)}|${row.date}|${row.stay_id?.slice(-2) ?? row.status}`).sort(),
    bookings: Object.fromEntries(tables.trip_stays.map((stay) => [stay.name, stay.booking_status])),
    options: tables.trip_stay_candidates.map((row) => row.name),
  };
}
const sheetText = (page) => page.eval(`document.querySelector('[role=dialog]')?.innerText ?? ''`);

async function useChecks(page) {
  await signIn(page, VIEWERS.organizer);
  for (const width of [390, 1440]) {
    await api('/__qa/reset');
    await api('/__qa/overrides', undefined, 'DELETE');
    await emulate(page, { width });
    // The mid-trip move: Ridge chalet for all three nights, across the change from the rental and hotel to the lodge.
    await open(page, compareUrl(TRIP, [s('pine'), c('ridge')]));
    const plan = await savedPlan();
    await clickText(page, 'button', 'Use Ridge chalet for these nights');
    await page.waitFor(`document.querySelector('[role=dialog]')?.innerText.includes('What changes')`, 15_000);
    await sleep(400);
    // Open both disclosures: each night's people old → new, and the mornings after.
    await page.eval(`document.querySelectorAll('[role=dialog] details').forEach((d) => { d.open = true; })`);
    await sleep(200);
    const preview = await sheetText(page);
    const focusOnOpen = await page.run(focusState);
    const useDisabled = await page.eval(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.trim() === 'Use for these nights')?.disabled`);
    const wanted = [
      'Nothing changes until you confirm.', 'Who stays there', 'Move Alex, Blair and Dana from Pine rental to Ridge chalet for the nights of Fri Oct 9 and Sat Oct 10.',
      'Mountain lodge to Ridge chalet', "Nobody else's nights change.", 'Night of Fri Oct 9', 'Alex: Pine rental → Ridge chalet', 'Night of Sun Oct 11',
      'Alex: Mountain lodge → Ridge chalet', 'Eli: Village hotel → Ridge chalet', 'starts from Ridge chalet',
      'Pine rental and Mountain lodge stay booked: nothing is canceled. Change the booking on Stays once you\'ve changed the reservation.',
      'Ridge chalet becomes a saved stay for Fri Oct 9 → Mon Oct 12 · 3 nights, booking not confirmed. Your other options stay as they are.',
      'Replace their existing plans for Fri Oct 9, Sat Oct 10, Sun Oct 11',
    ];
    const missing = wanted.filter((needle) => !preview.includes(needle));
    record('use', `preview, old → new per night, at ${width}px`, !missing.length && useDisabled === true && !preview.includes('Village hotel stay') && !preview.includes('Village hotel and'),
      { width, missing, useDisabledUntilReplaceTicked: useDisabled, focusOnOpen, preview });
    const unchangedByPreview = JSON.stringify(await savedPlan()) === JSON.stringify(plan);

    // A conflicting save: the plan changed under the preview.
    await page.eval(`document.querySelector('[role=dialog] input[type=checkbox]:not([name=member_ids])').click()`);
    await sleep(200);
    await api('/__qa/overrides', { 'rpc:use_trip_stay_candidate': { code: 'PT409', message: 'fixture conflict', times: 1 } });
    await clickText(page, '[role=dialog] button', 'Replace those nights and use it');
    await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    const conflict = { alert: await page.eval(`document.querySelector('[role=dialog] [role=alert]').innerText`),
      buttons: await page.eval(`[...document.querySelectorAll('[role=dialog] button')].map((b) => b.innerText.trim()).filter(Boolean)`) };
    const afterConflict = await savedPlan();
    record('use', `conflicting save keeps the plan at ${width}px`, JSON.stringify(afterConflict) === JSON.stringify(plan) && conflict.buttons.includes('Review again')
      && unchangedByPreview, { width, ...conflict, unchangedByPreview, revision: afterConflict.revision });
    await clickText(page, '[role=dialog] button', 'Review again');
    await page.waitFor(`document.querySelector('[role=dialog]')?.innerText.includes('What changes') && !document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    const people = await page.eval(`[...document.querySelectorAll('[role=dialog] input[name=member_ids]:checked')].length`);

    // A failed save: the server errors; the preview, the people and the replacement stay as they were.
    await page.eval(`document.querySelector('[role=dialog] input[type=checkbox]:not([name=member_ids])').click()`);
    await api('/__qa/overrides', { [`POST /api/v1/trips/${TRIP}/stay-candidates/use`]: { status: 500, body: { error: "Couldn't save lodging. Your changes are still here; try again." }, times: 1 } });
    await clickText(page, '[role=dialog] button', 'Replace those nights and use it');
    await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    const failed = { alert: await page.eval(`document.querySelector('[role=dialog] [role=alert]').innerText`), sheet: await sheetText(page),
      replaceTicked: await page.eval(`document.querySelector('[role=dialog] input[type=checkbox]:not([name=member_ids])')?.checked`) };
    record('use', `failed save keeps the plan and the sheet at ${width}px`, JSON.stringify(await savedPlan()) === JSON.stringify(plan) && failed.replaceTicked === true
      && failed.sheet.includes('What changes') && people === 6, { width, alert: failed.alert, replaceTicked: failed.replaceTicked, peopleAfterReview: people });

    // The save: the option becomes the stay for these nights; bookings and other options stay as they were.
    await clickText(page, '[role=dialog] button', 'Replace those nights and use it');
    await page.waitFor(`!document.querySelector('[role=dialog]') && document.querySelector('[aria-live=polite]')?.innerText.includes('now the stay')`, 20_000);
    await page.waitFor(`document.querySelector('#comparison-heading') && document.querySelector('table, [role=group]') && !document.querySelector('[role=status]')`, 20_000);
    await sleep(1500);
    const saved = await savedPlan();
    const shown = await page.eval(text());
    const focusAfter = await page.run(focusState);
    const pageAfter = await selection(page);
    record('use', `save at ${width}px`, saved.bookings['Pine rental'] === 'booked' && saved.bookings['Mountain lodge'] === 'booked' && saved.bookings['Village hotel'] === 'not_booked'
      && saved.bookings['Ridge chalet'] === 'not_booked' && saved.options.length === 7 && shown.includes('Chosen for these nights · 6 people')
      && pageAfter.address.includes(`stay%3A${OPT.ridge}`) && focusAfter.name === 'Comparison',
      { width, revision: [plan.revision, saved.revision], bookings: saved.bookings, options: saved.options.length, announced: await page.eval(`document.querySelector('[aria-live=polite]')?.innerText`), focusAfter, address: pageAfter.address });

    // A saved stay whose dates don't cover the nights says so, and nothing is saved.
    await clickText(page, 'button', 'Use Pine rental for these nights');
    await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    const outside = await page.eval(`document.querySelector('[role=dialog] [role=alert]').innerText`);
    await key(page, 'Escape', 'Escape', 27);
    await page.waitFor(`!document.querySelector('[role=dialog]')`, 8000);
    const focusAfterEscape = await page.run(focusState);
    record('use', `saved stay outside its dates at ${width}px`, outside.includes("Pine rental's dates don't include the night of Sun Oct 11") && focusAfterEscape.name === 'Comparison',
      { width, outside, focusAfterEscape });
  }
  await api('/__qa/reset');
  await save();
}

async function shots(page) {
  await signIn(page, VIEWERS.organizer);
  for (const [state, widths] of [['known', [320, 390, 1440]], ['unknown', [390, 1440]], ['empty', [390]]]) {
    for (const width of widths) {
      await emulate(page, { width });
      await open(page, STATES[state]);
      await shot(page, `${state}-${width}`, { width });
    }
  }
  await emulate(page, { width: 390, fontSize: 32 });
  await open(page, STATES.known);
  await shot(page, 'known-390-200pct', { width: 390, fontSize: 32 });
  await save();
}

await mkdir(OUT, { recursive: true });
const browser = await openBrowser();
try {
  results.meta = { base: BASE, browser: browser.version.Browser, started: new Date().toISOString() };
  const page = await newPage(browser.cdp);
  await api('/__qa/reset');
  if (groups.has('content')) await contentChecks(page);
  if (groups.has('layout')) await layoutChecks(page);
  if (groups.has('text')) await textChecks(page);
  if (groups.has('a11y')) await a11yChecks(page);
  if (groups.has('journeys')) await journeyChecks(page, browser.cdp);
  if (groups.has('use')) await useChecks(page);
  if (groups.has('shots')) await shots(page);
  results.meta.finished = new Date().toISOString();
  await save();
  const all = Object.values(results).filter(Array.isArray).flat().filter((entry) => 'pass' in entry);
  process.stdout.write(`\n${all.filter((entry) => entry.pass).length} of ${all.length} checks passed. Results: ${join(OUT, 'results.json')}\n`);
} finally {
  await browser.close();
}
