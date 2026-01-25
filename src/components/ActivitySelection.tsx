"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Footprints, Bike, Mountain, CableCar, Snowflake } from "lucide-react";

const activities = [
  //{ name: "Running", value: "running", icon: Footprints },
  //{ name: "Biking", value: "biking", icon: Bike },
  //{ name: "Backcountry Skiing", value: "backcountry-skiing", icon: Mountain },
  { name: "Alpine Skiing", value: "alpine-skiing", icon: CableCar },
  { name: "XC Skiing", value: "xc-skiing", icon: Snowflake },
];

interface ActivitySelectionProps {
  value: string;
  onChange: (value: string) => void;
}

const ActivitySelection = ({ value, onChange }: ActivitySelectionProps) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select an activity" />
      </SelectTrigger>
      <SelectContent>
        {activities.map((activity) => (
          <SelectItem key={activity.value} value={activity.value}>
            <activity.icon className="size-4" />
            {activity.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ActivitySelection;
