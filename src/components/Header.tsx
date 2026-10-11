"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Share2, HelpCircle, Menu, MessageSquare, Settings } from "lucide-react";
import { toast } from "sonner";
import { logWarn } from "@/lib/logger";
import { AccountMenu } from "@/components/AccountMenu";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";
import { useNativeTabShell } from "@/hooks/useNativeTabShell";
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

const MENU_ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-base font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&>svg]:size-5 [&>svg]:text-muted-foreground";

const Header = ({ onLogoClick, variant = "default" }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const menuButtonId = useId();
  const accountAreaRef = useRef<HTMLDivElement>(null);
  const preferencesFocus = useReturnFocus();
  // The native shell has no web sidebar, so its menu and logo show at every width.
  const isNativeTabShell = useNativeTabShell();
  const mobileOnly = isNativeTabShell ? undefined : "md:hidden";
  const {
    sensitivity,
    defaultActivity,
    bodyMetricsSelection,
    updateSensitivity,
    updateDefaultActivity,
    updateBodyMetrics,
  } = usePreferences();

  const handleShare = async () => {
    const shareData = {
      title: "SWTTR",
      text: "Check out SWTTR - get clothing recommendations for outdoor activities!",
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          logWarn("Header.share", err);
        }
      }
    } else {
      await navigator.clipboard.writeText(shareData.url);
      toast.success("Link copied to clipboard!");
    }
  };

  const menuButton = () => document.getElementById(menuButtonId);
  // The avatar when signed in, or the Sign In link after a sign-out.
  const accountControl = () => accountAreaRef.current?.querySelector<HTMLElement>("a[href], button") ?? null;

  const openPreferencesFromMenu = () => {
    // The menu, and its Settings item, close first, so focus returns to the
    // menu button, or to the account area if the window has since widened.
    preferencesFocus.remember(() => [menuButton(), accountControl()].find(isShown) ?? null);
    setMobileMenuOpen(false);
    window.setTimeout(() => {
      setPreferencesOpen(true);
    }, 120);
  };

  const openPreferencesFromAvatar = () => {
    // The avatar's menu item is gone, so focus returns to the avatar, or to
    // whatever replaced it after a sign-out.
    preferencesFocus.remember(() => [accountControl(), menuButton()].find(isShown) ?? null);
    setPreferencesOpen(true);
  };

  return (
    <header className={cn(
      "flex w-full items-center justify-between",
      variant === "compact" ? "gap-3" : "gap-4"
    )}>
      <div className="flex items-center gap-2">
        {/* Mobile: show logo */}
        <Link href="/" onClick={onLogoClick} className={cn("rounded-control", mobileOnly)}>
          <span
            className={cn(
              "block leading-none font-bold text-foreground",
              variant === "compact"
                ? "text-[2rem] tracking-[0.16em]"
                : "text-[2.5rem] tracking-[0.2em]"
            )}
          >
            SWTTR
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {/* The avatar shows at every width. Below md, and in the native shell,
            Sign In is in the menu instead. */}
        <div ref={accountAreaRef} className="flex items-center gap-4">
          <SignedIn>
            <AccountMenu onOpenSettings={openPreferencesFromAvatar} onShare={handleShare} />
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              className={cn(
                "hidden min-h-11 items-center rounded-control px-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline",
                !isNativeTabShell && "md:inline-flex"
              )}
            >
              Sign In
            </Link>
          </SignedOut>
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
              // hid the menu button, so focus the account area instead.
              if (isShown(menuButton())) return;
              event.preventDefault();
              accountControl()?.focus({ preventScroll: true });
            }}
          >
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription className="sr-only">Settings, help and sharing</SheetDescription>
            </SheetHeader>
            <nav aria-label="Menu" className="flex flex-col gap-1 px-2 pb-4">
              <SignedOut>
                <SheetClose asChild>
                  <Link
                    href="/sign-in"
                    className={MENU_ITEM_CLASS}
                  >
                    Sign In
                  </Link>
                </SheetClose>
              </SignedOut>
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
                href="https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor"
                target="_blank"
                rel="noopener noreferrer"
                className={MENU_ITEM_CLASS}
              >
                <MessageSquare />
                Feedback
              </a>
              <button
                onClick={handleShare}
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
