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

interface PageLayoutProps {
  children: ReactNode;
  onLogoClick?: () => void;
}

const PageLayout = ({ children, onLogoClick }: PageLayoutProps) => {
  useMigrateUser();
  const isNativeTabShell = useNativeTabShell();

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
          <div className={isNativeTabShell
            ? "mx-auto flex min-h-[100dvh] w-full max-w-[1200px] flex-col gap-5 p-4 pt-[calc(1.35rem_+_env(safe-area-inset-top))] pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] font-sans box-border sm:gap-6 sm:p-8 sm:pt-[calc(2rem_+_env(safe-area-inset-top))] md:gap-8 md:rounded-3xl md:border md:border-white/25 md:bg-white/[0.04] md:p-10 md:pb-40 md:backdrop-blur-[6px] lg:p-12 lg:pb-44"
            : "mx-auto flex min-h-[100dvh] w-full max-w-[1200px] flex-col gap-5 p-4 pt-[calc(1.35rem_+_env(safe-area-inset-top))] pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] font-sans box-border sm:gap-6 sm:p-8 sm:pt-[calc(2rem_+_env(safe-area-inset-top))] md:gap-8 md:rounded-3xl md:border md:border-white/25 md:bg-white/[0.04] md:p-10 md:pb-40 md:backdrop-blur-[6px] lg:p-12 lg:pb-44"}>
            <Header onLogoClick={onLogoClick} />
            <main className="flex flex-col gap-6 sm:gap-7 flex-1 items-center justify-start w-full min-h-0 pt-2 sm:pt-3">
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
