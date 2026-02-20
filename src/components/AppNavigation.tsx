"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Shirt, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTIVITIES, DEFAULT_ACTIVITY } from "@/data/activities";
import { STORAGE_KEYS } from "@/lib/storage";
import { useNativeTabShell } from "@/hooks/useNativeTabShell";

const TAB_ITEMS = [
  { href: "/?mode=planAhead", label: "Plan", icon: CalendarDays },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
];

type TabItem = (typeof TAB_ITEMS)[number];

interface RouterLike {
  push: (href: string) => void;
}

function useNavigationState(pathname: string, router: RouterLike) {
  const [isGearUpLoading, setIsGearUpLoading] = useState(false);
  const [activityValue, setActivityValue] = useState<string>("");
  const [isFabPulse, setIsFabPulse] = useState(false);
  const pulseTimeoutRef = useRef<number | null>(null);

  const isLandingScreen = pathname === "/";

  useEffect(() => {
    const onLoading = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setIsGearUpLoading(Boolean(detail));
    };
    window.addEventListener("gearUpLoading", onLoading);
    return () => window.removeEventListener("gearUpLoading", onLoading);
  }, []);

  useEffect(() => {
    if (pathname !== "/" && isGearUpLoading) {
      setIsGearUpLoading(false);
    }
  }, [pathname, isGearUpLoading]);

  useEffect(() => {
    if (activityValue) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY) : null;
    if (stored) {
      setActivityValue(stored);
      return;
    }
    setActivityValue(DEFAULT_ACTIVITY);
  }, [activityValue]);

  useEffect(() => {
    const onActivityChange = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; value?: string }>).detail;
      const nextValue = detail?.value ?? "";
      setActivityValue(nextValue);
      setIsFabPulse(true);
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
      pulseTimeoutRef.current = window.setTimeout(() => {
        setIsFabPulse(false);
      }, 180);
    };
    window.addEventListener("activityChange", onActivityChange);
    return () => {
      window.removeEventListener("activityChange", onActivityChange);
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  const ActivityGlyph = useMemo(() => {
    const match = ACTIVITIES.find((item) => item.value === activityValue);
    return match?.icon ?? Zap;
  }, [activityValue]);

  const isTabActive = useCallback(
    (href: string) => (href.startsWith("/?") ? pathname === "/" : pathname === href),
    [pathname]
  );

  const onTabClick = useCallback(
    (item: TabItem, e: React.MouseEvent) => {
      if (item.href === "/?mode=planAhead") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("navigatePlanAhead"));
        if (pathname !== "/") {
          router.push(item.href);
        }
      }
    },
    [pathname, router]
  );

  const onGearUpClick = useCallback(() => {
    if (isGearUpLoading) return;
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("gearUp"));
      return;
    }
    if (!navigator.geolocation) {
      router.push("/?gearUp=1&geoDenied=1");
      return;
    }
    setIsGearUpLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        sessionStorage.setItem(
          "swttr-gearup-coords",
          JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        );
        router.push("/?gearUp=1");
      },
      () => {
        sessionStorage.removeItem("swttr-gearup-coords");
        router.push("/?gearUp=1&geoDenied=1");
      }
    );
  }, [isGearUpLoading, pathname, router]);

  return {
    ActivityGlyph,
    isLandingScreen,
    isGearUpLoading,
    isFabPulse,
    isTabActive,
    onTabClick,
    onGearUpClick,
  };
}

