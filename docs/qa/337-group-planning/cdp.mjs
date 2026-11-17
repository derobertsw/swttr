// Chrome DevTools Protocol helpers for the #337 harness (run.mjs): no
// dependencies, Node's own WebSocket.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BASE = process.env.BASE ?? 'http://localhost:3416';
export const API = process.env.API ?? 'http://127.0.0.1:3417';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT ?? 9337);

// The trips' fixed clocks, as in fixtures.ts.
export const PINS = { 'qa337-downhill': '2026-10-10T11:00:00Z', 'qa337-downhill-long': '2026-10-10T11:00:00Z', 'qa337-backcountry': '2027-01-09T12:00:00Z', 'qa337-solo': '2026-10-10T11:00:00Z' };


export class Cdp {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.listeners = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { done, fail } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(`${message.error.message} (${message.error.code})`)); else done(message.result);
      } else if (message.method) for (const listener of this.listeners) listener(message);
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((done, fail) => { socket.addEventListener('open', done); socket.addEventListener('error', fail); });
    return new Cdp(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((done, fail) => {
      const timer = setTimeout(() => { this.pending.delete(id); fail(new Error(`CDP ${method} timed out`)); }, 45_000);
      this.pending.set(id, { done: (value) => { clearTimeout(timer); done(value); }, fail: (error) => { clearTimeout(timer); fail(error); } });
    });
  }
  on(listener) { this.listeners.push(listener); }
}

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export class Page {
  constructor(cdp, sessionId) { this.cdp = cdp; this.sessionId = sessionId; }
  send(method, params) { return this.cdp.send(method, params, this.sessionId); }
  async eval(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`);
    return result.result.value;
  }
  async run(fn, ...args) { return this.eval(`(${fn.toString()})(...${JSON.stringify(args)})`); }
  async waitFor(expression, timeout = 20_000) {
    if (process.env.DEBUG) process.stdout.write(`  wait ${expression.slice(0, 90)}\n`);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.eval(`!!(${expression})`).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  }
}

export async function openBrowser() {
  const profile = await mkdtemp(join(tmpdir(), 'qa337-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let version;
  for (let attempt = 0; attempt < 60 && !version; attempt += 1) {
    version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
    if (!version) await sleep(250);
  }
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  return { cdp, version, close: async () => { chrome.kill(); await sleep(300); await rm(profile, { recursive: true, force: true }); } };
}

/** Clock pin, in-flight fetch counter, dev badge hidden: before any page script. */
export const BOOT = `(() => {
  const pins = ${JSON.stringify(PINS)};
  const pin = pins[location.pathname.split('/')[2]];
  if (pin) {
    const RealDate = Date, offset = RealDate.parse(pin) - RealDate.now();
    class FixtureDate extends RealDate {
      constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
      static now() { return RealDate.now() + offset; }
    }
    globalThis.Date = FixtureDate;
  }
  window.__qaInflight = 0;
  const realFetch = window.fetch.bind(window);
  window.fetch = (...args) => { window.__qaInflight += 1; return realFetch(...args).finally(() => { window.__qaInflight -= 1; }); };
  const style = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.documentElement.appendChild(s); };
  if (document.documentElement) style(); else document.addEventListener('DOMContentLoaded', style);
})();`;

export async function newPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(cdp, sessionId);
  page.targetId = targetId;
  page.console = [];
  cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Page.javascriptDialogOpening') void page.send('Page.handleJavaScriptDialog', { accept: true });
    if (message.method === 'Runtime.exceptionThrown') page.console.push(`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      page.console.push(`console.error: ${message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 300)}`);
    }
  });
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Accessibility.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  // A background tab pauses CSS animations, so closed overlays would never unmount.
  await page.send('Page.bringToFront');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return page;
}

/**
 * Viewport, pointer, appearance, motion and default text size. Phones are
 * mobile viewports; phones and tablets (under 1280px) have a touch screen, so
 * pointer-coarse sizes apply; 1280px and up is a mouse.
 */
export async function emulate(page, { width, height = 900, mobile = width < 768, touch = width < 1280, dpr = 1, scheme = 'light', motion = 'no-preference', fontSize = 16 }) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: motion }] });
  await page.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: Math.round(fontSize * 13 / 16) } });
}

export async function signIn(page, viewer) {
  await page.send('Network.setCookie', { name: 'qa337_viewer', value: viewer, url: BASE });
}

/** Loads a page and waits until it stops fetching and shows no skeleton. */
export async function visit(page, path, { settle = 600 } = {}) {
  if (process.env.DEBUG) process.stdout.write(`visit ${path}\n`);
  page.console.length = 0;
  await page.send('Page.navigate', { url: `${BASE}${path}` });
  await page.waitFor(`document.readyState === 'complete' && document.querySelector('#main-content')`, 30_000);
  const start = Date.now();
  let quietSince = 0;
  while (Date.now() - start < 30_000) {
    const busy = await page.eval(`window.__qaInflight > 0 || !!document.querySelector('#main-content [data-slot=skeleton], #main-content .animate-pulse')`).catch(() => true);
    if (!busy) { if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince >= settle) break; } else quietSince = 0;
    await sleep(100);
  }
}

export async function api(path, body, method = 'POST') {
  return fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.text());
}

export async function tab(page, shift = false) {
  const base = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: shift ? 8 : 0 };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(40);
}

export async function key(page, name, code = name, keyCode = 0) {
  const base = { key: name, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (name === 'Enter') await page.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(60);
}

