"use client";

import {
  Drawer,
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
import { TemperatureSensitivity } from "@/types/preferences";
import { ACTIVITIES } from "@/data/activities";
import { ReactNode } from "react";
import {
  MAX_HEIGHT_INCHES,
  MAX_WEIGHT_LBS,
  MIN_HEIGHT_INCHES,
  MIN_WEIGHT_LBS,
} from "@/lib/biophysics/bodyMetrics";

const SENSITIVITY_OPTIONS: { value: TemperatureSensitivity; label: string; description: string }[] = [
  {
    value: "hot",
    label: "Run Hot",
    description: "Recommend lighter gear",
  },
  {
    value: "neutral",
    label: "Neutral",
    description: "Standard recommendations",
  },
  {
    value: "cold",
    label: "Run Cold",
    description: "Recommend warmer gear",
  },
];

interface PreferencesDrawerProps {
  children: ReactNode;
  sensitivity: TemperatureSensitivity;
  defaultActivity: string;
  heightInches?: number;
  weightLbs?: number;
  onSensitivityChange: (value: TemperatureSensitivity) => void;
  onDefaultActivityChange: (value: string) => void;
  onBodyMetricsChange: (metrics: { heightInches?: number; weightLbs?: number }) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
}: PreferencesDrawerProps) {
  const selectedSensitivity = SENSITIVITY_OPTIONS.find((opt) => opt.value === sensitivity);
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm pb-8">
          <DrawerHeader>
            <DrawerTitle>Preferences</DrawerTitle>
            <DrawerDescription>
              Customize your recommendations
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-6 px-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Default Activity</label>
              <Select value={defaultActivity} onValueChange={onDefaultActivityChange}>
                <SelectTrigger>
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
                This will be pre-selected when you open the app
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Temperature Sensitivity</label>
              <Select value={sensitivity} onValueChange={onSensitivityChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sensitivity" />
                </SelectTrigger>
                <SelectContent>
                  {SENSITIVITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSensitivity && (
                <p className="text-sm text-muted-foreground">
                  {selectedSensitivity.description}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Height</label>
              <Select
                value={heightInches !== undefined ? String(heightInches) : undefined}
                onValueChange={(value) => onBodyMetricsChange({ heightInches: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select height" />
                </SelectTrigger>
                <SelectContent>
                  {heightOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {formatHeight(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Used for personalized thermal modeling.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Weight</label>
              <Select
                value={weightLbs !== undefined ? String(weightLbs) : undefined}
                onValueChange={(value) => onBodyMetricsChange({ weightLbs: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select weight" />
                </SelectTrigger>
                <SelectContent>
                  {weightOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} lb
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Used for personalized thermal modeling.
              </p>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
