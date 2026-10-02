"use client";

import { useRef } from "react";
import { CircleAlert, Loader2, Locate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeviceLocationStatus } from "@/hooks/useDeviceLocation";

/** What went wrong finding the location, and how to carry on. */
const FAILURE_MESSAGES: Partial<Record<DeviceLocationStatus, string>> = {
  denied: "Location access is off for this site. Search for a place, or allow location access and try again.",
  timeout: "Finding your location took too long. Try again, or search for a place.",
  unavailable: "Your location isn't available. Try again, or search for a place.",
};

interface DeviceLocationButtonProps {
  /** The button's text, e.g. "Use my location". */
  label: string;
  status: DeviceLocationStatus;
  /** Disables the button while other work runs. Finding the location can still be cancelled. */
  disabled?: boolean;
  className?: string;
  onLocate: () => void;
  onCancel: () => void;
}

/**
 * Asks for the device's location only when pressed. While it's being found,
 * offers Cancel; if it can't be found, says why under the button.
 */
export function DeviceLocationButton({
  label,
  status,
  disabled = false,
  className,
  onLocate,
  onCancel,
}: DeviceLocationButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const locating = status === "locating";
  const failure = FAILURE_MESSAGES[status];

  const handleCancel = () => {
    onCancel();
    // Cancel disappears, so keep focus nearby.
    buttonRef.current?.focus();
  };

  return (
    <div className="flex flex-col">
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        // Stays focusable while locating, so Cancel can hand focus back; pressing it then does nothing.
        disabled={disabled && !locating}
        aria-disabled={locating || undefined}
        onClick={() => {
          if (!locating) onLocate();
        }}
        className={cn("w-full aria-disabled:opacity-70", className)}
      >
        {locating ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Locate aria-hidden="true" className="size-4" />
        )}
        {label}
      </Button>
      <div className={cn("flex items-center justify-between gap-3", (locating || failure) && "mt-2")}>
        {/* Always rendered, so screen readers announce each change. */}
        <p role="status" className={cn("flex items-start gap-1.5 text-sm", failure ? "font-medium text-destructive" : "text-muted-foreground")}>
          {failure && <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
          {locating ? "Finding your location…" : failure}
          {status === "located" && <span className="sr-only">Using your location.</span>}
        </p>
        {locating && (
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
