"use client";

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
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 pb-3">
        <Link href="/" className="group-data-[collapsible=icon]:hidden">
          <div className="rounded-xl border border-slate-300/70 bg-white/75 px-3 py-2 shadow-sm backdrop-blur-[2px]">
            <h1 className="leading-none text-[1.6rem] font-extrabold tracking-[0.24em] text-slate-900">
              SWTTR
            </h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600/85">
              Thermal Layering
            </p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.href.startsWith("/?") ? pathname === "/" : pathname === item.href}
                    tooltip={item.label}
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
                  <SidebarMenuButton tooltip="Preferences">
                    <Settings />
                    <span>Preferences</span>
                  </SidebarMenuButton>
                </PreferencesDrawer>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarFooter>
          <SidebarMenu>
            {FOOTER_ITEMS.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
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
