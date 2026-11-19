// Headless Chrome for the #214 checks, over the DevTools Protocol, reusing
// #337's client (docs/qa/337-group-planning/cdp.mjs). Unlike #337, each run
// keeps its Chrome profile on disk, so a check can quit Chrome and start a new
// process on the same profile: the service worker, its caches and IndexedDB
// carry over as they would after a restart.
import { spawn } from 'node:child_process';
import { Cdp, Page, BOOT, emulate, sleep, literal } from '../337-group-planning/cdp.mjs';

export { emulate, sleep, literal };
export const BASE = process.env.BASE ?? 'http://localhost:3433';
export const API = process.env.API ?? 'http://127.0.0.1:39214';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT ?? 9433);

/**
 * Starts Chrome on `profile`. `offline: true` points every request at a closed
 * proxy port, localhost included, from the process's first request: the page,
 * its service worker and any other fetch all fail as with no network.
 */
export async function launch(profile, { offline = false } = {}) {
  const args = ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--metrics-recording-only'];
  if (offline) args.push('--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>');
  const chrome = spawn(CHROME, [...args, 'about:blank'], { stdio: 'ignore' });
  let version;
  for (let attempt = 0; attempt < 80 && !version; attempt += 1) {
    version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
    if (!version) await sleep(250);
  }
  if (!version) throw new Error('Chrome did not start');
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  const exited = new Promise((done) => chrome.once('exit', done));
  return {
    cdp, version: version.Browser,
    /** Quits Chrome the way a person does, then waits for the process to end. */
    async quit() {
      await cdp.send('Browser.close').catch(() => undefined);
      await Promise.race([exited, sleep(8000)]);
      if (chrome.exitCode === null) { chrome.kill('SIGKILL'); await exited; }
      await sleep(300);
    },
  };
}

/** A new tab. `offline` also makes the page itself report no network (navigator.onLine false). */
export async function newTab(browser, { width = 1280, height = 900, fontSize = 16, offline = false } = {}) {
  const { cdp } = browser;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(cdp, sessionId);
  page.targetId = targetId;
  page.console = [];
  page.requests = [];
  cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Page.javascriptDialogOpening') void page.send('Page.handleJavaScriptDialog', { accept: true });
    if (message.method === 'Runtime.exceptionThrown') page.console.push(`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`.slice(0, 300));
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      page.console.push(`console.error: ${message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`.slice(0, 300));
    }
    if (message.method === 'Network.requestWillBeSent') page.requests.push(message.params.request.url);
  });
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await page.send('Page.bringToFront');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await emulate(page, { width, height, fontSize });
  if (offline) await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  return page;
}

export async function signInAs(page, viewer) {
  if (viewer) await page.send('Network.setCookie', { name: 'qa337_viewer', value: viewer, url: BASE });
  else await page.send('Network.deleteCookies', { name: 'qa337_viewer', url: BASE });
}

/** Navigates and waits for the page to load and its fetches to finish. */
export async function go(page, path, { settle = 500, timeout = 30_000 } = {}) {
  page.console.length = 0;
  const result = await page.send('Page.navigate', { url: path.startsWith('http') || path.startsWith('chrome') ? path : `${BASE}${path}` });
  if (result.errorText) return { error: result.errorText };
  await page.waitFor(`document.readyState === 'complete'`, timeout);
  const start = Date.now();
  let quietSince = 0;
  while (Date.now() - start < timeout) {
    const busy = await page.eval(`(window.__qaInflight ?? 0) > 0`).catch(() => true);
    if (!busy) { if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince >= settle) break; } else quietSince = 0;
    await sleep(100);
  }
  return { error: null };
}

export const text = (page, selector = 'body') => page.eval(`document.querySelector(${literal(selector)})?.innerText ?? ''`);

/** Clicks the visible button or link whose text (or accessible name) is exactly `name`. */
export async function click(page, name, { within = 'body', role = 'button,a,[role=menuitem]' } = {}) {
  return page.eval(`(() => {
    const scope = document.querySelector(${literal(within)}) ?? document;
    const found = [...scope.querySelectorAll(${literal(role)})].find((el) => el.checkVisibility() && ((el.innerText ?? '').trim() === ${literal(name)} || el.getAttribute('aria-label') === ${literal(name)}));
    if (!found) return false;
    found.click();
    return true;
  })()`);
}

/** This device's saved briefs, read straight from IndexedDB without creating the database. */
export const readDevice = (page) => page.eval(`(async () => {
  if (!(await indexedDB.databases()).some((db) => db.name === 'swttr-offline')) return { exists: false, briefs: [], meta: [] };
  const db = await new Promise((done, fail) => { const r = indexedDB.open('swttr-offline'); r.onsuccess = () => done(r.result); r.onerror = () => fail(r.error); });
  const all = (store) => new Promise((done, fail) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => done(r.result); r.onerror = () => fail(r.error); });
  const out = { exists: true, briefs: await all('briefs'), meta: await all('meta'), hint: localStorage.getItem('swttr-offline-briefs-account') };
  db.close();
  return out;
})()`);

/** The service worker registrations and what each cache holds. */
export const readWorker = (page) => page.eval(`(async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const caches_ = {};
  for (const name of await caches.keys()) caches_[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
  return { scopes: registrations.map((r) => ({ scope: r.scope, active: r.active?.state ?? null, script: r.active?.scriptURL ?? null })), controller: navigator.serviceWorker.controller?.scriptURL ?? null, caches: caches_ };
})()`);

export async function api(path, body, method = 'POST') {
  return fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());
}

export async function key(page, name, { shift = false } = {}) {
  const codes = { Tab: 9, Enter: 13, Escape: 27, ' ': 32 };
  const base = { key: name, code: name === ' ' ? 'Space' : name, windowsVirtualKeyCode: codes[name] ?? 0, nativeVirtualKeyCode: codes[name] ?? 0, modifiers: shift ? 8 : 0 };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (name === 'Enter') await page.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...base });
  if (name === ' ') await page.send('Input.dispatchKeyEvent', { type: 'char', text: ' ', ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(80);
}

/** What has focus: its role-ish tag, accessible text and whether it shows a focus ring. */
export const focused = (page) => page.eval(`(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body' };
  const style = getComputedStyle(el);
  const name = el.getAttribute('aria-label') || (el.labels?.[0]?.innerText) || el.innerText || el.textContent || '';
  return { tag: el.tagName.toLowerCase(), type: el.type ?? null, name: name.trim().replace(/\\s+/g, ' ').slice(0, 120), ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none' };
})()`);

/** Whether the page scrolls sideways, and the widest element past the viewport. */
export const overflow = (page) => page.eval(`(() => {
  const width = document.documentElement.clientWidth;
  let widest = null;
  for (const el of document.querySelectorAll('body *')) {
    const box = el.getBoundingClientRect();
    if (box.width && box.right > width + 1 && el.checkVisibility() && (!widest || box.right > widest.right)) widest = { right: Math.round(box.right), tag: el.tagName.toLowerCase(), text: (el.innerText ?? '').slice(0, 60) };
  }
  return { viewport: width, scrollWidth: document.documentElement.scrollWidth, sideways: document.documentElement.scrollWidth > width + 1, widest };
})()`);
