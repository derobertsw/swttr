// CDP harness for the #337 browser validation. It drives headless Chrome
// against the worktree's Next server with shim.patch applied and api.mjs
// serving the fixture trips (see README.md for the full recipe), and writes
// results.json plus PNG captures to OUT.
//
//   OUT=/tmp/qa337 node docs/qa/337-group-planning/run.mjs [group ...]
//
// Groups: layout, a11y, text, motion, journeys, failures, focus, shots (default: all).
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { api, BASE, emulate, key, newPage, openBrowser, signIn, sleep, tab, visit } from './cdp.mjs';

const root = process.cwd();
const OUT = resolve(process.env.OUT ?? join(tmpdir(), 'qa337'));
const groups = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['layout', 'a11y', 'text', 'motion', 'journeys', 'failures', 'focus', 'shots']);

const JOURNEYS = {
  downhill: { trip: 'qa337-downhill', day: '2026-10-10' },
  backcountry: { trip: 'qa337-backcountry', day: '2027-01-09' },
};
const VIEWERS = { organizer: 'user-alex', member: 'user-blair' };
const PAGES = {
  plan: (t) => `/trips/${t}`,
  day: (t, d) => `/trips/${t}/days/${d}`,
  stays: (t) => `/trips/${t}/stays`,
  crew: (t) => `/trips/${t}/manage`,
  rollcall: (t) => `/trips/${t}/rollcall`,
  packing: (t) => `/trips/${t}/pack`,
  gear: (t) => `/trips/${t}/gear`,
};
const WIDTHS = [320, 390, 768, 1024, 1440];

// ------------------------------------------------------- in-page audits

/** Overflow, default content cards and target sizes, read from the rendered page. */
function layoutAudit() {
  const vw = document.documentElement.clientWidth;
  const main = document.getElementById('main-content');
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 120);
  };
  const text = (el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // A closed <details> keeps boxes for its content but doesn't render it.
    const closed = el.closest('details:not([open])');
    if (closed && !closed.querySelector(':scope > summary')?.contains(el)) return false;
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"], [inert]');
  };
  // Horizontal overflow: the outermost elements past the viewport that no scroller clips.
  const pageOverflow = document.documentElement.scrollWidth > vw;
  const offenders = [];
  const scrollers = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1 && visible(el)) scrollers.push({ el: describe(el), text: text(el).slice(0, 50), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) { clipped = true; break; }
    }
    if (clipped || s.position === 'fixed') continue;
    if (offenders.some((entry) => entry.node.contains(el))) continue;
    offenders.push({ node: el, el: describe(el), text: text(el), right: Math.round(r.right), left: Math.round(r.left) });
  }
  // Default content cards: rounded, framed or filled blocks holding content.
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const clear = (c) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const allowed = 'input, textarea, select, button, a, [role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-radix-popper-content-wrapper], .maplibregl-map, [data-slot=skeleton], .animate-pulse, [data-sonner-toaster], [data-vaul-drawer], nav[aria-label="Trip sections"]';
  const mainWidth = main?.getBoundingClientRect().width ?? vw;
  const cards = [];
  for (const el of main?.querySelectorAll('*') ?? []) {
    if (!visible(el) || el.closest(allowed)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (parseFloat(s.borderTopLeftRadius) < 8 || r.width < 0.4 * mainWidth || r.height < 48 || text(el).length < 20) continue;
    const framed = ['Top', 'Right', 'Bottom', 'Left'].every((side) => parseFloat(s[`border${side}Width`]) >= 1 && s[`border${side}Style`] !== 'none' && !clear(s[`border${side}Color`]));
    const shadow = s.boxShadow !== 'none';
    const filled = !clear(s.backgroundColor) && s.backgroundColor !== bodyBg;
    if (!framed && !shadow && !filled) continue;
    if (cards.some((card) => card.node.contains(el))) continue;
    const editor = !!el.closest('form, fieldset') || !!el.querySelector('input, textarea, select');
    cards.push({ node: el, el: describe(el), text: text(el), kind: editor ? 'editor' : 'content', framed, shadow, filled, w: Math.round(r.width), h: Math.round(r.height) });
  }
  // Targets: every visible control; inline text links are reported apart.
  const controls = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=switch], [role=radio], [role=link], [role=menuitem], [role=combobox]';
  const small = [];
  let counted = 0;
  for (const el of document.body.querySelectorAll(controls)) {
    if (!visible(el) || el.closest('nextjs-portal')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 && r.height <= 2) continue; // sr-only
    counted += 1;
    const label = el.closest('label');
    const box = label && label.getBoundingClientRect().height > r.height ? label.getBoundingClientRect() : r;
    if (box.height >= 43.5 && box.width >= 43.5) continue;
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    small.push({ el: describe(el), name: (el.getAttribute('aria-label') ?? text(el)).slice(0, 60), w: Math.round(box.width), h: Math.round(box.height), inline, main: !!main?.contains(el) });
  }
  return {
    vw, scrollWidth: document.documentElement.scrollWidth, pageOverflow,
    offenders: offenders.map((entry) => ({ ...entry, node: undefined })).slice(0, 12), scrollers: scrollers.slice(0, 8),
    cards: cards.map((entry) => ({ ...entry, node: undefined })), controls: counted, small,
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    // Text that spills out of its own box (and over its neighbours) rather than wrapping.
    spilled: [...document.body.querySelectorAll('a, button, label, span, p, h1, h2, h3, li, dt, dd')].filter((el) => {
      if (!visible(el) || el.closest('[data-sonner-toaster], nextjs-portal')) return false;
      const s = getComputedStyle(el);
      return s.overflowX === 'visible' && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0
        && [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
    }).map((el) => ({ el: describe(el), text: text(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })).slice(0, 12),
    truncated: [...(main?.querySelectorAll('*') ?? [])].filter((el) => visible(el) && el.children.length === 0 && getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)
      .map((el) => ({ el: describe(el), text: text(el) })).slice(0, 10),
    h1: [...document.querySelectorAll('h1')].map(text),
  };
}

/** What has focus after a Tab, and whether it's shown. */
function focusState() {
  const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1;
  const ring = s.boxShadow !== 'none';
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + Math.min(r.height / 2, 20), 0), innerHeight - 1);
  const hit = document.elementFromPoint(cx, cy);
  const covered = hit && !el.contains(hit) && !hit.contains(el) ? (hit.closest('[data-trip-sections], [data-mobile-tab-bar], header, nav') ?? hit) : null;
  const name = (el.getAttribute('aria-label') ?? el.innerText ?? el.value ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
  return {
    tag: el.tagName.toLowerCase(), name, visible: el.matches(':focus-visible') && (outline || ring), outline, ring,
    inView: r.bottom > 0 && r.top < innerHeight && r.width > 0, covered: covered ? `${covered.tagName.toLowerCase()}${covered.getAttribute('data-trip-sections') !== null ? '[data-trip-sections]' : ''}` : null,
  };
}

