// Native Chrome smoke test; no polyfill, application credentials, or real tools.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const chromeBin = process.env.CHROME_BIN
  ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const profile = await mkdtemp(join(tmpdir(), "swttr-webmcp-"));
const source = await readFile(new URL("../src/lib/webmcp/adapter.ts", import.meta.url), "utf8");
const adapter = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const server = createServer((request, response) => {
  response.setHeader("Permissions-Policy", "tools=(self)");
  response.setHeader("Content-Type", request.url === "/adapter.js" ? "text/javascript" : "text/html");
  response.end(request.url === "/adapter.js" ? adapter : "<!doctype html><title>SWTTR WebMCP fixture</title>");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(chromeBin, [
  "--headless", "--no-first-run", "--no-default-browser-check",
  "--enable-features=WebMCPTesting", "--enable-blink-features=WebMCP",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Chrome startup timed out")), 15000);
    let output = "";
    chrome.once("error", error => { clearTimeout(timeout); reject(error); });
    chrome.once("exit", code => { clearTimeout(timeout); reject(new Error(`Chrome exited: ${code}`)); });
    chrome.stderr.on("data", chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const origin = new URL(endpoint).origin.replace("ws:", "http:");
  const pages = await (await fetch(`${origin}/json/list`)).json();
  const page = pages.find(page => page.type === "page" && page.url.startsWith(url));
  assert.ok(page, "Chrome must open the local fixture page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { socket.removeEventListener("message", receive); reject(new Error(`${method} timed out`)); }, 15000);
    const receive = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", receive);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
    socket.addEventListener("message", receive);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await call("Page.enable", {});
  const loaded = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.removeEventListener("message", receive); reject(new Error("Fixture load timed out")); }, 15000);
    const receive = event => {
      if (JSON.parse(event.data).method !== "Page.loadEventFired") return;
      clearTimeout(timeout);
      socket.removeEventListener("message", receive);
      resolve();
    };
    socket.addEventListener("message", receive);
  });
  await call("Page.navigate", { url });
  await loaded;
  const version = await call("Browser.getVersion", {});
  const result = await call("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const { registerWebMCPTools } = await import('/adapter.js');
      const context = document.modelContext;
      if (!context?.getTools || !context?.executeTool) throw new Error('Selected document.modelContext API is unavailable');
      const fixture = {
        name: 'swttr_smoke_fixture', description: 'Echo a fixture message',
        inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
        annotations: { readOnlyHint: true },
        execute: (input, { signal }) => { signal.throwIfAborted(); return { message: input.message }; },
      };
      const probeController = new AbortController();
      const probe = context.registerTool({ ...fixture, name: 'swttr_revision_probe' }, { signal: probeController.signal });
      const asynchronousRegistration = typeof probe?.then === 'function';
      await probe;
      probeController.abort();
      const disabled = registerWebMCPTools([fixture], false);
      if (await disabled.ready || (await context.getTools()).length) throw new Error('Disabled adapter registered tools');
      const registration = registerWebMCPTools([fixture], true);
      if (!await registration.ready) throw new Error('Registration failed');
      const tools = await context.getTools();
      const tool = tools.find(tool => tool.name === fixture.name);
      if (!tool) throw new Error('Fixture is missing from discovery');
      // Chrome 154's consumer takes JSON text; the draft takes an object.
      const value = JSON.parse(await context.executeTool(tool, JSON.stringify({ message: 'native Chrome' })));
      if (value.message !== 'native Chrome') throw new Error('Wrong tool result');
      registration.dispose();
      if ((await context.getTools()).some(tool => tool.name === fixture.name)) throw new Error('Fixture leaked after cleanup');
      const pending = registerWebMCPTools([fixture], true);
      pending.dispose();
      const remount = registerWebMCPTools([fixture], true);
      if (await pending.ready || !await remount.ready) throw new Error('Pending registration/remount failed');
      remount.dispose();
      if ((await context.getTools()).length) throw new Error('Remount leaked tools');
      return { userAgent: navigator.userAgent, api: 'document.modelContext', asynchronousRegistration, registered: tools.map(tool => tool.name), result: value, removed: true, remounted: true };
    })()`,
  });
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify({ browser: version.product, ...result.result.value }, null, 2));
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
