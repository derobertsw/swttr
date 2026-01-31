import { Bike, CableCar, Footprints, Mountain, Snowflake, LucideIcon } from "lucide-react";

export interface Activity {
  name: string;
  value: string;
  icon: LucideIcon;
}

export const ACTIVITIES: Activity[] = [
  { name: "Running", value: "running", icon: Footprints },
  { name: "Biking", value: "biking", icon: Bike },
  { name: "Backcountry Skiing", value: "backcountry-skiing", icon: Mountain },
  { name: "Alpine Skiing", value: "alpine-skiing", icon: CableCar },
  { name: "XC Skiing", value: "xc-skiing", icon: Snowflake },
];

export const DEFAULT_ACTIVITY = "alpine-skiing";