/** Elements still animating or transitioning longer than the reduced-motion cap. */
function motionAudit() {
  const moving = [];
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    const longest = (value) => Math.max(...value.split(',').map((part) => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000)));
    const animation = s.animationName !== 'none' ? longest(s.animationDuration) : 0;
    const transition = longest(s.transitionDuration);
    if (animation > 1 || transition > 1) moving.push({ el: el.tagName.toLowerCase() + (typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''), animation, transition });
  }
  return { moving: moving.slice(0, 10), count: moving.length };
}

// ------------------------------------------------------------ checks

const results = { meta: {}, layout: [], a11y: [], text: [], motion: [], journeys: [], failures: [], focus: [], shots: [] };
const save = () => writeFile(join(OUT, 'results.json'), JSON.stringify(results, null, 2));

async function shot(page, name, { width, mobile = width < 768, touch, scheme = 'light', fontSize = 16, height } = {}) {
  await emulate(page, { width, height: 900, mobile, touch, dpr: 2, scheme, fontSize });
  await sleep(300);
  const full = height ?? Math.min(await page.eval('document.documentElement.scrollHeight'), 4000);
  await emulate(page, { width, height: full, mobile, touch, dpr: 2, scheme, fontSize });
  await page.eval('window.scrollTo(0, 0)');
  // The shim skips Clerk, so the header offers Sign in; a signed-in person wouldn't see it.
  await page.eval(`document.querySelectorAll('a, button').forEach((el) => { if (el.innerText?.trim() === 'Sign in' && !el.closest('#main-content')) el.style.visibility = 'hidden'; })`);
  await sleep(500);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(data, 'base64'));
  results.shots.push({ name, width, scheme, fontSize, file });
  return file;
}

async function layoutChecks(page) {
  for (const [journey, { trip, day }] of Object.entries(JOURNEYS)) {
    for (const [role, viewer] of Object.entries(VIEWERS)) {
      await signIn(page, viewer);
      for (const [name, path] of Object.entries(PAGES)) {
        for (const width of WIDTHS) {
          await emulate(page, { width });
          await visit(page, path(trip, day));
          await page.eval(`document.head.insertAdjacentHTML('beforeend', '<style id=qa-still>*,*::before,*::after{transition:none!important;animation:none!important}</style>')`);
          for (const scheme of ['light', 'dark']) {
            await emulate(page, { width, scheme });
            await sleep(150);
            const audit = await page.run(layoutAudit);
            results.layout.push({ journey, role, page: name, width, scheme, ...audit, console: [...page.console] });
          }
          process.stdout.write(`layout ${journey} ${role} ${name} ${width}\n`);
        }
      }
      await save();
    }
  }
}

