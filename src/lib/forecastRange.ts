/**
 * How far ahead forecasts reach, shared by one-day (/api/weather) and
 * multi-day (/api/plan-ahead) plans so both say the same thing when a date
 * falls outside it.
 */

/** Days of hourly forecast Open-Meteo has, today included. */
export const FORECAST_DAYS = 16;

/** A YYYY-MM-DD date moved by a number of days. */
export function addDaysToDateString(dateString: string, daysToAdd: number): string {
  const [year, month, day] = dateString.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day + daysToAdd)).toISOString().slice(0, 10);
}

/** A YYYY-MM-DD date as it's shown in range messages, e.g. "Oct 12". */
function formatRangeDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
    .format(Date.parse(`${dateString}T00:00:00Z`));
}

/** "The forecast for this place covers Sep 27 to Oct 12." for its first and last YYYY-MM-DD dates. */
export function describeForecastCoverage(firstDate: string, lastDate: string): string {
  return `The forecast for this place covers ${formatRangeDate(firstDate)} to ${formatRangeDate(lastDate)}.`;
}

/**
 * Why a plan of `durationDays` from `startDate` can't be built from a forecast
 * covering `firstDate` to `lastDate`, or null when the forecast covers it.
 * All dates are YYYY-MM-DD on the place's calendar.
 */
export function planOutsideForecast(
  startDate: string,
  durationDays: number,
  firstDate: string,
  lastDate: string
): string | null {
  const endDate = addDaysToDateString(startDate, durationDays - 1);
  if (startDate >= firstDate && endDate <= lastDate) return null;

  const coverage = describeForecastCoverage(firstDate, lastDate);
  const latestStart = addDaysToDateString(lastDate, -(durationDays - 1));
  if (durationDays === 1 || latestStart < firstDate) {
    return `${coverage} Pick a date in that range.`;
  }
  return latestStart === firstDate
    ? `${coverage} A ${durationDays}-day plan has to start on ${formatRangeDate(firstDate)}.`
    : `${coverage} A ${durationDays}-day plan can start from ${formatRangeDate(firstDate)} to ${formatRangeDate(latestStart)}.`;
}
