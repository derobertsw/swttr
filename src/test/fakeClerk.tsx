import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A stand-in for `@clerk/nextjs` in component tests:
 * `vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule)`.
 *
 * Its UserButton menu behaves like Clerk's: it takes focus when it opens,
 * runs a custom action's onClick before it closes, and hands focus back to
 * the avatar in a microtask once it has closed. Like Clerk's, it always has
 * Manage account and Sign out: listing their labels only moves them, other
 * default items come first, and only `appearance.elements`
 * (`userButtonPopoverActionButton__<id>` with display none) hides one. Its
 * own Sign out signs out at once. It is no evidence that the real popover
 * behaves this way; check that in a browser.
 */
export const fakeClerkState = {
  /** False while Clerk hasn't loaded, as with no connection: nobody is known to be signed in or out. */
  loaded: true,
  signedIn: true,
  /** False when focus stays put as the menu closes, e.g. while the tab is hidden. */
  returnFocus: true,
  /** What useClerk().signOut does; a test can replace it with a spy. */
  signOut: async () => { fakeClerkState.signedIn = false; },
};

export function resetFakeClerk() {
  fakeClerkState.loaded = true;
  fakeClerkState.signedIn = true;
  fakeClerkState.returnFocus = true;
  fakeClerkState.signOut = async () => { fakeClerkState.signedIn = false; };
}

interface MenuItemProps {
  label: string;
  href?: string;
  onClick?: () => void;
}

/** Clerk's own items, in Clerk's order. */
const DEFAULT_ITEMS = ["manageAccount", "signOut"] as const;

// Markers, like Clerk's: the UserButton reads their props.
const MenuItems = () => null;
const MenuItem = () => null;

const CLERK_ITEM_NAMES: Record<string, string> = {
  manageAccount: "Manage account",
  signOut: "Sign out",
};

function listedItems(children: ReactNode): MenuItemProps[] {
  const items: MenuItemProps[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children: ReactNode }>(child) || child.type !== MenuItems) return;
    Children.forEach(child.props.children, (item) => {
      if (isValidElement<MenuItemProps>(item)) items.push(item.props);
    });
  });
  // Default items that aren't listed come first, as in Clerk.
  const listed = new Set(items.map((item) => item.label));
  return [...DEFAULT_ITEMS.filter((label) => !listed.has(label)).map((label) => ({ label })), ...items];
}

type Appearance = { elements?: Record<string, { display?: string; "&&"?: { display?: string } }> };

/** Whether `appearance` hides one of Clerk's own items. */
const hiddenByAppearance = (appearance: Appearance | undefined, label: string) => {
  const style = appearance?.elements?.[`userButtonPopoverActionButton__${label}`];
  return style?.display === "none" || style?.["&&"]?.display === "none";
};

function FakeUserButton({ children, appearance }: { children?: ReactNode; appearance?: Appearance }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Like Clerk's focus manager, the first item that can take focus: not a hidden one.
    if (open) [...menu.current?.querySelectorAll("button") ?? []].find((button) => button.style.display !== "none")?.focus();
  }, [open]);

  const choose = (item: MenuItemProps) => {
    // Clerk's own Sign out signs out straight away.
    if (item.label === "signOut") void fakeClerkState.signOut();
    item.onClick?.();
    setOpen(false);
    if (fakeClerkState.returnFocus) queueMicrotask(() => trigger.current?.focus());
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Open user menu"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      />
      {open &&
        createPortal(
          <div ref={menu} role="menu" aria-label="User menu">
            {listedItems(children).map((item) => (
              <button key={item.label} type="button" role="menuitem" onClick={() => choose(item)}
                style={(DEFAULT_ITEMS as readonly string[]).includes(item.label) && hiddenByAppearance(appearance, item.label) ? { display: "none" } : undefined}>
                {CLERK_ITEM_NAMES[item.label] ?? item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export const fakeClerkModule = {
  SignedIn: ({ children }: { children: ReactNode }) => (fakeClerkState.signedIn ? <>{children}</> : null),
  SignedOut: ({ children }: { children: ReactNode }) => (fakeClerkState.signedIn ? null : <>{children}</>),
  UserButton: Object.assign(FakeUserButton, { MenuItems, Action: MenuItem, Link: MenuItem }),
  useAuth: () => ({ isLoaded: fakeClerkState.loaded, userId: fakeClerkState.loaded && fakeClerkState.signedIn ? "user_1" : null }),
  useClerk: () => ({ signOut: () => fakeClerkState.signOut() }),
};
