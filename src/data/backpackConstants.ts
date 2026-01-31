export const BACKPACK_ACTIVITIES = [
  { value: "backcountry-skiing", label: "Backcountry Skiing" },
  { value: "xc-skiing", label: "XC Skiing" },
] as const;

export const BACKPACK_ACTIVITY_IDS: string[] = BACKPACK_ACTIVITIES.map((a) => a.value);

export const TEMP_RANGES = [
  { value: "-20--15", label: "-20 to -15°F" },
  { value: "-15--10", label: "-15 to -10°F" },
  { value: "-10--5", label: "-10 to -5°F" },
  { value: "-5-0", label: "-5 to 0°F" },
  { value: "0-5", label: "0 to 5°F" },
  { value: "5-10", label: "5 to 10°F" },
  { value: "10-15", label: "10 to 15°F" },
  { value: "15-20", label: "15 to 20°F" },
  { value: "20-25", label: "20 to 25°F" },
  { value: "25-30", label: "25 to 30°F" },
  { value: "30-35", label: "30 to 35°F" },
  { value: "35-40", label: "35 to 40°F" },
  { value: "40+", label: "40°F+" },
] as const;
