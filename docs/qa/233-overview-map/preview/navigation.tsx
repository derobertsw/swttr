import { useSyncExternalStore } from "react";
const subscribe = (cb: () => void) => { window.addEventListener("popstate", cb); return () => window.removeEventListener("popstate", cb); };
export function useSearchParams() { return new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)); }
