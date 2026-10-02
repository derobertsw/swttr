import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWebMCPTools, type WebMCPTool } from "@/lib/webmcp/adapter";
import { useWebMCPTools } from "./useWebMCPTools";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function browser(pending = false) {
  const tools = new Map<string, WebMCPTool>();
  const signals: AbortSignal[] = [];
  const registrations: ReturnType<typeof deferred<void>>[] = [];
  const context = {
    registerTool: vi.fn((tool: WebMCPTool, { signal }: { signal: AbortSignal }) => {
      if (tools.has(tool.name)) return Promise.reject(new Error("Duplicate name"));
      signal.throwIfAborted();
      tools.set(tool.name, tool);
      signals.push(signal);
      const registration = deferred<void>();
      registrations.push(registration);
      signal.addEventListener("abort", () => {
        tools.delete(tool.name);
        registration.reject(signal.reason);
      }, { once: true });
      if (!pending) registration.resolve();
      return registration.promise;
    }),
    getTools: vi.fn(() => [...tools.values()]),
    executeTool: vi.fn(),
  };
  Object.defineProperty(document, "modelContext", { value: context, configurable: true });
  return { context, tools, signals, registrations };
}

function fixture(execute: WebMCPTool["execute"] = () => "fixture"): WebMCPTool {
  return {
    name: "swttr_fixture",
    description: "A test fixture",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute,
  };
}

function invoke(tool: WebMCPTool, signal = new AbortController().signal) {
  return tool.execute({}, { signal });
}

afterEach(() => {
  Reflect.deleteProperty(document, "modelContext");
  vi.unstubAllEnvs();
});

