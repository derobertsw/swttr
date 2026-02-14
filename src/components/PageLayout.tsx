"use client";

import { ReactNode } from "react";
import Header from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileTabBar } from "@/components/AppNavigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { useMigrateUser } from "@/hooks/useMigrateUser";

interface PageLayoutProps {
  children: ReactNode;
  onLogoClick?: () => void;
}

const PageLayout = ({ children, onLogoClick }: PageLayoutProps) => {
  useMigrateUser();

  return (
    <>
      <SidebarProvider>
        {/* Desktop sidebar */}
        <AppSidebar />

        <SidebarInset>
          <div className="mx-auto w-full max-w-[1200px] font-sans flex flex-col min-h-[100dvh] box-border p-4 pb-[calc(4rem_+_env(safe-area-inset-bottom))] gap-5 sm:p-8 sm:gap-6 md:p-12 md:pb-12 md:gap-8">
            <Header onLogoClick={onLogoClick} />
            <main className="flex flex-col gap-6 sm:gap-7 flex-1 items-center justify-start w-full min-h-0 pt-2 sm:pt-3">
              {children}
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <MobileTabBar />
    </>
  );
};

export default PageLayout;
