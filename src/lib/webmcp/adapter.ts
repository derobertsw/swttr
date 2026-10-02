"use client";

// Local subset of the September 30, 2026 WebMCP draft. Do not augment DOM globals
// while the experimental API is still changing.
export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => unknown | Promise<unknown>;
}

interface ModelContext {
  registerTool(tool: WebMCPTool, options: { signal: AbortSignal }): Promise<void>;
  getTools: (...args: unknown[]) => unknown;
  executeTool: (...args: unknown[]) => unknown;
}

const owners = new WeakMap<ModelContext, Set<string>>();

function getModelContext(): ModelContext | null {
  if (typeof document === "undefined") return null;
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  // Discovery/execution distinguish the selected revision from early API shapes.
  return context && typeof context.registerTool === "function"
    && typeof context.getTools === "function" && typeof context.executeTool === "function"
    ? context : null;
}

/** Register one page's tools. Cleanup is synchronous, including pending work. */
export function registerWebMCPTools(tools: readonly WebMCPTool[], enabled: boolean) {
  const inactive = { ready: Promise.resolve(false), dispose: () => {} };
  if (!enabled || tools.length === 0) return inactive;

  let context: ModelContext | null;
  try {
    context = getModelContext();
  } catch {
    return inactive;
  }
  if (!context) return inactive;

  const names = tools.map(tool => tool.name);
  const claimed = owners.get(context) ?? new Set<string>();
  if (new Set(names).size !== names.length || names.some(name => claimed.has(name))) {
    return inactive;
  }
  owners.set(context, claimed);
  names.forEach(name => claimed.add(name));

  const lifetime = new AbortController();
  const executions = new Set<AbortController>();
  const dispose = () => {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    for (const execution of executions) execution.abort();
    executions.clear();
    names.forEach(name => claimed.delete(name));
  };

  const ready = Promise.all(tools.map(async tool => {
    await context.registerTool({
      ...tool,
      async execute(input, options) {
        lifetime.signal.throwIfAborted();
        // Never run an application action through an incompatible callback API.
        if (!options?.signal) throw new DOMException("Missing execution signal", "NotSupportedError");
        options.signal.throwIfAborted();
        const execution = new AbortController();
        const cancel = () => execution.abort(options.signal.reason);
        options.signal.addEventListener("abort", cancel, { once: true });
        executions.add(execution);
        try {
          const result = await tool.execute(input, { signal: execution.signal });
          // Suppress late results even if the application ignored cancellation.
          execution.signal.throwIfAborted();
          return result;
        } finally {
          executions.delete(execution);
          options.signal.removeEventListener("abort", cancel);
        }
      },
    }, { signal: lifetime.signal });
  })).then(() => !lifetime.signal.aborted).catch(() => {
    // A partial tool set must not remain discoverable after registration fails.
    dispose();
    return false;
  });

  return { ready, dispose };
}