describe("WebMCP adapter", () => {
  it("does nothing with an absent or incompatible API", async () => {
    expect(await registerWebMCPTools([fixture()], true).ready).toBe(false);
    const registerTool = vi.fn();
    Object.defineProperty(document, "modelContext", { value: { registerTool }, configurable: true });
    expect(await registerWebMCPTools([fixture()], true).ready).toBe(false);
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("does not read a browser API when disabled", async () => {
    const read = vi.fn(() => { throw new Error("Must not read"); });
    Object.defineProperty(document, "modelContext", { get: read, configurable: true });
    expect(await registerWebMCPTools([fixture()], false).ready).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("handles a throwing capability getter", async () => {
    Object.defineProperty(document, "modelContext", {
      get: () => { throw new Error("Unavailable"); }, configurable: true,
    });
    expect(await registerWebMCPTools([fixture()], true).ready).toBe(false);
  });

  it("registers with a lifetime signal and retains same-origin defaults", async () => {
    const api = browser();
    const registration = registerWebMCPTools([fixture()], true);
    expect(await registration.ready).toBe(true);
    expect(api.context.registerTool.mock.calls[0][1]).toEqual({ signal: api.signals[0] });
    expect(await invoke(api.tools.get("swttr_fixture")!)).toBe("fixture");
    registration.dispose();
    registration.dispose();
    expect(api.signals[0].aborted).toBe(true);
    expect(api.tools.size).toBe(0);
  });

  it.each([false, true])("contains %s synchronous/asynchronous registration failure", async sync => {
    const api = browser();
    api.context.registerTool.mockImplementationOnce(() => {
      if (sync) throw new Error("Registration rejected");
      return Promise.reject(new Error("Registration rejected"));
    });
    expect(await registerWebMCPTools([fixture(), { ...fixture(), name: "second" }], true).ready).toBe(false);
    expect(api.tools.size).toBe(0);
    const remount = registerWebMCPTools([fixture()], true);
    expect(await remount.ready).toBe(true);
    remount.dispose();
  });

  it("does not let a second owner register or remove the same name", async () => {
    const api = browser();
    const first = registerWebMCPTools([fixture()], true);
    const second = registerWebMCPTools([fixture()], true);
    expect(await first.ready).toBe(true);
    expect(await second.ready).toBe(false);
    second.dispose();
    expect(api.tools.size).toBe(1);
    expect(api.context.registerTool).toHaveBeenCalledTimes(1);
    first.dispose();
  });

  it("rejects duplicate names within one set before registering", async () => {
    const api = browser();
    expect(await registerWebMCPTools([fixture(), fixture()], true).ready).toBe(false);
    expect(api.context.registerTool).not.toHaveBeenCalled();
  });

  it("aborts pending registration and allows an immediate remount", async () => {
    const api = browser(true);
    const old = registerWebMCPTools([fixture()], true);
    const oldTool = api.tools.get("swttr_fixture")!;
    old.dispose();
    const next = registerWebMCPTools([fixture()], true);
    api.registrations[1].resolve();
    expect(await old.ready).toBe(false);
    expect(await next.ready).toBe(true);
    expect(api.tools.size).toBe(1);
    await expect(invoke(oldTool)).rejects.toMatchObject({ name: "AbortError" });
    next.dispose();
  });

  it("forwards invocation cancellation without removing registration", async () => {
    const api = browser();
    const work = deferred<string>();
    let actionSignal!: AbortSignal;
    const registration = registerWebMCPTools([fixture((_, { signal }) => {
      actionSignal = signal;
      return work.promise;
    })], true);
    const invocation = new AbortController();
    const result = invoke(api.tools.get("swttr_fixture")!, invocation.signal);
    invocation.abort();
    expect(actionSignal.aborted).toBe(true);
    expect(api.signals[0].aborted).toBe(false);
    work.resolve("stale");
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(api.tools.size).toBe(1);
    registration.dispose();
  });

  it("cancels all active work on disposal and suppresses late results", async () => {
    const api = browser();
    const work = deferred<string>();
    const signals: AbortSignal[] = [];
    const registration = registerWebMCPTools([fixture((_, { signal }) => {
      signals.push(signal);
      return work.promise;
    })], true);
    const tool = api.tools.get("swttr_fixture")!;
    const results = [invoke(tool), invoke(tool)];
    registration.dispose();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    work.resolve("stale");
    for (const result of results) await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not start work for an already cancelled invocation", async () => {
    const api = browser();
    const execute = vi.fn();
    const registration = registerWebMCPTools([fixture(execute)], true);
    const controller = new AbortController();
    controller.abort();
    await expect(invoke(api.tools.get("swttr_fixture")!, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(execute).not.toHaveBeenCalled();
    registration.dispose();
  });

  it("contains application failures without breaking future invocations", async () => {
    const api = browser();
    const execute = vi.fn().mockRejectedValueOnce(new Error("Action failed")).mockResolvedValue("recovered");
    const registration = registerWebMCPTools([fixture(execute)], true);
    const tool = api.tools.get("swttr_fixture")!;
    await expect(invoke(tool)).rejects.toThrow("Action failed");
    expect(await invoke(tool)).toBe("recovered");
    registration.dispose();
  });
});

describe("useWebMCPTools", () => {
  it("defaults to off and only opts in with the exact public flag", () => {
    const api = browser();
    vi.stubEnv("NEXT_PUBLIC_ENABLE_WEBMCP", "false");
    const hook = renderHook(() => useWebMCPTools([fixture()], "anonymous"));
    expect(api.tools.size).toBe(0);
    vi.stubEnv("NEXT_PUBLIC_ENABLE_WEBMCP", "true");
    hook.rerender();
    expect(api.tools.size).toBe(1);
    hook.unmount();
    expect(api.tools.size).toBe(0);
  });

  it("survives Strict Mode with one discoverable tool and cleans up", async () => {
    const api = browser(true);
    const hook = renderHook(() => useWebMCPTools([fixture()], "anonymous", true), { wrapper: StrictMode });
    await act(async () => { api.registrations.forEach(registration => registration.resolve()); });
    expect(api.signals.map(signal => signal.aborted)).toEqual([true, false]);
    expect(api.tools.size).toBe(1);
    hook.unmount();
    expect(api.tools.size).toBe(0);
  });

  it("uses the latest committed handler without registering on each input change", async () => {
    const api = browser();
    const hook = renderHook(({ value }) => useWebMCPTools([fixture(() => value)], "anonymous", true), {
      initialProps: { value: "first" },
    });
    const tool = api.tools.get("swttr_fixture")!;
    hook.rerender({ value: "second" });
    expect(await invoke(tool)).toBe("second");
    expect(api.context.registerTool).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("invalidates callbacks and active work when the account changes or signs out", async () => {
    const api = browser();
    const work = deferred<string>();
    let signal!: AbortSignal;
    const hook = renderHook(({ account }) => useWebMCPTools([fixture((_, options) => {
      if (account !== "a") return account;
      signal = options.signal;
      return work.promise;
    })], account, true), { initialProps: { account: "a" } });
    const oldTool = api.tools.get("swttr_fixture")!;
    const oldResult = invoke(oldTool);
    hook.rerender({ account: "b" });
    expect(signal.aborted).toBe(true);
    await expect(invoke(oldTool)).rejects.toMatchObject({ name: "AbortError" });
    work.resolve("a's private snapshot");
    await expect(oldResult).rejects.toMatchObject({ name: "AbortError" });
    const accountBTool = api.tools.get("swttr_fixture")!;
    expect(await invoke(accountBTool)).toBe("b");
    hook.rerender({ account: "anonymous" });
    await expect(invoke(accountBTool)).rejects.toMatchObject({ name: "AbortError" });
    expect(await invoke(api.tools.get("swttr_fixture")!)).toBe("anonymous");
    hook.unmount();
  });

  it("replaces changed metadata and removes tools when disabled", () => {
    const api = browser();
    const hook = renderHook(({ description, enabled }) => useWebMCPTools([
      { ...fixture(), description },
    ], "anonymous", enabled), { initialProps: { description: "first", enabled: true } });
    hook.rerender({ description: "second", enabled: true });
    expect(api.tools.get("swttr_fixture")?.description).toBe("second");
    expect(api.context.registerTool).toHaveBeenCalledTimes(2);
    hook.rerender({ description: "second", enabled: false });
    expect(api.tools.size).toBe(0);
    hook.unmount();
  });
});
