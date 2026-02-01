"use client";

import { ReactNode } from "react";
import Header from "@/components/Header";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileTabBar } from "@/components/AppNavigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

interface PageLayoutProps {
  children: ReactNode;
  onLogoClick?: () => void;
}

const PageLayout = ({ children, onLogoClick }: PageLayoutProps) => {
  return (
    <SidebarProvider>
      {/* Desktop sidebar */}
      <AppSidebar />

      <SidebarInset>
        <div className="font-sans flex flex-col min-h-screen p-4 pb-24 gap-8 sm:p-8 md:p-12 md:pb-12 md:gap-12">
          <Header onLogoClick={onLogoClick} />
          <main className="flex flex-col gap-6 sm:gap-8 flex-1 items-center justify-center w-full">
            {children}
          </main>
        </div>
      </SidebarInset>

      {/* Mobile tab bar */}
      <MobileTabBar />
    </SidebarProvider>
  );
};

export default PageLayout;
