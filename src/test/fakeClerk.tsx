import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A stand-in for `@clerk/nextjs` in component tests:
 * `vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule)`.
 *
 * Its UserButton menu behaves like Clerk's: it takes focus when it opens,
 * runs a custom action's onClick before it closes, and hands focus back to
 * the avatar in a microtask once it has closed. It is no evidence that the
 * real popover behaves this way; check that in a browser.
 */
export const fakeClerkState = {
  signedIn: true,
  /** False when focus stays put as the menu closes, e.g. while the tab is hidden. */
  returnFocus: true,
};

export function resetFakeClerk() {
  fakeClerkState.signedIn = true;
  fakeClerkState.returnFocus = true;
}

interface MenuItemProps {
  label: string;
  href?: string;
  onClick?: () => void;
}

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
  return items.length > 0 ? items : [{ label: "manageAccount" }, { label: "signOut" }];
}

function FakeUserButton({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) menu.current?.querySelector("button")?.focus();
  }, [open]);

  const choose = (item: MenuItemProps) => {
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
              <button key={item.label} type="button" role="menuitem" onClick={() => choose(item)}>
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
  useAuth: () => ({ isLoaded: true, userId: fakeClerkState.signedIn ? "user_1" : null }),
};
