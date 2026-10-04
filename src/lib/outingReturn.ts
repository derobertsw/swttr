/**
 * Where sign-in and Wardrobe send a person back to, so they pick up an outing
 * where they left it (#168, see docs/outing-contract.md). A return path names
 * a page and what to do there, never the outing itself: the outing stays in
 * the tab's kept draft (src/lib/gearUpDraft.ts), out of URLs.
 */

/** Gear up's search param for asking again for the kept last outing. */
export const RESUME_PARAM = "resume";
/** Gear up, asking again for the last outing: where sign-in and Wardrobe return to. */
export const RESUME_OUTING_PATH = `/?${RESUME_PARAM}=outing`;

/** Wardrobe's search param for the outing it was opened from. */
export const FROM_PARAM = "from";
/** Wardrobe, opened from an outing's results, which it offers a way back to. */
export const WARDROBE_FROM_OUTING_PATH = `/wardrobe?${FROM_PARAM}=outing`;

/** Sign-in that returns to `returnTo` afterwards. */
export function signInHref(returnTo: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}

/** The pages sign-in and sign-up may return to. */
const RETURN_PAGES = [/^\/$/, /^\/wardrobe$/, /^\/faq$/, /^\/trips(\/[\w-]+)*$/];

/**
 * The page to go to after signing in or up, from a `redirect_url` anyone could
 * have written: a path, or a full URL on this site's `host`, which is what
 * Clerk sends from a protected page. Anything else, like another site, an API
 * route or sign-in itself, goes to Gear up.
 */
export function safeReturnPath(redirectUrl: string | string[] | undefined, host: string | null): string {
  if (typeof redirectUrl !== "string") return "/";
  try {
    const base = new URL(`https://${host ?? "swttr.invalid"}`);
    const url = new URL(redirectUrl, base);
    const sameSite = url.host === base.host && (url.protocol === "https:" || url.protocol === "http:");
    if (!sameSite || !RETURN_PAGES.some((page) => page.test(url.pathname))) return "/";
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}
