import { Bike, CableCar, Footprints, Mountain, Snowflake, LucideIcon } from "lucide-react";

export interface Activity {
  name: string;
  value: string;
  icon: LucideIcon;
  descriptor?: string;
}

export const ACTIVITIES: Activity[] = [
  { name: "Running", value: "running", icon: Footprints },
  { name: "Biking", value: "biking", icon: Bike },
  { name: "Backcountry Skiing", value: "backcountry-skiing", icon: Mountain, descriptor: "Uphill · Touring" },
  { name: "Alpine Skiing", value: "alpine-skiing", icon: CableCar, descriptor: "Chairlifts · Resort" },
  { name: "XC Skiing", value: "xc-skiing", icon: Snowflake, descriptor: "High output · Aerobic" },
];

export const DEFAULT_ACTIVITY = "alpine-skiing";
