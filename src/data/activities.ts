import { Bike, CableCar, Footprints, Mountain, LucideIcon } from "lucide-react";
import XCSkiIcon from "@/components/icons/XCSkiIcon";

export interface Activity {
  name: string;
  value: string;
  icon: LucideIcon;
  descriptor?: string;
}

export const ACTIVITIES: Activity[] = [
  { name: "Running", value: "running", icon: Footprints },
  { name: "Biking", value: "biking", icon: Bike },
  { name: "Hiking / Snowshoeing", value: "hiking-snowshoeing", icon: Mountain },
  { name: "Backcountry Skiing", value: "backcountry-skiing", icon: Mountain, descriptor: "Uphill · Touring" },
  { name: "Alpine Skiing", value: "alpine-skiing", icon: CableCar, descriptor: "Chairlifts · Resort" },
  { name: "XC Skiing", value: "xc-skiing", icon: XCSkiIcon, descriptor: "High output · Aerobic" },
];

export const DEFAULT_ACTIVITY = "alpine-skiing";
