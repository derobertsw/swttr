/** User-agent markers are a UI contract, never an authentication boundary. */
export type NativeShell = "ios" | "mac" | null;

export function detectNativeShell(userAgent: string | null | undefined): NativeShell {
  // Mac wins if a shell supplies both markers: it owns a sidebar, not tabs.
  if (/(?:^|\s)SWTTRNativeMac\/1(?:\s|$)/.test(userAgent ?? "")) return "mac";
  if ((userAgent ?? "").includes("SWTTRNativeTabs")) return "ios";
  return null;
}

// Embedded OAuth leaves its session in the browser. Email code and password
// stay in the app's web view. Decide on the server to avoid a social-button flash.
export const NATIVE_SHELL_AUTH_APPEARANCE = {
  elements: {
    socialButtonsRoot: { display: "none" },
    dividerRow: { display: "none" },
    profileSection__connectedAccounts: { display: "none" },
  },
};
