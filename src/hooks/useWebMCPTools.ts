"use client";

import { useLayoutEffect, useRef } from "react";
import { registerWebMCPTools, type WebMCPTool } from "@/lib/webmcp/adapter";

/** Page-owned registration; handlers change without re-registering metadata. */
export function useWebMCPTools(
  tools: readonly WebMCPTool[],
  scopeKey: string,
  enabled = process.env.NEXT_PUBLIC_ENABLE_WEBMCP === "true",
) {
  const current = useRef(tools);
  useLayoutEffect(() => {
    current.current = tools;
  }, [tools]);

  const manifest = JSON.stringify(tools.map(({ name, description, inputSchema, annotations }) => ({
    name, description, inputSchema, annotations,
  })));

  useLayoutEffect(() => {
    const definitions: Omit<WebMCPTool, "execute">[] = JSON.parse(manifest);
    const registration = registerWebMCPTools(definitions.map(definition => ({
      ...definition,
      execute: (input, options) => {
        options.signal.throwIfAborted();
        const handler = current.current.find(tool => tool.name === definition.name);
        if (!handler) throw new DOMException("Tool no longer available", "AbortError");
        return handler.execute(input, options);
      },
    })), enabled);
    return registration.dispose;
    // Changing accounts tears down callbacks and cancels all work before setup.
  }, [manifest, scopeKey, enabled]);
}
