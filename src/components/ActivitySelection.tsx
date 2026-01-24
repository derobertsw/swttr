"use client";

import React from "react";

const activities = [
  "Running",
  "Biking",
  "Backcountry Skiing",
  "Alpine Skiing",
  "XC Skiing",
];

interface ActivitySelectionProps {
  value: string;
  onChange: (value: string) => void;
}

const ActivitySelection = ({ value, onChange }: ActivitySelectionProps) => {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select an activity</option>
      {activities.map((activity) => (
        <option key={activity} value={activity.toLowerCase().replace(" ", "-")}>
          {activity}
        </option>
      ))}
    </select>
  );
};

export default ActivitySelection;
