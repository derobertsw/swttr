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
  cardLines: string[];
}

export const ACTIVITIES: Activity[] = [
  { name: "Running", value: "running", icon: RunningIcon, cardLines: ["Running"] },
  { name: "Biking", value: "biking", icon: BikeIcon, cardLines: ["Biking"] },
  {
    name: "Hiking / Snowshoeing",
    value: "hiking_snowshoeing",
    icon: HikeIcon,
    cardLines: ["Hike", "Snowshoe"],
  },
  {
    name: "Backcountry Skiing",
    value: "backcountry_skiing",
    icon: BackcountrySkiIcon,
    cardLines: ["Backcountry", "Ski"],
  },
  {
    name: "Alpine Skiing",
    value: "alpine_skiing",
    icon: AlpineSkiIcon,
    cardLines: ["Alpine", "Ski"],
  },
  { name: "XC Skiing", value: "xc_skiing", icon: XCSkiIcon, cardLines: ["XC Ski"] },
];

export const DEFAULT_ACTIVITY = "alpine_skiing";