export function MobileTabBar() {
  const isNativeTabShell = useNativeTabShell();
  const pathname = usePathname();
  const router = useRouter();
  const {
    ActivityGlyph,
    isLandingScreen,
    isGearUpLoading,
    isFabPulse,
    isTabActive,
    onTabClick,
    onGearUpClick,
  } = useNavigationState(pathname, router);

  const renderTab = (item: { href: string; label: string; icon: typeof CalendarDays }) => {
    const isActive = isTabActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={(e) => onTabClick(item, e)}
        className={cn(
          "flex flex-col items-center gap-1 text-[11px] font-medium leading-none tracking-[0.01em] transition-colors",
          isActive ? "text-white" : "text-white/70",
          !isActive && isLandingScreen && "translate-y-0.5"
        )}
      >
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-all",
            isActive ? "bg-white/22 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" : "bg-transparent"
          )}
        >
          <item.icon
            className={cn("size-5", !isActive && "opacity-80")}
            fill={isActive ? "currentColor" : "none"}
            strokeWidth={isActive ? 1.5 : 2}
          />
        </div>
        <span className={cn(!isActive && "opacity-80")}>{item.label}</span>
      </Link>
    );
  };

  if (isNativeTabShell) {
    return null;
  }

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[calc(env(safe-area-inset-bottom)+0.4rem)]",
        isLandingScreen ? "text-white/60" : "text-white/80"
      )}
    >
      <div className="relative h-[74px] border-t border-white/20 bg-[rgba(17,45,62,0.74)] backdrop-blur-2xl">
        <div className="flex h-full items-center justify-around px-3 pb-1 pt-1.5">
          {renderTab(TAB_ITEMS[0])}
          <div className="w-16" />
          {renderTab(TAB_ITEMS[1])}
        </div>

        <button
          type="button"
          className={cn(
            "absolute left-1/2 top-0 flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-[56%] items-center justify-center rounded-full border border-white/25 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.04)_28%,rgba(5,10,20,0.92)_100%)] text-white shadow-[0_16px_28px_rgba(0,0,0,0.42)] transition-transform duration-200",
            isFabPulse && "scale-110"
          )}
          aria-label="Gear Up"
          onClick={onGearUpClick}
          disabled={isGearUpLoading}
        >
          {isGearUpLoading ? <Loader2 className="size-6 animate-spin" /> : <ActivityGlyph className="size-6" />}
        </button>
        <span className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 text-[11px] font-semibold tracking-[0.01em] text-white">
          Gear Up
        </span>
      </div>
    </nav>
  );
}

export function DesktopActionDock() {
  const isNativeTabShell = useNativeTabShell();
  const pathname = usePathname();
  const router = useRouter();
  const {
    ActivityGlyph,
    isLandingScreen,
    isGearUpLoading,
    isFabPulse,
    isTabActive,
    onTabClick,
    onGearUpClick,
  } = useNavigationState(pathname, router);

  const renderDesktopTab = (item: TabItem) => {
    const isActive = isTabActive(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={(e) => onTabClick(item, e)}
        className={cn(
          "inline-flex h-10 min-w-[102px] items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors",
          isActive
            ? "border-white/45 bg-white/22 text-white shadow-[0_6px_14px_rgba(0,0,0,0.16)]"
            : "border-white/18 bg-transparent text-white/78 hover:bg-white/[0.12]"
        )}
      >
        <item.icon className="size-4" />
        <span>{item.label}</span>
      </Link>
    );
  };

  if (isNativeTabShell) {
    return null;
  }

  return (
    <nav
      className={cn(
        "pointer-events-none fixed bottom-3 z-50 hidden -translate-x-1/2 md:block xl:bottom-4",
        "left-[calc((100vw+var(--sidebar-width))/2)]",
        "peer-data-[state=collapsed]:left-[calc((100vw+var(--sidebar-width-icon))/2)]",
        isLandingScreen ? "text-white/90" : "text-white"
      )}
    >
      <div className="pointer-events-auto inline-flex max-w-[min(640px,calc(100vw-var(--sidebar-width)-2.25rem))] items-center gap-2 rounded-2xl border border-white/25 bg-[linear-gradient(135deg,rgba(54,86,116,0.8)_0%,rgba(38,86,108,0.78)_100%)] p-2 shadow-[0_18px_34px_rgba(0,0,0,0.3)] backdrop-blur-xl">
        {renderDesktopTab(TAB_ITEMS[0])}
        <button
          type="button"
          aria-label="Start recommendation"
          onClick={onGearUpClick}
          disabled={isGearUpLoading}
          className={cn(
            "inline-flex h-12 min-w-[220px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[linear-gradient(180deg,#111827_0%,#020617_100%)] px-6 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(0,0,0,0.44)] transition-transform duration-200 hover:bg-[#030712]",
            isFabPulse && "scale-[1.03]"
          )}
        >
          {isGearUpLoading ? <Loader2 className="size-5 animate-spin" /> : <ActivityGlyph className="size-5" />}
          <span className="tracking-wide">Gear Up</span>
        </button>
        {renderDesktopTab(TAB_ITEMS[1])}
      </div>
    </nav>
  );
}
