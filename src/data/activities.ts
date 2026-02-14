import { LucideIcon } from "lucide-react";
import XCSkiIcon from "@/components/icons/XCSkiIcon";
import RunningIcon from "@/components/icons/RunningIcon";
import BackcountrySkiIcon from "@/components/icons/BackcountrySkiIcon";
import AlpineSkiIcon from "@/components/icons/AlpineSkiIcon";
import BikeIcon from "@/components/icons/BikeIcon";
import HikeIcon from "@/components/icons/HikeIcon";

export interface Activity {
  name: string;
  value: string;
  icon: LucideIcon;
}

export const ACTIVITIES: Activity[] = [
  { name: "Running", value: "running", icon: RunningIcon },
  { name: "Biking", value: "biking", icon: BikeIcon },
  { name: "Hiking / Snowshoeing", value: "hiking_snowshoeing", icon: HikeIcon },
  { name: "Backcountry Skiing", value: "backcountry_skiing", icon: BackcountrySkiIcon },
  { name: "Alpine Skiing", value: "alpine_skiing", icon: AlpineSkiIcon },
  { name: "XC Skiing", value: "xc_skiing", icon: XCSkiIcon },
];

export const DEFAULT_ACTIVITY = "alpine_skiing";