async function axNames(page) {
  const { nodes } = await page.send('Accessibility.getFullAXTree');
  const interactive = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'slider', 'spinbutton', 'searchbox']);
  const named = nodes.filter((node) => !node.ignored && interactive.has(node.role?.value));
  const unnamed = named.filter((node) => !String(node.name?.value ?? '').trim()).map((node) => node.role.value);
  const counts = new Map();
  for (const node of named) {
    const key = `${node.role.value}:${String(node.name?.value ?? '').trim()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts].filter(([, count]) => count > 1).map(([key, count]) => `${key} ×${count}`);
  const headings = nodes.filter((node) => !node.ignored && node.role?.value === 'heading').map((node) => `${node.properties?.find((p) => p.name === 'level')?.value?.value ?? '?'}:${String(node.name?.value ?? '').slice(0, 40)}`);
  const landmarks = nodes.filter((node) => !node.ignored && ['main', 'navigation', 'banner', 'contentinfo', 'region'].includes(node.role?.value)).map((node) => `${node.role.value}:${String(node.name?.value ?? '')}`);
  return { interactive: named.length, unnamed, repeated, headings, landmarks };
}

async function traverse(page, limit = 80) {
  await page.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
  const stops = [];
  for (let index = 0; index < limit; index += 1) {
    await tab(page);
    const state = await page.run(focusState);
    if (state.body) break;
    if (stops.length && stops[0].name === state.name && stops[0].tag === state.tag && index > 3) break;
    stops.push(state);
  }
  return {
    stops: stops.length,
    hidden: stops.filter((stop) => !stop.visible).map((stop) => `${stop.tag}:${stop.name}`),
    outOfView: stops.filter((stop) => !stop.inView).map((stop) => `${stop.tag}:${stop.name}`),
    covered: stops.filter((stop) => stop.covered).map((stop) => `${stop.tag}:${stop.name} under ${stop.covered}`),
    order: stops.map((stop) => `${stop.tag}:${stop.name}`),
  };
}

async function a11yChecks(page) {
  for (const [journey, { trip, day }] of Object.entries(JOURNEYS)) {
    for (const [role, viewer] of Object.entries(VIEWERS)) {
      await signIn(page, viewer);
      for (const [name, path] of Object.entries(PAGES)) {
        for (const width of [390, 1440]) {
          await emulate(page, { width });
          await visit(page, path(trip, day));
          const ax = await axNames(page);
          const keyboard = await traverse(page);
          results.a11y.push({ journey, role, page: name, width, ...ax, keyboard });
          process.stdout.write(`a11y ${journey} ${role} ${name} ${width}: ${keyboard.stops} stops, ${keyboard.hidden.length} without visible focus, ${ax.unnamed.length} unnamed\n`);
        }
      }
      await save();
    }
  }
}

async function textChecks(page) {
  for (const [journey, { trip, day }] of Object.entries(JOURNEYS)) {
    for (const [role, viewer] of Object.entries(VIEWERS)) {
      await signIn(page, viewer);
      for (const [name, path] of Object.entries(PAGES)) {
        for (const mode of [{ label: '200% text 390', width: 390, fontSize: 32 }, { label: '200% text 1440', width: 1440, fontSize: 32 },
          { label: '400% zoom at 1280 (320x256 CSS px)', width: 320, height: 256, mobile: false, touch: false }]) {
          await emulate(page, { width: mode.width, height: mode.height ?? 900, mobile: mode.mobile, touch: mode.touch, fontSize: mode.fontSize ?? 16 });
          await visit(page, path(trip, day));
          const audit = await page.run(layoutAudit);
          results.text.push({ journey, role, page: name, mode: mode.label, ...audit, console: [...page.console] });
        }
        process.stdout.write(`text ${journey} ${role} ${name}\n`);
      }
      await save();
    }
  }
}

async function motionChecks(page) {
  await signIn(page, VIEWERS.member);
  for (const [journey, { trip, day }] of Object.entries(JOURNEYS)) {
    for (const name of ['plan', 'day', 'stays']) {
      for (const motion of ['reduce', 'no-preference']) {
        await emulate(page, { width: 390, motion });
        await visit(page, PAGES[name](trip, day));
        results.motion.push({ journey, page: name, motion, ...await page.run(motionAudit) });
      }
    }
  }
  await save();
}

/** Where a phrase first appears on the page, in document pixels, and the first screen's height. */
function locate(phrases) {
  const main = document.getElementById('main-content');
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const found = {};
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent.replace(/\s+/g, ' ');
    for (const [key, phrase] of Object.entries(phrases)) {
      if (found[key] || !value.includes(phrase)) continue;
      const el = node.parentElement;
      if (!el || el.closest('[aria-hidden="true"]') || el.getBoundingClientRect().height === 0) continue;
      found[key] = { y: Math.round(el.getBoundingClientRect().top + scrollY), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) };
    }
  }
  return { found, screen: innerHeight, missing: Object.keys(phrases).filter((key) => !found[key]) };
}

async function journeyChecks(page) {
  const downhill = JOURNEYS.downhill, backcountry = JOURNEYS.backcountry;
  const member = [
    { who: 'Blair (Pine rental)', viewer: 'user-blair', expect: { meet: '8:30 AM', place: 'Spruce Peak lot', origin: 'Pine rental', tonight: 'Staying tonight', kit: 'My kit', weather: 'Weather' } },
    { who: 'Eli (Village hotel)', viewer: 'user-eli', expect: { meet: '8:30 AM', place: 'Spruce Peak lot', origin: 'Village hotel', tonight: 'Staying tonight', kit: 'My kit', weather: 'Weather' } },
    { who: 'Casey (arrives Saturday evening, skips Saturday)', viewer: 'user-casey', expect: { away: "You're not taking part this day", tonight: 'Staying tonight', rental: 'Pine rental', weather: 'Weather' } },
  ];
  for (const width of [320, 390, 1440]) {
    for (const entry of member) {
      await signIn(page, entry.viewer);
      await emulate(page, { width, height: width < 768 ? 800 : 900 });
      await visit(page, PAGES.day(downhill.trip, downhill.day));
      const where = await page.run(locate, entry.expect);
      const text = await page.eval(`document.getElementById('main-content').innerText`);
      results.journeys.push({ check: `downhill Sat day brief: ${entry.who}`, width, ...where, excerpt: text.slice(0, 1600) });
    }
    // Sunday: Eli starts from his own park and ride; everyone checks out in the morning.
    await signIn(page, 'user-eli');
    await visit(page, PAGES.day(downhill.trip, '2026-10-11'));
    results.journeys.push({ check: 'downhill Sun day brief: Eli (own starting point, checkout morning)', width,
      ...await page.run(locate, { meet: '9:00 AM', origin: 'Waterbury park and ride', tonight: 'Mountain lodge', weather: 'Weather' }),
      excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 1600) });
    // Monday: no meet time saved yet.
    await visit(page, PAGES.day(downhill.trip, '2026-10-12'));
    results.journeys.push({ check: 'downhill Mon day brief: Eli (meet time not set)', width,
      ...await page.run(locate, { start: 'Start of the day', origin: 'Mountain lodge', meet: 'Meet' }),
      excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 1200) });
    // Backcountry: objective, backup, return/check-in and sources before clothing and equipment.
    await signIn(page, 'user-blair');
    await visit(page, PAGES.day(backcountry.trip, backcountry.day));
    results.journeys.push({ check: 'backcountry Sat day brief: Blair', width, ...await page.run(locate, {
      meet: '7:30 AM', place: 'Sterling Pond trailhead', origin: 'Ridge rental', approach: 'Skin 2.5 km', objective: 'Sterling Pond to Madonna Peak',
      backup: 'If avalanche danger is Considerable', back: '3:30 PM', checkin: 'Text Alex from the hut', avalanche: 'Northern Greens avalanche advisory',
      stale: 'Route changed', access: 'State park winter road status', weather: 'Weather', kit: 'My kit', equipment: 'My equipment', checks: 'Transceiver check',
    }), excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 3000) });
    await visit(page, PAGES.day(backcountry.trip, '2027-01-10'));
    results.journeys.push({ check: 'backcountry Sun (hut, No drive planned): Blair', width, ...await page.run(locate, { nodrive: 'No drive planned', hut: 'Sterling Pond hut', objective: 'Hut loop', kit: 'My kit' }),
      excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 1800) });
    await visit(page, PAGES.day(backcountry.trip, '2027-01-11'));
    results.journeys.push({ check: 'backcountry Mon (drive out from the ski-in hut): Blair', width, ...await page.run(locate, { origin: 'Sterling Pond hut', noroute: 'road route', weather: "Couldn't load the forecast" }),
      excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 1800) });
  }
  // Opening the trip lands on today for a member and the organizer, and a stranger can't see it.
  await emulate(page, { width: 390 });
  for (const [who, viewer, trip] of [['member', 'user-blair', downhill.trip], ['organizer', 'user-alex', downhill.trip], ['member', 'user-blair', backcountry.trip], ['solo organizer', 'user-sam', 'qa337-solo']]) {
    await signIn(page, viewer);
    // A day this tab already showed counts as picked (#334), so start from a fresh tab's storage.
    await page.eval('sessionStorage.clear()');
    await visit(page, `/trips/${trip}/days`);
    await page.waitFor(`location.pathname !== '/trips/${trip}/days'`, 8000);
    results.journeys.push({ check: `open trip (${who}, ${trip})`, landed: await page.eval('location.pathname') });
  }
  await signIn(page, 'user-zoe');
  await visit(page, PAGES.plan(downhill.trip));
  results.journeys.push({ check: 'revoked/no access (not on the trip)', excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 400) });
  // Crew and Stays as text: pending invitation, managed guest, late arrival, split nights.
  for (const [who, viewer] of [['organizer', 'user-alex'], ['member', 'user-blair']]) {
    await signIn(page, viewer);
    for (const name of ['crew', 'stays', 'rollcall', 'packing', 'plan']) {
      await emulate(page, { width: 1440 });
      await visit(page, PAGES[name](downhill.trip, downhill.day));
      results.journeys.push({ check: `downhill ${name} (${who}) text`, excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 3500) });
    }
  }
  for (const name of ['plan', 'packing', 'gear', 'rollcall']) {
    await signIn(page, 'user-blair');
    await visit(page, PAGES[name](backcountry.trip, backcountry.day));
    results.journeys.push({ check: `backcountry ${name} (member) text`, excerpt: (await page.eval(`document.getElementById('main-content').innerText`)).slice(0, 3500) });
  }
  // Long names at 320.
  await signIn(page, 'user-alex');
  for (const name of ['day', 'stays', 'crew', 'rollcall', 'plan']) {
    await emulate(page, { width: 320 });
    await visit(page, PAGES[name]('qa337-downhill-long', downhill.day));
    results.journeys.push({ check: `long names ${name} 320 (organizer)`, ...await page.run(layoutAudit) });
  }
  await save();
}

/** Clicks the first visible button whose text or label matches. */
function press(label) {
  const match = [...document.querySelectorAll('button, a[href], [role=button]')].find((el) => {
    const name = (el.getAttribute('aria-label') ?? el.innerText ?? '').replace(/\s+/g, ' ').trim();
    return (name === label || name.startsWith(label)) && el.getBoundingClientRect().height > 0 && !el.closest('[aria-hidden="true"]');
  });
  if (!match) return false;
  match.scrollIntoView({ block: 'center' });
  match.focus();
  match.click();
  return true;
}

function typeInto(selector, value) {
  const el = document.querySelector(selector);
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** Ticks exactly the named people and picks a plan in the open Change nights editor. */
function choose({ who, plan }) {
  const inputs = (name) => [...document.querySelectorAll(`[role=dialog] input[name="${name}"]`)];
  for (const input of inputs('who')) {
    const want = who.some((name) => input.closest('label').innerText.trim().startsWith(name));
    if (input.checked !== want) input.click();
  }
  inputs('plan').find((input) => input.closest('label').innerText.includes(plan))?.click();
  return inputs('who').filter((input) => input.checked).map((input) => input.closest('label').innerText.trim());
}

async function failureChecks(page) {
  const { trip, day } = JOURNEYS.downhill;
  const notesPath = `/api/v1/trips/${trip}/days/${day}/notes`;
  await api('/__qa/overrides', undefined, 'DELETE');
  await signIn(page, 'user-alex');
  await emulate(page, { width: 390 });
  const typed = 'Lift tickets moved to window 5.';
  const notesFlow = async (label, overrides, name) => {
    await api('/__qa/overrides', undefined, 'DELETE');
    if (overrides) await api('/__qa/overrides', overrides);
    await visit(page, PAGES.day(trip, day));
    await page.run(press, 'Edit notes');
    await page.waitFor(`document.querySelector('textarea[name=notes]')`);
    await page.run(typeInto, 'textarea[name=notes]', typed);
    await page.run(press, 'Save notes');
    await page.waitFor(`document.querySelector('form [role=alert]')`, 15_000);
    const state = await page.eval(`(() => { const form = document.querySelector('textarea[name=notes]').closest('form'); return {
      alert: form.querySelector('[role=alert]')?.innerText, kept: document.querySelector('textarea[name=notes]').value,
      buttons: [...form.querySelectorAll('button')].map((b) => b.innerText.trim()), focus: document.activeElement?.name || document.activeElement?.innerText } })()`);
    results.failures.push({ check: label, ...state, keptInput: state.kept === typed });
    if (name) await shot(page, name, { width: 390, height: 1400 });
  };
  await notesFlow('failed save keeps input (day notes, database error)', null, 'failure-notes-save-390');
  await notesFlow('concurrent edit (day notes, 409 from set_trip_day_notes)', { 'rpc:set_trip_day_notes': { code: 'PT409', message: 'changed' } }, 'failure-notes-conflict-390');
  await notesFlow('network failure (day notes, 503 HTML page)', { [`PUT ${notesPath}`]: { status: 503 } }, null);
  // Review saved notes after the conflict.
  await api('/__qa/overrides', undefined, 'DELETE');
  // Forecast and routing unavailable, No drive planned, no road route: text on the day pages.
  await signIn(page, 'user-blair');
  for (const [label, path, phrases] of [
    ['unavailable forecast + routing provider down (downhill Sun)', PAGES.day(trip, '2026-10-11'), ["Couldn't load the forecast", 'Retry weather', 'Village hotel']],
    ['stale estimate, refresh failed (downhill Mon)', PAGES.day(trip, '2026-10-12'), ['Mountain lodge', 'Meet']],
    ['routing provider down for the inn (backcountry Sat)', PAGES.day(JOURNEYS.backcountry.trip, JOURNEYS.backcountry.day), ['Notch Brook inn']],
    ['No drive planned from the hut (backcountry Sun)', PAGES.day(JOURNEYS.backcountry.trip, '2027-01-10'), ['No drive planned']],
    ['no road route from the ski-in hut (backcountry Mon)', PAGES.day(JOURNEYS.backcountry.trip, '2027-01-11'), ['road route']],
  ]) {
    await visit(page, path);
    const text = await page.eval(`document.getElementById('main-content').innerText`);
    const lines = text.split('\n').filter((line) => phrases.some((phrase) => line.includes(phrase)) || /unavailable|couldn't|try again|retry|no road|not available|stale|out of date|ago/i.test(line));
    results.failures.push({ check: label, found: phrases.filter((phrase) => text.includes(phrase)), missing: phrases.filter((phrase) => !text.includes(phrase)), lines: [...new Set(lines)].slice(0, 25) });
  }
  // Trip load failure, then recovery when the window regains focus.
  await api('/__qa/overrides', { [`GET /api/v1/trips/${trip}`]: { status: 500, body: { error: "Couldn't load the trip. Try again." } } });
  await visit(page, PAGES.day(trip, day));
  const failed = await page.eval(`document.getElementById('main-content').innerText`);
  await shot(page, 'failure-trip-load-390', { width: 390, height: 900 });
  await api('/__qa/overrides', undefined, 'DELETE');
  await emulate(page, { width: 390 });
  await page.eval(`window.dispatchEvent(new Event('focus'))`);
  await page.waitFor(`document.getElementById('trip-day-heading')`, 10_000);
  results.failures.push({ check: 'trip load fails (500), then recovers on window focus', failed: failed.slice(0, 400),
    retryButtons: await page.eval(`[...document.querySelectorAll('#main-content [role=alert] button')].length`),
    recovered: await page.eval(`!!document.getElementById('trip-day-heading')`) });
  // A tour plan save that fails keeps the form (organizer, backcountry Sat).
  await signIn(page, 'user-alex');
  await visit(page, PAGES.day(JOURNEYS.backcountry.trip, JOURNEYS.backcountry.day));
  const opened = await page.run(press, 'Change tour plan');
  await page.waitFor(`document.querySelector('[role=dialog] [name=backup_plan]')`, 8000);
  const backup = 'Stay in the trees below the pond.';
  if (opened && await page.eval(`!!document.querySelector('[role=dialog] [name=backup_plan]')`)) {
    await page.run(typeInto, '[role=dialog] [name=backup_plan]', backup);
    await page.run(press, 'Save tour plan');
    await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    results.failures.push({ check: 'failed save keeps input (tour plan editor, database error)',
      alert: await page.eval(`[...document.querySelectorAll('[role=dialog] [role=alert]')].map((el) => el.innerText).join(' | ')`),
      keptInput: await page.eval(`document.querySelector('[role=dialog] [name=backup_plan]').value`) === backup });
    await shot(page, 'failure-tour-plan-save-390', { width: 390, height: 1400 });
  } else results.failures.push({ check: 'failed save keeps input (tour plan editor)', note: `editor not found (opened ${opened})` });
  // Split stays: move only Blair and Dana to the Village hotel for Saturday night; the server predicts the mornings before saving.
  for (const width of [390, 1440]) {
    await api('/__qa/overrides', undefined, 'DELETE');
    await emulate(page, { width });
    await visit(page, PAGES.stays(trip));
    await page.run(press, 'Change nights Sat Oct 10 → Sun Oct 11 · 1 night at Pine rental');
    await page.waitFor(`document.querySelector('[role=dialog] input[name=who]')`, 8000);
    const selected = await page.run(choose, { who: ['Blair', 'Dana'], plan: 'Village hotel' });
    await page.run(press, 'Review nights');
    await page.waitFor(`[...document.querySelectorAll('[role=dialog] h3')].some((h) => h.innerText === 'Night preview')`, 15_000);
    await page.eval(`document.querySelector('[role=dialog] details')?.setAttribute('open', '')`);
    const preview = await page.eval(`[...document.querySelectorAll('[role=dialog] section')].map((el) => el.innerText).join('\\n')`);
    if (width === 390) await shot(page, 'stays-move-two-preview-390', { width: 390, height: 1500 });
    else await shot(page, 'stays-move-two-preview-1440', { width: 1440, height: 1100 });
    // Moving someone off a planned night replaces it, which the organizer confirms.
    const replace = await page.eval(`(() => { const box = [...document.querySelectorAll('[role=dialog] section input[type=checkbox]')][0]; if (box && !box.checked) box.click(); return box?.closest('label')?.innerText ?? null })()`);
    await page.run(press, 'Replace those nights and save');
    await page.waitFor(`document.querySelector('[role=dialog] [role=alert]')`, 15_000);
    const saveError = await page.eval(`document.querySelector('[role=dialog] [role=alert]')?.innerText`);
    const keptPreview = await page.eval(`[...document.querySelectorAll('[role=dialog] h3')].some((h) => h.innerText === 'Night preview')`);
    // Then someone else changes the plan first: the save is refused with 409 and offers the saved plan.
    await api('/__qa/overrides', { 'rpc:mutate_trip_lodging': { code: 'PT409', message: 'lodging_changed' } });
    await page.run(press, 'Replace those nights and save');
    await page.waitFor(`[...document.querySelectorAll('[role=dialog] button')].some((b) => b.innerText.includes('Review saved plan'))`, 15_000);
    const conflict = await page.eval(`({ alert: document.querySelector('[role=dialog] [role=alert]')?.innerText, buttons: [...document.querySelectorAll('[role=dialog] button')].map((b) => b.innerText.trim()).filter(Boolean) })`);
    results.failures.push({ check: `split stay: move two people for one night, preview, failed save, conflict (${width})`, selected, preview, replace, saveError, keptPreview, conflict });
  }
  await api('/__qa/overrides', undefined, 'DELETE');
  await save();
}

async function focusChecks(page) {
  const { trip, day } = JOURNEYS.downhill;
  await signIn(page, 'user-alex');
  for (const width of [390, 1440]) {
    await emulate(page, { width });
    // Inline editor: Edit notes → Cancel returns focus to Edit notes.
    await visit(page, PAGES.day(trip, day));
    await page.eval(`document.getElementById('day-notes-${day}')?.focus()`);
    await key(page, 'Enter', 'Enter', 13);
    await page.waitFor(`document.querySelector('textarea[name=notes]')`);
    const inEditor = await page.eval('document.activeElement?.name');
    await page.run(press, 'Cancel');
    await sleep(300);
    results.focus.push({ check: 'day notes: Enter opens with focus in the field, Cancel returns to Edit notes', width, inEditor, returned: await page.eval('document.activeElement?.id') });
    // Overlay editors on Stays: open by keyboard, Escape, focus back.
    await visit(page, PAGES.stays(trip));
    const triggers = await page.eval(`[...document.querySelectorAll('#main-content button')].filter((b) => b.getBoundingClientRect().height > 0).map((b) => b.getAttribute('aria-label') || b.innerText.trim()).filter(Boolean)`);
    for (const label of triggers.filter((name) => /^(Add stay|Change|Edit|Move|Who)/.test(name)).slice(0, 3)) {
      await visit(page, PAGES.stays(trip));
      await page.eval(`(() => { const b = [...document.querySelectorAll('#main-content button')].find((el) => (el.getAttribute('aria-label') || el.innerText.trim()) === ${JSON.stringify(label)} && el.getBoundingClientRect().height > 0); b.scrollIntoView({block:'center'}); b.focus(); })()`);
      await key(page, 'Enter', 'Enter', 13);
      await page.waitFor(`document.querySelector('[role=dialog]')`, 5000);
      const opened = await page.eval(`(() => { const d = document.querySelector('[role=dialog]'); return d ? { title: d.querySelector('h2, [data-slot$=title]')?.innerText, focusInside: d.contains(document.activeElement) } : null })()`);
      await key(page, 'Escape', 'Escape', 27);
      await page.waitFor(`!document.querySelector('[role=dialog]')`, 5000);
      await sleep(400);
      const back = await page.eval(`document.activeElement === document.body ? 'body' : (document.activeElement.getAttribute('aria-label') || document.activeElement.innerText || document.activeElement.id || document.activeElement.tagName).trim().slice(0, 60)`);
      results.focus.push({ check: `stays editor "${label}": Escape returns focus`, width, opened, returned: back });
    }
  }
  await save();
}

async function shots(page) {
  const { trip, day } = JOURNEYS.downhill;
  const bc = JOURNEYS.backcountry;
  const list = [
    ['downhill-day-member-390-light', 'user-blair', PAGES.day(trip, day), 390, 'light'],
    ['downhill-day-member-390-dark', 'user-blair', PAGES.day(trip, day), 390, 'dark'],
    ['downhill-day-casey-390-light', 'user-casey', PAGES.day(trip, day), 390, 'light'],
    ['downhill-day-eli-sunday-320-light', 'user-eli', PAGES.day(trip, '2026-10-11'), 320, 'light'],
    ['downhill-plan-organizer-1440-light', 'user-alex', PAGES.day(trip, day), 1440, 'light'],
    ['downhill-stays-organizer-1440-light', 'user-alex', PAGES.stays(trip), 1440, 'light'],
    ['downhill-stays-member-390-dark', 'user-blair', PAGES.stays(trip), 390, 'dark'],
    ['downhill-crew-organizer-390-light', 'user-alex', PAGES.crew(trip), 390, 'light'],
    ['downhill-rollcall-organizer-1024-light', 'user-alex', PAGES.rollcall(trip), 1024, 'light'],
    ['backcountry-day-member-390-light', 'user-blair', PAGES.day(bc.trip, bc.day), 390, 'light'],
    ['backcountry-day-member-1440-dark', 'user-blair', PAGES.day(bc.trip, bc.day), 1440, 'dark'],
    ['backcountry-hut-nodrive-390-light', 'user-blair', PAGES.day(bc.trip, '2027-01-10'), 390, 'light'],
    ['backcountry-driveout-noroute-390-light', 'user-blair', PAGES.day(bc.trip, '2027-01-11'), 390, 'light'],
    ['backcountry-packing-member-768-light', 'user-blair', PAGES.packing(bc.trip), 768, 'light'],
    ['long-names-stays-organizer-320-light', 'user-alex', PAGES.stays('qa337-downhill-long'), 320, 'light'],
  ];
  for (const [name, viewer, path, width, scheme] of list) {
    await signIn(page, viewer);
    await emulate(page, { width, scheme, dpr: 2 });
    await visit(page, path);
    await shot(page, name, { width, scheme });
    process.stdout.write(`shot ${name}\n`);
  }
  // 200% text and 400% reflow.
  await signIn(page, 'user-blair');
  await emulate(page, { width: 390, fontSize: 32 });
  await visit(page, PAGES.day(trip, day));
  await shot(page, 'downhill-day-member-390-200pct-text', { width: 390, fontSize: 32 });
  await emulate(page, { width: 320, height: 256, mobile: false, touch: false });
  await visit(page, PAGES.day(bc.trip, bc.day));
  await shot(page, 'backcountry-day-member-400pct-reflow', { width: 320, mobile: false, touch: false });
  await save();
}

// ---------------------------------------------------------------- main

await mkdir(OUT, { recursive: true });
const browser = await openBrowser();
results.meta = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  chrome: browser.version.Browser, userAgent: browser.version['User-Agent'],
  os: `${execFileSync('sw_vers', ['-productName']).toString().trim()} ${execFileSync('sw_vers', ['-productVersion']).toString().trim()}`,
  node: process.version, started: new Date().toISOString(), base: BASE, groups: [...groups],
};
const page = await newPage(browser.cdp);
try {
  if (groups.has('layout')) await layoutChecks(page);
  if (groups.has('a11y')) await a11yChecks(page);
  if (groups.has('text')) await textChecks(page);
  if (groups.has('motion')) await motionChecks(page);
  if (groups.has('journeys')) await journeyChecks(page);
  if (groups.has('failures')) await failureChecks(page);
  if (groups.has('focus')) await focusChecks(page);
  if (groups.has('shots')) await shots(page);
} finally {
  results.meta.finished = new Date().toISOString();
  await save();
  await api('/__qa/overrides', undefined, 'DELETE').catch(() => {});
  await browser.close();
}
console.log(`Wrote ${join(OUT, 'results.json')}`);
