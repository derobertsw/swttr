"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Shirt, Settings, HelpCircle, MessageSquare } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";

const NAV_ITEMS = [
  { href: "/?mode=planAhead", label: "Plan", icon: CalendarDays },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
];

const FOOTER_ITEMS = [
  { href: "/faq", label: "FAQ", icon: HelpCircle },
  {
    href: "https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor",
    label: "Feedback",
    icon: MessageSquare,
    external: true,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const {
    sensitivity,
    defaultActivity,
    bodyMetricsSelection,
    updateSensitivity,
    updateDefaultActivity,
    updateBodyMetrics,
  } = usePreferences();

  return (
    <Sidebar
      collapsible="icon"
      className="md:border-r md:border-white/20 md:bg-[rgba(239,245,251,0.86)] md:backdrop-blur-lg"
      style={
        {
          "--sidebar-width": "15rem",
          "--sidebar-width-icon": "3.25rem",
        } as CSSProperties
      }
    >
      <SidebarHeader className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <Link href="/" className="group-data-[collapsible=icon]:hidden">
            <div className="rounded-xl border border-slate-300/70 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-[2px]">
              <h1 className="leading-none text-[1.6rem] font-extrabold tracking-[0.24em] text-slate-900">
                SWTTR
              </h1>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600/85">
                Thermal Layering
              </p>
            </div>
          </Link>
          <SidebarTrigger className="hidden md:inline-flex size-8 rounded-md border border-slate-300/70 bg-white/70 text-slate-700 hover:bg-white/90" />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 pb-3 pt-1">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.href.startsWith("/?") ? pathname === "/" : pathname === item.href}
                    tooltip={item.label}
                    className="rounded-lg data-[active=true]:bg-slate-200/90 data-[active=true]:text-slate-900"
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Preferences as drawer trigger */}
              <SidebarMenuItem>
                <PreferencesDrawer
                  sensitivity={sensitivity}
                  defaultActivity={defaultActivity}
                  heightInches={bodyMetricsSelection.heightInches}
                  weightLbs={bodyMetricsSelection.weightLbs}
                  onSensitivityChange={updateSensitivity}
                  onDefaultActivityChange={updateDefaultActivity}
                  onBodyMetricsChange={updateBodyMetrics}
                >
                  <SidebarMenuButton
                    tooltip="Preferences"
                    className="rounded-lg data-[active=true]:bg-slate-200/90 data-[active=true]:text-slate-900"
                  >
                    <Settings />
                    <span>Preferences</span>
                  </SidebarMenuButton>
                </PreferencesDrawer>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarFooter className="px-0">
          <SidebarMenu>
            {FOOTER_ITEMS.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                  className="rounded-lg data-[active=true]:bg-slate-200/90 data-[active=true]:text-slate-900"
                >
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer">
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  ) : (
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarFooter>
      </SidebarContent>
    </Sidebar>
  );
}
