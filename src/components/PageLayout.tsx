"use client";

import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import Header from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileTabBar } from "@/components/AppNavigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useMigrateUser } from "@/hooks/useMigrateUser";
import { useNativeTabShell } from "@/hooks/useNativeTabShell";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: ReactNode;
  onLogoClick?: () => void;
  chromeVariant?: "default" | "compact";
}

// The sidebar shows labels from 1024px and icons only from 768px to 1023px.
const SIDEBAR_EXPANDED_MIN_WIDTH = 1024;

function subscribeToSidebarWidth(onChange: () => void) {
  const mql = window.matchMedia(`(min-width: ${SIDEBAR_EXPANDED_MIN_WIDTH}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function useIsSidebarWide() {
  return useSyncExternalStore(
    subscribeToSidebarWidth,
    () => window.innerWidth >= SIDEBAR_EXPANDED_MIN_WIDTH,
    () => true
  );
}

const PageLayout = ({
  children,
  onLogoClick,
  chromeVariant = "default",
}: PageLayoutProps) => {
  useMigrateUser();
  const isNativeTabShell = useNativeTabShell();
  const isCompactChrome = chromeVariant === "compact";
  const isSidebarWide = useIsSidebarWide();
  // A manual toggle holds until the window crosses the expanded breakpoint.
  const [sidebarToggle, setSidebarToggle] = useState<{ wide: boolean; open: boolean } | null>(null);
  if (sidebarToggle && sidebarToggle.wide !== isSidebarWide) {
    setSidebarToggle(null);
  }
  const isSidebarOpen = sidebarToggle?.wide === isSidebarWide ? sidebarToggle.open : isSidebarWide;

  useEffect(() => {
    const applyIOSStatusBar = async () => {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
        return;
      }

      try {
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        // Safe no-op for browser and unsupported shells.
      }
    };

    void applyIOSStatusBar();
  }, []);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(1rem_+_env(safe-area-inset-top))] focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow-lg"
      >
        Skip to content
      </a>
      <SidebarProvider
        open={isSidebarOpen}
        onOpenChange={(open) => setSidebarToggle({ wide: isSidebarWide, open })}
      >
        {/* Desktop sidebar. The native shell has its own tab bar at every width. */}
        {!isNativeTabShell && <AppSidebar />}

        <div className="relative flex w-full min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "mx-auto flex min-h-[100dvh] w-full max-w-[1200px] flex-col font-sans box-border",
              isCompactChrome
                ? "gap-4 p-4 pt-[calc(0.9rem_+_env(safe-area-inset-top))] sm:gap-5 sm:p-8 sm:pt-[calc(1.4rem_+_env(safe-area-inset-top))]"
                : "gap-5 p-4 pt-[calc(1.35rem_+_env(safe-area-inset-top))] sm:gap-6 sm:p-8 sm:pt-[calc(2rem_+_env(safe-area-inset-top))]",
              // Room for the fixed mobile tab bar, or for the native one.
              isNativeTabShell
                ? "pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]"
                : "pb-[calc(5.5rem_+_env(safe-area-inset-bottom))]",
              // Keep the bottom inset: on wide native screens (iPad, landscape) the native tab bar still covers the bottom.
              "md:gap-8 md:p-10 md:pb-[calc(2.5rem_+_env(safe-area-inset-bottom))] lg:p-12 lg:pb-[calc(3rem_+_env(safe-area-inset-bottom))]"
            )}
          >
            <Header onLogoClick={onLogoClick} variant={chromeVariant} />
            <main
              id="main-content"
              tabIndex={-1}
              className={cn(
                "flex flex-1 min-h-0 w-full flex-col items-center justify-start focus:outline-none",
                isCompactChrome ? "gap-5 pt-0 sm:gap-6 sm:pt-1" : "gap-6 pt-2 sm:gap-7 sm:pt-3"
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
      <MobileTabBar />
    </>
  );
};

export default PageLayout;
