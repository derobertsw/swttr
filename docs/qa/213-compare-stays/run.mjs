// CDP harness for the #213 browser checks. It drives headless Chrome against
// the worktree's Next server with shim.patch applied and api.mjs serving the
// fixture trips (see README.md), and writes results.json plus PNG captures to
// OUT. It reuses #337's DevTools client (docs/qa/337-group-planning/cdp.mjs).
//
//   BASE=http://localhost:3432 API=http://127.0.0.1:3492 CDP_PORT=9432 OUT=/tmp/qa213 \
//     node docs/qa/213-compare-stays/run.mjs [group ...]
//
// Groups: content, layout, text, a11y, journeys, use, sheet, recovery, shots (default: all).
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { api, BASE, Cdp, emulate, key, newPage, sleep, tab, visit } from '../337-group-planning/cdp.mjs';

const OUT = resolve(process.env.OUT ?? join(tmpdir(), 'qa213'));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9432);
const groups = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['content', 'layout', 'text', 'a11y', 'journeys', 'use', 'sheet', 'recovery', 'shots']);

const TRIP = 'qa213-weekend';
const ONE = 'qa213-one';
const VIEWERS = { organizer: 'user-alex', member: 'user-blair' };
const [FRI, SUN, MON] = ['2026-10-09', '2026-10-11', '2026-10-12'];
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

/**
 * A value as a JavaScript literal for code run in the page: JSON, with the characters
 * that could end a script or a line in page code escaped too.
 */
const ESCAPES = { '<': '\\u003C', '>': '\\u003E', '/': '\\u002F', '\u2028': '\\u2028', '\u2029': '\\u2029' };
const literal = (value) => JSON.stringify(value).replace(/[<>/\u2028\u2029]/g, (ch) => ESCAPES[ch]);

const text = (selector = '#main-content') => `(document.querySelector(${literal(selector)})?.innerText ?? '')`;

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
    offenders: offenders.map((entry) => ({ ...entry, node: undefined })).slice(0, 8), spilled, rootFontSize: getComputedStyle(document.documentElement).fontSize,
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
    not: ['Shortest that morning', 'lowest sum', /\bbest\b/i, /\b0 min\b/],
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
/** Clicks the visible control with this text or name (the phone and desktop layouts each have one, and one is hidden). */
const clickText = (page, selector, label) => page.eval(`(() => { const el = [...document.querySelectorAll(${literal(selector)})].find((node) => (node.innerText.trim() === ${literal(label)} || node.getAttribute('aria-label') === ${literal(label)}) && node.checkVisibility()); if (!el) return false; el.focus(); el.click(); return true; })()`);
const compareRequests = async () => JSON.parse(await api('/__qa/log', undefined, 'GET')).filter((entry) => entry.key.endsWith('/stay-candidates/compare')).length;

