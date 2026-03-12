"use client";

import { ReactNode, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import Header from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { DesktopActionDock, MobileTabBar } from "@/components/AppNavigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useMigrateUser } from "@/hooks/useMigrateUser";
import { useNativeTabShell } from "@/hooks/useNativeTabShell";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: ReactNode;
  onLogoClick?: () => void;
  chromeVariant?: "default" | "compact";
}

const PageLayout = ({
  children,
  onLogoClick,
  chromeVariant = "default",
}: PageLayoutProps) => {
  useMigrateUser();
  const isNativeTabShell = useNativeTabShell();
  const isCompactChrome = chromeVariant === "compact";

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
      <SidebarProvider>
        {/* Desktop sidebar */}
        <AppSidebar />

        <SidebarInset>
          <div
            className={cn(
              "mx-auto flex min-h-[100dvh] w-full max-w-[1200px] flex-col font-sans box-border",
              isCompactChrome
                ? "gap-4 p-4 pt-[calc(0.9rem_+_env(safe-area-inset-top))] sm:gap-5 sm:p-8 sm:pt-[calc(1.4rem_+_env(safe-area-inset-top))]"
                : "gap-5 p-4 pt-[calc(1.35rem_+_env(safe-area-inset-top))] sm:gap-6 sm:p-8 sm:pt-[calc(2rem_+_env(safe-area-inset-top))]",
              isNativeTabShell
                ? "pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]"
                : "pb-[calc(5.5rem_+_env(safe-area-inset-bottom))]",
              "md:gap-8 md:rounded-3xl md:border md:border-white/25 md:bg-white/[0.04] md:p-10 md:pb-40 md:backdrop-blur-[6px] lg:p-12 lg:pb-44"
            )}
          >
            <Header onLogoClick={onLogoClick} variant={chromeVariant} />
            <main
              className={cn(
                "flex flex-1 min-h-0 w-full flex-col items-center justify-start",
                isCompactChrome ? "gap-5 pt-0 sm:gap-6 sm:pt-1" : "gap-6 pt-2 sm:gap-7 sm:pt-3"
              )}
            >
              {children}
            </main>
          </div>
        </SidebarInset>
        <DesktopActionDock />
      </SidebarProvider>
      <MobileTabBar />
    </>
  );
};

export default PageLayout;
