"use client";

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CloudRain,
  CloudSnow,
  Cloud,
  Sun,
  Snowflake,
  CloudSun,
  Shirt,
  Footprints,
  Hand,
  Copy,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEATHER_ICONS: Record<string, typeof Sun> = {
  snow: Snowflake,
  rain: CloudRain,
  cloud: Cloud,
  mix: CloudSnow,
  sun: Sun,
  partly: CloudSun,
};

export function WeatherGlyph({ kind, className }: { kind: string; className?: string }) {
  const Icon = WEATHER_ICONS[kind] ?? Cloud;
  return <Icon className={cn("size-5 text-muted-foreground", className)} />;
}

const GARMENT_ICONS: Record<string, typeof Shirt> = {
  shirt: Shirt,
  midlayer: Shirt,
  jacket: Shirt,
  shell: Shirt,
  pants: Footprints,
  gloves: Hand,
};

export function GarmentGlyph({ kind, className }: { kind: string; className?: string }) {
  const Icon = GARMENT_ICONS[kind] ?? Shirt;
  return <Icon className={cn("size-4 text-muted-foreground", className)} />;
}

export function MemberAvatar({
  name,
  size = 32,
  state = "default",
}: {
  name: string;
  size?: number;
  state?: "default" | "guest" | "invited" | "self";
}) {
  const stateStyles = {
    default: "border-input bg-muted text-foreground",
    guest: "border-border bg-muted text-muted-foreground",
    invited: "border-dashed border-input bg-transparent text-muted-foreground",
    self: "border-primary bg-primary-soft text-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase",
        stateStyles[state]
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export const sectionLabelClassName = "text-sm font-medium text-muted-foreground";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(sectionLabelClassName, className)}>{children}</p>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}

/** A trip-level error, such as a trip that failed to load. */
export function TripError({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-card bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive",
        className
      )}
      {...props}
    />
  );
}

// Each stop keeps one color on the overview: the dot on its chip and its group
// of days, and those days' spines. The stop's name always goes with the color,
// so it borrows the primary, ring and warning hues, which stay apart in both
// palettes, without implying a status.
const STOP_COLORS = ["bg-primary", "bg-ring", "bg-warning"] as const;

function stopColor(index: number) {
  return STOP_COLORS[index % STOP_COLORS.length];
}

export function StopDot({ stopIndex }: { stopIndex: number }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", stopColor(stopIndex))} />;
}

export function Spine({ stopIndex }: { stopIndex: number }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-[3px] self-stretch rounded-full", stopColor(stopIndex))}
    />
  );
}

/** A stored lowercase value, such as an effort, a kit slot or a priority, as a label. */
export function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function inferWeatherKind(tempF: number, precipFraction: number): string {
  if (precipFraction > 0.5) return tempF <= 32 ? "snow" : "rain";
  if (precipFraction > 0.1) return "mix";
  if (tempF <= 27) return "snow";
  if (tempF >= 59) return "sun";
  return "cloud";
}

export function formatDateRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  if (startISO === endISO) return fmt(startISO);
  return `${fmt(startISO)} – ${fmt(endISO)}`;
}

export function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

function buildInviteUrl(token: string): string {
  if (typeof window === "undefined") return `/trips/invite/${token}`;
  return `${window.location.origin}/trips/invite/${token}`;
}

export function InviteLinkButton({
  token,
  recipientName,
  tripName,
  className,
}: {
  token: string;
  recipientName: string;
  tripName?: string;
  className?: string;
}) {
  const handleShare = async () => {
    const url = buildInviteUrl(token);
    const shareData: ShareData = {
      title: tripName ? `${tripName} — trip invite` : "Trip invite",
      text: `${recipientName}, here's your invite to ${tripName ?? "the trip"}.`,
      url,
    };
    const canNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(shareData));

    if (canNativeShare) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled — fall through to clipboard.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      // Final fallback — show the URL so the user can copy manually.
      window.prompt("Copy this invite link:", url);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleShare} className={className}>
      {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
        <Share2 />
      ) : (
        <Copy />
      )}
      Send invite
    </Button>
  );
}