async function journeyChecks(page, cdp) {
  await signIn(page, VIEWERS.organizer);
  await cdp.send('Target.setDiscoverTargets', { discover: true });
  for (const width of [390, 1440]) {
    await api('/__qa/reset');
    await emulate(page, { width });
    await open(page, compareUrl(TRIP, [c('ridge'), s('pine')], [FRI, SUN]));

    // External link: the property page opens in a new tab; coming back keeps the selection, nights and scroll.
    const PROPERTY = `[...document.querySelectorAll('#main-content a[target=_blank][aria-label^="Open "]')].find((a) => a.getBoundingClientRect().width > 0)`;
    await page.eval(`${PROPERTY}.scrollIntoView({ block: 'center' })`);
    await sleep(300);
    const before = await selection(page);
    const requestsBefore = await compareRequests();
    // Any new tab (noopener leaves it without an opener), opened by a real click, which counts as a user gesture.
    const opened = new Promise((done) => { cdp.on((message) => { if (message.method === 'Target.targetCreated' && message.params.targetInfo.type === 'page' && message.params.targetInfo.targetId !== page.targetId) done(message.params.targetInfo); }); setTimeout(() => done(null), 8000); });
    const link = await page.eval(`(() => { const a = ${PROPERTY}; const r = a.getBoundingClientRect(); return { href: a.href, rel: a.rel, target: a.target, label: a.getAttribute('aria-label'), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: link.x, y: link.y, button: 'left', clickCount: 1 });
    const target = await opened;
    if (target) await cdp.send('Target.closeTarget', { targetId: target.targetId }).catch(() => undefined);
    await page.send('Page.bringToFront');
    await page.eval(`window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))`);
    await sleep(2000);
    const after = await selection(page);
    const requestsAfter = await compareRequests();
    record('journeys', `external link return at ${width}px`, !!target && JSON.stringify(before) === JSON.stringify(after) && link.rel.includes('noopener'),
      { width, link, newTab: target ? 'opened (no opener: noopener)' : null, before, after, comparisonRequestsOnReturn: requestsAfter - requestsBefore });

    // Reload: the address keeps the selection and nights.
    await page.send('Page.reload');
    await open(page, after.address);
    const reloaded = await selection(page);
    record('journeys', `reload keeps the choice and nights at ${width}px`, JSON.stringify(reloaded.checked) === JSON.stringify(before.checked)
      && reloaded.first_night === FRI && reloaded.checkout === SUN, { width, reloaded });

    // Choosing stays and nights never saves anything.
    const writesBefore = JSON.parse(await api('/__qa/log', undefined, 'GET')).filter((entry) => !entry.key.startsWith('GET')).length;
    const planBefore = await savedPlan();
    await page.eval(`[...document.querySelectorAll('#main-content input[type=checkbox]')].find((box) => box.closest('label').innerText.startsWith('Brook inn')).click()`);
    await sleep(800);
    await page.eval(`(() => { const select = document.querySelector('select[name=checkout]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(select, '${MON}'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(1200);
    const chosen = await selection(page);
    await page.eval(`[...document.querySelectorAll('#main-content input[type=checkbox]')].find((box) => box.closest('label').innerText.startsWith('Brook inn')).click()`);
    await page.eval(`(() => { const select = document.querySelector('select[name=checkout]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(select, '${SUN}'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await sleep(1200);
    const writesAfter = JSON.parse(await api('/__qa/log', undefined, 'GET')).filter((entry) => !entry.key.startsWith('GET')).length;
    record('journeys', `choosing stays and nights saves nothing at ${width}px`, writesAfter === writesBefore && JSON.stringify(await savedPlan()) === JSON.stringify(planBefore)
      && chosen.checked.length === 3 && chosen.checkout === MON, { width, chosen, writes: writesAfter - writesBefore });

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
    const planAfterAdd = await savedPlan();
    const lodgingKept = planAfterAdd.revision === planBefore.revision && JSON.stringify(planAfterAdd.nights) === JSON.stringify(planBefore.nights)
      && JSON.stringify(planAfterAdd.bookings) === JSON.stringify(planBefore.bookings) && planAfterAdd.options.length === planBefore.options.length + 1;
    record('journeys', `add a stay and return at ${width}px`, afterAdd.checked.length === 3 && afterAdd.checked[2].startsWith(`Maple farmhouse ${width}`)
      && afterAdd.checked.slice(0, 2).join() === beforeAdd.checked.join() && afterAdd.first_night === FRI && afterAdd.checkout === SUN
      && Math.abs(afterAdd.scrollY - beforeAdd.scrollY) <= 40 && lodgingKept, { width, beforeAdd, afterAdd, focusInSheet, focusAfter, announced, lodgingKept });
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

async function nightsUseChecks(page) {
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
    record('use', `preview, old → new per night, at ${width}px`, !missing.length && useDisabled === true && focusOnOpen.name === 'What changes' && !preview.includes('Village hotel stay') && !preview.includes('Village hotel and'),
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
    await sleep(300);
    const focusAfterReview = await page.run(focusState);

    // A failed save: the server errors; the preview, the people and the replacement stay as they were.
    await page.eval(`document.querySelector('[role=dialog] input[type=checkbox]:not([name=member_ids])').click()`);
    await api('/__qa/overrides', { [`POST /api/v1/trips/${TRIP}/stay-candidates/use`]: { status: 500, body: { error: "Couldn't save lodging. Your changes are still here; try again." }, times: 1 } });
    await clickText(page, '[role=dialog] button', 'Replace those nights and use it');
    await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    const failed = { alert: await page.eval(`document.querySelector('[role=dialog] [role=alert]').innerText`), sheet: await sheetText(page),
      replaceTicked: await page.eval(`document.querySelector('[role=dialog] input[type=checkbox]:not([name=member_ids])')?.checked`) };
    record('use', `failed save keeps the plan and the sheet at ${width}px`, JSON.stringify(await savedPlan()) === JSON.stringify(plan) && failed.replaceTicked === true
      && failed.sheet.includes('What changes') && people === 6 && focusAfterReview.name === 'What changes', { width, alert: failed.alert, replaceTicked: failed.replaceTicked, peopleAfterReview: people, focusAfterReview });

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
      && pageAfter.address.includes(`stay%3A${OPT.ridge}`) && focusAfter.name === 'Comparison' && focusAfter.inView,
      { width, revision: [plan.revision, saved.revision], bookings: saved.bookings, options: saved.options.length, announced: await page.eval(`document.querySelector('[aria-live=polite]')?.innerText`), focusAfter, address: pageAfter.address });

    // A saved stay whose dates don't cover the nights says so, and nothing is saved.
    await clickText(page, 'button', 'Use Pine rental for these nights');
    await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    const outside = await page.eval(`document.querySelector('[role=dialog] [role=alert]').innerText`);
    await key(page, 'Escape', 'Escape', 27);
    await page.waitFor(`!document.querySelector('[role=dialog]')`, 8000);
    const focusAfterEscape = await page.run(focusState);
    record('use', `saved stay outside its dates at ${width}px`, outside.includes("Pine rental's dates don't include the night of Sun Oct 11") && focusAfterEscape.name === 'Use Pine rental for these nights',
      { width, outside, focusAfterEscape });
  }
  await api('/__qa/reset');
  await save();
}

/** The Use sheet: names, Tab order kept inside it, and nothing wider than the sheet, at 100% and 200% text. */
async function sheetChecks(page) {
  await signIn(page, VIEWERS.organizer);
  for (const [width, fontSize] of [[390, 16], [1440, 16], [320, 32], [390, 32]]) {
    await api('/__qa/reset');
    await emulate(page, { width, fontSize });
    await open(page, compareUrl(TRIP, [s('pine'), c('ridge')]));
    await clickText(page, 'button', 'Use Ridge chalet for these nights');
    await page.waitFor(`document.querySelector('[role=dialog]')?.innerText.includes('What changes')`, 15_000);
    await page.eval(`document.querySelectorAll('[role=dialog] details').forEach((d) => { d.open = true; })`);
    await sleep(400);
    const ax = await axSummary(page);
    const stops = [];
    for (let index = 0; index < 14; index += 1) { await tab(page); stops.push(await page.run(focusState)); }
    const wide = await page.eval(`(() => { const d = document.querySelector('[role=dialog]'); const inner = [...d.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > d.getBoundingClientRect().right + 1 && getComputedStyle(el).position !== 'fixed');
      return { dialog: Math.round(d.getBoundingClientRect().width), scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, past: inner.slice(0, 5).map((el) => el.tagName + ':' + (el.innerText ?? '').slice(0, 40)) }; })()`);
    const pass = !ax.unnamed.length && stops.every((stop) => stop.dialog) && stops.every((stop) => stop.shown) && wide.scrollWidth <= wide.clientWidth + 1 && !wide.past.length;
    record('use', `sheet at ${width}px, ${fontSize === 32 ? '200%' : '100%'} text`, pass, { width, fontSize, unnamed: ax.unnamed, checkboxes: ax.checkboxes.filter((name) => !/comparison|nights ·|Booked|Booking|Nights not set/.test(name)),
      tabOrder: stops.map((stop) => `${stop.tag}${stop.type ? `[${stop.type}]` : ''}:${stop.name}${stop.dialog ? '' : ' (outside the sheet)'}${stop.shown ? '' : ' (no visible focus)'}`), wide });
    await key(page, 'Escape', 'Escape', 27);
    await page.waitFor(`!document.querySelector('[role=dialog]')`, 8000);
  }
  await emulate(page, { width: 390 });
  await save();
}

/** The comparison request fails: an alert with Try again, and the choice stays; trying again recovers. */
async function recoveryChecks(page) {
  await signIn(page, VIEWERS.organizer);
  await api('/__qa/reset');
  for (const width of [390, 1440]) {
    await emulate(page, { width });
    await api('/__qa/overrides', { [`GET /api/v1/trips/${TRIP}/stay-candidates/compare`]: { status: 500, body: { error: "Couldn't compare these stays. Try again." } } });
    // Failing until it's switched off: development mode mounts twice and asks twice.
    await visit(page, STATES.known);
    await page.waitFor(`document.querySelector('#main-content [role=alert]')`, 15_000);
    const alert = await page.eval(`document.querySelector('#main-content [role=alert]').innerText`);
    const kept = await selection(page);
    await api('/__qa/overrides', undefined, 'DELETE');
    await clickText(page, '#main-content button', 'Try again');
    await page.waitFor(`document.querySelector('table, [role=group]') && !document.querySelector('#main-content [role=alert]')`, 15_000);
    const shown = await page.eval(text());
    record('journeys', `comparison fails, then Try again at ${width}px`, alert.includes("Couldn't compare these stays. Try again.") && kept.checked.length === 3
      && shown.includes('Pine rental has the lowest sum of planned outbound drives'), { width, alert, kept: kept.checked });
  }
  await api('/__qa/overrides', undefined, 'DELETE');
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
  if (groups.has('use')) await nightsUseChecks(page);
  if (groups.has('sheet')) await sheetChecks(page);
  if (groups.has('recovery')) await recoveryChecks(page);
  if (groups.has('shots')) await shots(page);
  results.meta.finished = new Date().toISOString();
  await save();
  const all = Object.values(results).filter(Array.isArray).flat().filter((entry) => 'pass' in entry);
  process.stdout.write(`\n${all.filter((entry) => entry.pass).length} of ${all.length} checks passed. Results: ${join(OUT, 'results.json')}\n`);
} finally {
  await browser.close();
}
