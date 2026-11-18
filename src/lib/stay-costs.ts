/**
 * The currencies an option's cost estimate can be in (#213), for the editor's
 * choice and the server's check. Costs in different currencies are never
 * compared or converted.
 */
export const STAY_COST_CURRENCIES = ["USD", "CAD", "EUR", "GBP", "CHF", "AUD", "NZD", "JPY", "NOK", "SEK"] as const;
