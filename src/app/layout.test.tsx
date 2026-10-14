import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ClerkProvider } from "@clerk/nextjs";
import RootLayout from "./layout";
import { useNativeShell } from "@/hooks/useNativeShell";
import { NATIVE_SHELL_AUTH_APPEARANCE } from "@/lib/native-shell";

const request = vi.hoisted(() => ({ userAgent: "Mozilla/5.0" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": request.userAgent }) }));
vi.mock("@/assets/styles/globals.css", () => ({}));
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "geist" }), Geist_Mono: () => ({ variable: "mono" }) }));
vi.mock("@/components/TemperatureUnitProvider", () => ({ TemperatureUnitProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@clerk/nextjs", () => ({ ClerkProvider: vi.fn(({ children }) => children) }));

function ShellProbe() {
  return <span data-shell={useNativeShell() ?? "browser"} />;
}

describe("root native shell contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["Mozilla/5.0", "browser"],
    ["Mozilla/5.0 SWTTRNativeTabs", "ios"],
    ["Mozilla/5.0 SWTTRNativeMac/1", "mac"],
  ])("sets global Clerk appearance and the server shell for %s", async (userAgent, shell) => {
    request.userAgent = userAgent;
    // The request snapshot must win even when navigator differs during SSR.
    const html = renderToString(await RootLayout({ children: <ShellProbe /> }));
    expect(html).toContain(`data-shell="${shell}"`);
    expect(vi.mocked(ClerkProvider).mock.calls[0][0].appearance)
      .toEqual(shell === "browser" ? undefined : NATIVE_SHELL_AUTH_APPEARANCE);
  });
});
