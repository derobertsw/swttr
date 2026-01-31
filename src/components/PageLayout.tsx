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
          <main className="flex flex-col gap-6 sm:gap-8 flex-1 items-center sm:items-start w-full">
            {children}
          </main>
          <footer className="flex gap-6 flex-wrap items-center justify-center mt-auto">
            <a
              className="hover:underline hover:underline-offset-4"
              href="https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor"
              target="_blank"
              rel="noopener noreferrer"
            >
              Provide Feedback
            </a>
          </footer>
        </div>
      </SidebarInset>

      {/* Mobile tab bar */}
      <MobileTabBar />
    </SidebarProvider>
  );
};

export default PageLayout;
