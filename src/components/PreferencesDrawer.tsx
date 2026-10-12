"use client";

import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PreferenceSaveResult, TemperatureSensitivity } from "@/types/preferences";
import { ACTIVITIES } from "@/data/activities";
import { ReactNode, useEffect, useState } from "react";
import {
  MAX_HEIGHT_INCHES,
  MAX_WEIGHT_LBS,
  MIN_HEIGHT_INCHES,
  MIN_WEIGHT_LBS,
} from "@/lib/biophysics/bodyMetrics";
import { Check, Settings2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { SegmentedChoice } from "@/components/SegmentedChoice";
import { useTemperatureUnit } from "@/components/TemperatureUnitProvider";

const TEMPERATURE_UNIT_OPTIONS = [
  { value: "F", label: "Fahrenheit (°F)" },
  { value: "C", label: "Celsius (°C)" },
] as const;

const SENSITIVITY_OPTIONS: { value: TemperatureSensitivity; label: string; description: string }[] = [
  {
    value: "hot",
    label: "Run Warm",
    description: "You run warm. We bias toward lighter layers.",
  },
  {
    value: "neutral",
    label: "Neutral",
    description: "Balanced recommendations for most people.",
  },
  {
    value: "cold",
    label: "Run Cold",
    description: "You run cold. We bias toward warmer layers.",
  },
];

interface PreferencesDrawerProps {
  children?: ReactNode;
  sensitivity: TemperatureSensitivity;
  defaultActivity: string;
  heightInches?: number;
  weightLbs?: number;
  onSensitivityChange: (value: TemperatureSensitivity) => void | Promise<void | PreferenceSaveResult>;
  onDefaultActivityChange: (value: string) => void | Promise<void | PreferenceSaveResult>;
  onBodyMetricsChange: (metrics: {
    heightInches?: number;
    weightLbs?: number;
  }) => void | Promise<void | PreferenceSaveResult>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Where focus goes on close, when the drawer opens from code rather than `children`. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function PreferencesDrawer({
  children,
  sensitivity,
  defaultActivity,
  heightInches,
  weightLbs,
  onSensitivityChange,
  onDefaultActivityChange,
  onBodyMetricsChange,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: PreferencesDrawerProps) {
  const { temperatureUnit, isReady, updateTemperatureUnit } = useTemperatureUnit();
  const [unitSaveError, setUnitSaveError] = useState(false);
  const selectedSensitivity = SENSITIVITY_OPTIONS.find((opt) => opt.value === sensitivity);
  // "kept-on-device": the server couldn't save an account's change. Unlike
  // "saved", it stays until the next change or until the drawer closes.
  const [saveState, setSaveState] = useState<"idle" | "saving" | PreferenceSaveResult>("idle");

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 1400);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const runWithSaveState = async (fn: () => void | Promise<void | PreferenceSaveResult>) => {
    setSaveState("saving");
    try {
      setSaveState((await fn()) ?? "saved");
    } catch {
      setSaveState("idle");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSaveState("idle");
    onOpenChange?.(nextOpen);
  };

  const heightOptions = Array.from(
    { length: MAX_HEIGHT_INCHES - MIN_HEIGHT_INCHES + 1 },
    (_, i) => MIN_HEIGHT_INCHES + i
  );
  const weightOptions = Array.from(
    { length: (MAX_WEIGHT_LBS - MIN_WEIGHT_LBS) / 5 + 1 },
    (_, i) => MIN_WEIGHT_LBS + (i * 5)
  );
  const formatHeight = (inches: number) => {
    const feet = Math.floor(inches / 12);
    const rem = inches % 12;
    return `${feet}'${rem}"`;
  };

  return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
      {children && <DrawerTrigger asChild>{children}</DrawerTrigger>}
      <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
        <div className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col">
          <DrawerHeader className="border-b border-border pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DrawerTitle>Settings</DrawerTitle>
                <DrawerDescription>
                  Customize your recommendations
                </DrawerDescription>
                <p role="status" className="mt-1 text-sm text-muted-foreground">
                  {saveState === "kept-on-device" ? (
                    <span className="text-foreground">
                      Couldn’t save to your account. It’s kept on this device, and we’ll try again next
                      time you open SWTTR.
                    </span>
                  ) : (
                    "Changes save automatically."
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span role="status" className="text-sm font-medium">
                  {saveState === "saving" && (
                    <span className="text-muted-foreground">Saving...</span>
                  )}
                  {saveState === "saved" && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check className="size-4" />
                      Saved
                    </span>
                  )}
                </span>
                <DrawerClose asChild>
                  <Button variant="outline" size="sm">
                    Done
                  </Button>
                </DrawerClose>
              </div>
            </div>
          </DrawerHeader>

          <DrawerBody className="space-y-6 pt-5 pb-8">
            <section aria-label="Display">
              <SegmentedChoice
                label="Temperature units"
                options={TEMPERATURE_UNIT_OPTIONS}
                value={temperatureUnit}
                disabled={!isReady}
                description={isReady ? "Saved for you on this device." : "Loading your temperature preference…"}
                onChange={(unit) => {
                  setUnitSaveError(false);
                  void runWithSaveState(() => {
                    try {
                      updateTemperatureUnit(unit);
                    } catch (error) {
                      setUnitSaveError(true);
                      throw error;
                    }
                  });
                }}
              />
              {unitSaveError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Couldn’t save temperature units. Check that storage is allowed, then try again.
                </p>
              )}
            </section>
            <section aria-labelledby="settings-recommendations" className="space-y-5">
              <h3
                id="settings-recommendations"
                className="flex items-center gap-2 text-base font-semibold text-foreground"
              >
                <Settings2 className="size-4 text-muted-foreground" />
                Recommendations
              </h3>

              <div className="flex flex-col gap-2">
                <label htmlFor="settings-default-activity" className="text-sm font-medium text-foreground">
                  Default Activity
                </label>
                <Select
                  value={defaultActivity}
                  onValueChange={(value) => runWithSaveState(() => onDefaultActivityChange(value))}
                >
                  <SelectTrigger id="settings-default-activity" className="w-full">
                    <SelectValue placeholder="Select activity" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITIES.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value}>
                        <activity.icon className="size-4" />
                        {activity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Pre-selected each time you open SWTTR.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <p id="settings-sensitivity" className="text-sm font-medium text-foreground">
                  Temperature Sensitivity
                </p>
                <div
                  className={cn(segmentedGroupClassName, "grid-cols-3")}
                  role="radiogroup"
                  aria-labelledby="settings-sensitivity"
                >
                  {SENSITIVITY_OPTIONS.map((option) => {
                    const isSelected = option.value === sensitivity;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() =>
                          runWithSaveState(() => onSensitivityChange(option.value))
                        }
                        className={segmentedItemClassName}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {selectedSensitivity && (
                  <p className="text-sm text-muted-foreground">
                    {selectedSensitivity.description}
                  </p>
                )}
              </div>
            </section>

            <section
              aria-labelledby="settings-body-profile"
              className="space-y-4 border-t border-border pt-6"
            >
              <h3
                id="settings-body-profile"
                className="flex items-center gap-2 text-base font-semibold text-foreground"
              >
                <User className="size-4 text-muted-foreground" />
                Body Profile
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label htmlFor="settings-height" className="text-sm font-medium text-foreground">
                    Height (ft/in)
                  </label>
                  <Select
                    value={heightInches !== undefined ? String(heightInches) : undefined}
                    onValueChange={(value) =>
                      runWithSaveState(() => onBodyMetricsChange({ heightInches: Number(value) }))
                    }
                  >
                    <SelectTrigger id="settings-height" className="w-full">
                      <SelectValue placeholder="Height" />
                    </SelectTrigger>
                    <SelectContent>
                      {heightOptions.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {formatHeight(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="settings-weight" className="text-sm font-medium text-foreground">
                    Weight (lb)
                  </label>
                  <Select
                    value={weightLbs !== undefined ? String(weightLbs) : undefined}
                    onValueChange={(value) =>
                      runWithSaveState(() => onBodyMetricsChange({ weightLbs: Number(value) }))
                    }
                  >
                    <SelectTrigger id="settings-weight" className="w-full">
                      <SelectValue placeholder="Weight" />
                    </SelectTrigger>
                    <SelectContent>
                      {weightOptions.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value} lb
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Used only for personalized thermal modeling.
              </p>
            </section>
          </DrawerBody>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
