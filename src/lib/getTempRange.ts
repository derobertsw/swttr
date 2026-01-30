import { TemperatureSensitivity } from "@/types/preferences";

export const TEMP_BRACKETS = [
  "-20--15", "-15--10", "-10--5", "-5-0", "0-5", "5-10", "10-15",
  "15-20", "20-25", "25-30", "30-35", "35-40", "40+"
] as const;

export type TempBracket = typeof TEMP_BRACKETS[number];

export function getTempRange(temp: number): TempBracket {
  if (temp < -15) return "-20--15";
  if (temp < -10) return "-15--10";
  if (temp < -5) return "-10--5";
  if (temp < 0) return "-5-0";
  if (temp < 5) return "0-5";
  if (temp < 10) return "5-10";
  if (temp < 15) return "10-15";
  if (temp < 20) return "15-20";
  if (temp < 25) return "20-25";
  if (temp < 30) return "25-30";
  if (temp < 35) return "30-35";
  if (temp < 40) return "35-40";
  return "40+";
}

export function getAdjustedTempRange(temp: number, sensitivity: TemperatureSensitivity): TempBracket {
  const baseIndex = TEMP_BRACKETS.indexOf(getTempRange(temp));
  if (sensitivity === 'hot') return TEMP_BRACKETS[Math.min(baseIndex + 1, TEMP_BRACKETS.length - 1)];
  if (sensitivity === 'cold') return TEMP_BRACKETS[Math.max(baseIndex - 1, 0)];
  return TEMP_BRACKETS[baseIndex];
}
