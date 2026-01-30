"use client";

import { TemperatureSensitivity } from "@/types/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TemperatureSensitivitySelectorProps {
  value: TemperatureSensitivity;
  onChange: (value: TemperatureSensitivity) => void;
  disabled?: boolean;
}

const OPTIONS: { value: TemperatureSensitivity; label: string; description: string }[] = [
  {
    value: "hot",
    label: "Run Hot",
    description: "I feel warmer than the actual temperature – recommend lighter gear",
  },
  {
    value: "neutral",
    label: "Neutral",
    description: "Standard recommendations based on actual temperature",
  },
  {
    value: "cold",
    label: "Run Cold",
    description: "I feel colder than the actual temperature – recommend warmer gear",
  },
];

export function TemperatureSensitivitySelector({
  value,
  onChange,
  disabled,
}: TemperatureSensitivitySelectorProps) {
  const selectedOption = OPTIONS.find((opt) => opt.value === value);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Temperature Sensitivity</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select sensitivity" />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedOption && (
        <p className="text-sm text-muted-foreground">{selectedOption.description}</p>
      )}
    </div>
  );
}
