import { Bike, Mountain, LucideIcon } from "lucide-react";
import XCSkiIcon from "@/components/icons/XCSkiIcon";
import RunningIcon from "@/components/icons/RunningIcon";
import BackcountrySkiIcon from "@/components/icons/BackcountrySkiIcon";
import AlpineSkiIcon from "@/components/icons/AlpineSkiIcon";

export interface Activity {
  name: string;
  value: string;
  icon: LucideIcon;
  descriptor?: string;
}

export const ACTIVITIES: Activity[] = [
  { name: "Running", value: "running", icon: RunningIcon },
  { name: "Biking", value: "biking", icon: Bike },
  { name: "Hiking / Snowshoeing", value: "hiking-snowshoeing", icon: Mountain },
  { name: "Backcountry Skiing", value: "backcountry-skiing", icon: BackcountrySkiIcon, descriptor: "Uphill · Touring" },
  { name: "Alpine Skiing", value: "alpine-skiing", icon: AlpineSkiIcon, descriptor: "Chairlifts · Resort" },
  { name: "XC Skiing", value: "xc-skiing", icon: XCSkiIcon, descriptor: "High output · Aerobic" },
];

export const DEFAULT_ACTIVITY = "alpine-skiing";
