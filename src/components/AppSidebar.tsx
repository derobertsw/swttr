"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, HelpCircle, MessageSquare } from "lucide-react";
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
import { PRIMARY_NAV_ITEMS, isNavItemActive } from "@/components/AppNavigation";
import { PreferencesDrawer } from "@/components/PreferencesDrawer";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

const FOOTER_ITEMS = [
  { href: "/faq", label: "FAQ", icon: HelpCircle },
  {
    href: "https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor",
    label: "Feedback",
    icon: MessageSquare,
    external: true,
  },
];

// The active destination gets a fill, a heavier label and a teal icon. On
// touch screens the collapsed rail's icon buttons grow to 44px, so the rail
// padding shrinks to keep them inside its 52px width.
const SIDEBAR_ITEM_CLASS =
  "rounded-control data-[active=true]:font-semibold data-[active=true]:[&>svg]:text-primary pointer-coarse:group-data-[collapsible=icon]:size-11! pointer-coarse:group-data-[collapsible=icon]:p-3.5!";
const COLLAPSED_COARSE_INSET = "pointer-coarse:group-data-[collapsible=icon]:px-1";

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
      style={
        {
          "--sidebar-width": "15rem",
          "--sidebar-width-icon": "3.25rem",
        } as CSSProperties
      }
    >
      <SidebarHeader className={cn("p-4 pb-3 group-data-[collapsible=icon]:px-2", COLLAPSED_COARSE_INSET)}>
        <div className="flex items-start justify-between gap-2">
          <Link href="/" className="rounded-control px-1 py-0.5 group-data-[collapsible=icon]:hidden">
            <span className="block text-[1.6rem] leading-none font-extrabold tracking-[0.24em] text-foreground">
              SWTTR
            </span>
            <span className="mt-1.5 block text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Thermal Layering
            </span>
          </Link>
          <SidebarTrigger className="hidden size-9 text-muted-foreground md:inline-flex pointer-coarse:size-11" />
        </div>
      </SidebarHeader>
      <SidebarContent className={cn("px-2 pb-3 pt-1", COLLAPSED_COARSE_INSET)}>
        <SidebarGroup className="pointer-coarse:group-data-[collapsible=icon]:px-0">
          <SidebarGroupContent>
            <nav aria-label="Primary">
              <SidebarMenu>
                {PRIMARY_NAV_ITEMS.map((item) => {
                  const isActive = isNavItemActive(item.href, pathname);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={SIDEBAR_ITEM_CLASS}
                      >
                        <Link href={item.href} aria-current={isActive ? "page" : undefined}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarFooter className="px-0">
          <nav aria-label="Settings and help">
            <SidebarMenu>
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
                    tooltip="Settings"
                    className={SIDEBAR_ITEM_CLASS}
                  >
                    <Settings />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </PreferencesDrawer>
              </SidebarMenuItem>
              {FOOTER_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className={SIDEBAR_ITEM_CLASS}
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
          </nav>
        </SidebarFooter>
      </SidebarContent>
    </Sidebar>
  );
}
