// Minimal Chrome DevTools Protocol client for the #235 checks: headless
// Chrome, one isolated browser context per page, flat sessions, and dedicated
// workers auto-attached so MapLibre's tile/glyph requests can be observed and
// blocked too. Node 22+ has a global WebSocket, so there are no dependencies.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function launch({ args = [] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'qa235-chrome-'));
  // Port 0 lets Chrome pick a free port, so parallel QA runs never share a browser.
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--hide-scrollbars', '--mute-audio', ...args], { stdio: 'ignore' });
  let version;
  for (let attempt = 0; attempt < 100 && !version; attempt++) {
    try {
      const [port] = (await readFile(join(dir, 'DevToolsActivePort'), 'utf8')).split('\n');
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch { await sleep(100); }
  }
  if (!version) throw new Error('Chrome did not start');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((done, fail) => { ws.onopen = done; ws.onerror = fail; });
  return new Browser(ws, proc, dir, version.Browser);
}

class Browser {
  constructor(ws, proc, dir, product) {
    Object.assign(this, { ws, proc, dir, product, id: 0, calls: new Map(), sessions: new Map() });
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== undefined) {
        const call = this.calls.get(message.id);
        this.calls.delete(message.id);
        if (message.error) call?.fail(new Error(`${call.method}: ${message.error.message}`)); else call?.done(message.result);
      } else {
        this.sessions.get(message.sessionId)?.emit(message.method, message.params, message.sessionId);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...sessionId ? { sessionId } : {} }));
    // A call Chrome never answers fails loudly instead of stalling the run.
    return new Promise((done, fail) => {
      const timer = setTimeout(() => { this.calls.delete(id); fail(new Error(`${method}: no answer in 60 s`)); }, 60_000);
      this.calls.set(id, { done: (value) => { clearTimeout(timer); done(value); }, fail: (error) => { clearTimeout(timer); fail(error); }, method });
    });
  }
  async newPage() {
    const { browserContextId } = await this.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId, targetId, browserContextId);
    await page.init();
    return page;
  }
  async close() {
    const exited = new Promise((done) => { if (this.proc.exitCode !== null) done(); else this.proc.once('exit', done); });
    try { await this.send('Browser.close'); } catch { /* already closed */ }
    await Promise.race([exited, sleep(5000)]);
    this.proc.kill();
    await rm(this.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
}

/** One page target; `sessions` holds it and every worker it starts. */
export class Page {
  constructor(browser, sessionId, targetId, contextId) {
    Object.assign(this, { browser, sessionId, targetId, contextId, listeners: new Map(), workers: new Set(), fetchPatterns: null, network: null, requests: [] });
    browser.sessions.set(sessionId, this);
  }
  emit(method, params, sessionId) {
    for (const listener of this.listeners.get(method) ?? []) listener(params, sessionId);
    for (const listener of this.listeners.get('*') ?? []) listener(method, params, sessionId);
  }
  on(method, listener) {
    const list = this.listeners.get(method) ?? [];
    list.push(listener); this.listeners.set(method, list);
    return () => list.splice(list.indexOf(listener), 1);
  }
  send(method, params = {}, sessionId = this.sessionId) { return this.browser.send(method, params, sessionId); }
  async init() {
    this.on('Target.attachedToTarget', (params) => void this.attachChild(params));
    this.on('Network.requestWillBeSent', ({ requestId, request, type, timestamp }, session) =>
      this.requests.push({ requestId, session, url: request.url, method: request.method, type, start: timestamp }));
    this.on('Network.responseReceived', ({ requestId, response }) => { const entry = this.find(requestId); if (entry) entry.status = response.status; });
    this.on('Network.loadingFinished', ({ requestId, encodedDataLength, timestamp }) => { const entry = this.find(requestId); if (entry) Object.assign(entry, { bytes: encodedDataLength, end: timestamp }); });
    this.on('Network.loadingFailed', ({ requestId, errorText, canceled }) => { const entry = this.find(requestId); if (entry) Object.assign(entry, { failed: canceled ? 'canceled' : errorText }); });
    await Promise.all([this.send('Page.enable'), this.send('Runtime.enable'), this.send('Network.enable'), this.send('DOM.enable'), this.send('Accessibility.enable')]);
    await this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  }
  find(requestId) { for (let index = this.requests.length - 1; index >= 0; index--) if (this.requests[index].requestId === requestId) return this.requests[index]; }
  async attachChild({ sessionId, targetInfo, waitingForDebugger }) {
    this.browser.sessions.set(sessionId, this);
    if (targetInfo.type === 'worker') {
      this.workers.add(sessionId);
      await this.send('Network.enable', {}, sessionId).catch(() => {});
      if (this.network) await this.send('Network.emulateNetworkConditions', this.network, sessionId).catch(() => {});
      if (this.fetchPatterns) await this.send('Fetch.enable', { patterns: this.fetchPatterns }, sessionId).catch(() => {});
    }
    if (waitingForDebugger) await this.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
  }
  /** Intercepts matching requests in the page and its workers; `handler` answers each one. */
  async intercept(patterns, handler) {
    this.fetchPatterns = patterns.map((urlPattern) => ({ urlPattern, requestStage: 'Request' }));
    this.on('Fetch.requestPaused', (params, session) => void handler(params, session).catch((error) => {
      if (!/Invalid InterceptionId|No such|Target closed|session/i.test(error.message)) console.error('intercept', params.request.url, error.message);
    }));
    for (const session of [this.sessionId, ...this.workers]) await this.send('Fetch.enable', { patterns: this.fetchPatterns }, session);
  }
  fulfill(session, requestId, status, body, headers = { 'Content-Type': 'application/json' }) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return this.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: Object.entries({ 'Cache-Control': 'private, no-store', ...headers }).map(([name, value]) => ({ name, value })),
      body: Buffer.from(text).toString('base64') }, session);
  }
  async throttle({ cpu = 1, network = null }) {
    await this.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    this.network = network ? { offline: false, ...network } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
    for (const session of [this.sessionId, ...this.workers]) await this.send('Network.emulateNetworkConditions', this.network, session).catch(() => {});
  }
  async offline(offline) {
    this.network = { ...this.network ?? { latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, offline };
    for (const session of [this.sessionId, ...this.workers]) await this.send('Network.emulateNetworkConditions', this.network, session).catch(() => {});
  }
  async viewport(width, height, { dpr = 2, mobile = width < 768 } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  }
  media({ scheme = 'light', motion = 'no-preference' } = {}) {
    return this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: motion }] });
  }
  async goto(url, { wait = 'load' } = {}) {
    const loaded = new Promise((done) => { const off = this.on(wait === 'load' ? 'Page.loadEventFired' : 'Page.domContentEventFired', () => { off(); done(); }); });
    await this.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(30_000)]);
  }
  async eval(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (exceptionDetails) throw new Error(`eval: ${exceptionDetails.exception?.description ?? exceptionDetails.text}\n${expression.slice(0, 200)}`);
    return result.value;
  }
  async waitFor(expression, timeout = 15_000, step = 50) {
    const started = Date.now();
    for (;;) {
      if (await this.eval(`!!(${expression})`).catch(() => false)) return Date.now() - started;
      if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${expression.slice(0, 160)}`);
      await sleep(step);
    }
  }
  async key(key, { shift = false } = {}) {
    const codes = { Tab: [9, 'Tab'], Enter: [13, 'Enter'], ' ': [32, 'Space'], Escape: [27, 'Escape'], ArrowDown: [40, 'ArrowDown'] };
    const [keyCode, code] = codes[key];
    const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: shift ? 8 : 0 };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...key === 'Enter' ? { text: '\r' } : key === ' ' ? { text: ' ' } : {} });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  async mouse(type, x, y, extra = {}) { await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra }); }
  async drag(from, to, steps = 8) {
    await this.mouse('mousePressed', from[0], from[1]);
    for (let step = 1; step <= steps; step++) await this.mouse('mouseMoved', from[0] + (to[0] - from[0]) * step / steps, from[1] + (to[1] - from[1]) * step / steps, { buttons: 1 });
    await this.mouse('mouseReleased', to[0], to[1]);
  }
  async screenshot(path, { clip } = {}) {
    const { writeFile } = await import('node:fs/promises');
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...clip ? { clip: { ...clip, scale: 1 } } : {} });
    await writeFile(path, Buffer.from(data, 'base64'));
  }
  async close() {
    await this.browser.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    await this.browser.send('Target.disposeBrowserContext', { browserContextId: this.contextId }).catch(() => {});
  }
}
