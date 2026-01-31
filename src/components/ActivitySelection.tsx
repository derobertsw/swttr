"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTIVITIES } from "@/data/activities";

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
        {ACTIVITIES.map((activity) => (
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
