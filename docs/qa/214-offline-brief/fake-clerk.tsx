"use client";

/**
 * QA #214 preview build only. `preview-auth.mjs apply` aliases
 * `@clerk/nextjs` to this file for one `next build`, then `revert` takes the
 * alias out again. The app never imports it.
 *
 * It stands in for Clerk in the browser, so the real pages, the account menu,
 * OfflineBriefAccountGuard and Saved on this device can be driven with
 * fictional accounts and no Clerk session:
 *
 * - Who's signed in is the `qa337_viewer` cookie, which the fixture API
 *   (api.mjs) reads too. No cookie is signed out.
 * - Like Clerk's script, it loads only with a connection: it asks
 *   `/qa214/clerk` (answered by the fixture API) first, and stays not loaded
 *   when that fails, as Clerk does offline.
 * - The account menu is the test stand-in from `src/test/fakeClerk.tsx`,
 *   which keeps Clerk's own Sign out (hidden through `appearance`, as the app
 *   hides it). It's no evidence of the real Clerk popover.
 * - Signing out clears the cookie and goes to `/`, as Clerk's `signOut()` does.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fakeClerkModule, fakeClerkState } from "@/test/fakeClerk";

type Session = { isLoaded: boolean; userId: string | null };

const SessionContext = createContext<Session>({ isLoaded: false, userId: null });
const viewer = () => /(?:^|;\s*)qa337_viewer=([^;]+)/.exec(document.cookie)?.[1] ?? null;

async function signOut(options?: { redirectUrl?: string }) {
  document.cookie = "qa337_viewer=; Max-Age=0; path=/";
  window.location.assign(options?.redirectUrl ?? "/");
}
fakeClerkState.signOut = () => signOut();

export function ClerkProvider({ children }: { children: ReactNode; appearance?: unknown }) {
  const [session, setSession] = useState<Session>({ isLoaded: false, userId: null });
  useEffect(() => {
    let current = true;
    fetch("/qa214/clerk", { cache: "no-store" }).then(
      () => { if (current) setSession({ isLoaded: true, userId: viewer() }); },
      () => undefined,
    );
    return () => { current = false; };
  }, []);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useAuth() {
  const { isLoaded, userId } = useContext(SessionContext);
  return { isLoaded, userId, sessionId: userId ? `sess-${userId}` : null, isSignedIn: isLoaded ? !!userId : undefined };
}

export function useUser() {
  const { isLoaded, userId } = useContext(SessionContext);
  return {
    isLoaded,
    isSignedIn: isLoaded ? !!userId : undefined,
    user: userId ? { id: userId, fullName: userId, primaryEmailAddress: { emailAddress: `${userId}@example.test` } } : null,
  };
}

export const useClerk = () => ({ signOut });

export function SignedIn({ children }: { children: ReactNode }) {
  return useContext(SessionContext).userId ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useContext(SessionContext);
  return isLoaded && !userId ? <>{children}</> : null;
}

export const UserButton = fakeClerkModule.UserButton;

export function SignIn() {
  return <p>Sign-in is stubbed in this QA build.</p>;
}

export function SignUp() {
  return <p>Sign-up is stubbed in this QA build.</p>;
}
