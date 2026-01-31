"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shirt, Backpack, Settings, HelpCircle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
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
  { href: "/", label: "Plan", icon: Home },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/backpack", label: "Backpack", icon: Backpack },
];

const FOOTER_ITEMS = [
  { href: "/faq", label: "FAQ", icon: HelpCircle },
];

export function AppSidebar() {
  const pathname = usePathname();
  const {
    sensitivity,
    defaultActivity,
    updateSensitivity,
    updateDefaultActivity,
  } = usePreferences();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <Link href="/">
          <h1 className="site-header text-xl group-data-[collapsible=icon]:hidden">SWTTR</h1>
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
                    isActive={pathname === item.href}
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
                  onSensitivityChange={updateSensitivity}
                  onDefaultActivityChange={updateDefaultActivity}
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

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {FOOTER_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
