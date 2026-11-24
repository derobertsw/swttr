"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Share2, HelpCircle, Menu, MessageSquare, Settings } from "lucide-react";
import { shareApp } from "@/lib/share-app";
import { AccountMenu, type AccountMenuHandle } from "@/components/AccountMenu";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";
import { useNativeShell } from "@/hooks/useNativeShell";
import { isShown, useReturnFocus } from "@/hooks/useReturnFocus";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onLogoClick?: () => void;
  variant?: "default" | "compact";
}

// The sidebar's avatar or Sign in link (see AppSidebar).
const SIDEBAR_ACCOUNT_CONTROL = "[data-account-control] a[href], [data-account-control] button";

const MENU_ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&>svg]:size-5 [&>svg]:text-muted-foreground";

const Header = ({ onLogoClick, variant = "default" }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const menuButtonId = useId();
  const accountAreaRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<AccountMenuHandle>(null);
  const pendingPreferences = useRef<number | null>(null);
  const preferencesFocus = useReturnFocus();
  // The native shell has no web sidebar, so its header shows at every width.
  const nativeShell = useNativeShell();
  const isNativeShell = nativeShell !== null;
  const mobileOnly = isNativeShell ? undefined : "md:hidden";
  // Sign-in and sign-up link to each other and keep the return path; a bare
  // Sign in link there would drop it.
  const pathname = usePathname();
  const showSignIn = !/^\/sign-(in|up)(\/|$)/.test(pathname);
  const {
    sensitivity,
    defaultActivity,
    bodyMetricsSelection,
    updateSensitivity,
    updateDefaultActivity,
    updateBodyMetrics,
  } = usePreferences();

  const menuButton = useCallback(() => document.getElementById(menuButtonId), [menuButtonId]);
  // The avatar, while signed in.
  const accountControl = useCallback(() => accountAreaRef.current?.querySelector<HTMLElement>("a[href], button") ?? null, []);
  // Where focus can go when a control that opened an overlay has since been
  // hidden: the menu button and the avatar here, or the sidebar's account
  // control once the window is wide enough to hide this header.
  const firstShown = useCallback(
    (...controls: Array<HTMLElement | null>) =>
      [...controls, document.querySelector<HTMLElement>(SIDEBAR_ACCOUNT_CONTROL)].find(isShown) ?? null,
    []
  );

  const openPreferencesFromMenu = useCallback(() => {
    if (pendingPreferences.current !== null) return;
    // The menu, and its Settings item, close first, so focus returns to the
    // menu button, or to the account control if the window has since widened.
    preferencesFocus.remember(() => firstShown(menuButton(), accountControl()));
    setMobileMenuOpen(false);
    pendingPreferences.current = window.setTimeout(() => {
      pendingPreferences.current = null;
      setPreferencesOpen(true);
    }, 120);
  }, [preferencesFocus, menuButton, accountControl, firstShown]);

  const openPreferencesFromAvatar = useCallback(() => {
    // The avatar's menu item is gone, so focus returns to the avatar, or to
    // whatever replaced it after a sign-out.
    preferencesFocus.remember(() => firstShown(accountControl(), menuButton()));
    setPreferencesOpen(true);
  }, [preferencesFocus, menuButton, accountControl, firstShown]);

  useEffect(() => () => {
    if (pendingPreferences.current !== null) window.clearTimeout(pendingPreferences.current);
  }, []);

  useEffect(() => {
    if (nativeShell !== "mac") return;
    const openPreferences = () => {
      if (preferencesOpen || pendingPreferences.current !== null) return;
      if (mobileMenuOpen) openPreferencesFromMenu();
      else if (accountMenuRef.current) accountMenuRef.current.openSettings();
      else openPreferencesFromAvatar();
    };
    window.addEventListener("openPreferences", openPreferences);
    return () => window.removeEventListener("openPreferences", openPreferences);
  }, [nativeShell, preferencesOpen, mobileMenuOpen, openPreferencesFromMenu, openPreferencesFromAvatar]);

  return (
    <header className={cn(
      "flex w-full items-center justify-between",
      variant === "compact" ? "gap-3" : "gap-4",
      // On desktop web the sidebar has the wordmark, the account control and
      // everything in the menu, so this row leaves the page (#267).
      mobileOnly
    )}>
      <div className="flex items-center gap-2">
        {/* Mobile: show logo. It's a wordmark, so it keeps its pixel size when
            the text is enlarged; in rem, 200% text pushed the menu button
            past a phone's edge (#337). */}
        <Link href="/" onClick={onLogoClick} className={cn("rounded-control", mobileOnly)}>
          <span
            className={cn(
              "block leading-none font-bold text-foreground",
              variant === "compact"
                ? "text-[32px] tracking-[0.16em]"
                : "text-[40px] tracking-[0.2em]"
            )}
          >
            SWTTR
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {/* Signed out, Sign in is in the menu. */}
        <div ref={accountAreaRef} className="flex items-center gap-4">
          <SignedIn>
            <AccountMenu ref={accountMenuRef} onOpenSettings={openPreferencesFromAvatar} onShare={shareApp} />
          </SignedIn>
        </div>

        {/* Mobile: hamburger menu */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className={mobileOnly}>
            <Button id={menuButtonId} variant="ghost" size="icon" className="rounded-full">
              <Menu className="size-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-64"
            onCloseAutoFocus={(event) => {
              // The window widened past md while the menu was open, which
              // hid the menu button, so focus the account control instead.
              if (isShown(menuButton())) return;
              event.preventDefault();
              firstShown(accountControl())?.focus({ preventScroll: true });
            }}
          >
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription className="sr-only">Settings, help and sharing</SheetDescription>
            </SheetHeader>
            <nav aria-label="Menu" className="flex flex-col gap-1 px-2 pb-4">
              {showSignIn && (
                <SignedOut>
                  <SheetClose asChild>
                    <Link
                      href="/sign-in"
                      className={MENU_ITEM_CLASS}
                    >
                      Sign in
                    </Link>
                  </SheetClose>
                </SignedOut>
              )}
              <button
                onClick={openPreferencesFromMenu}
                className={MENU_ITEM_CLASS}
              >
                <Settings />
                Settings
              </button>
              <SheetClose asChild>
                <Link
                  href="/faq"
                  className={MENU_ITEM_CLASS}
                >
                  <HelpCircle />
                  FAQ
                </Link>
              </SheetClose>
              <a
                href="/feedback"
                target="_blank"
                rel="noopener noreferrer"
                className={MENU_ITEM_CLASS}
              >
                <MessageSquare />
                Feedback
              </a>
              <button
                onClick={shareApp}
                className={MENU_ITEM_CLASS}
              >
                <Share2 />
                Share
              </button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <PreferencesDrawer
        sensitivity={sensitivity}
        defaultActivity={defaultActivity}
        heightInches={bodyMetricsSelection.heightInches}
        weightLbs={bodyMetricsSelection.weightLbs}
        onSensitivityChange={updateSensitivity}
        onDefaultActivityChange={updateDefaultActivity}
        onBodyMetricsChange={updateBodyMetrics}
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        onCloseAutoFocus={preferencesFocus.restore}
      />
    </header>
  );
};

export default Header;
