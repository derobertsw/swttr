/** Optional XC context; absence preserves the explicitly unknown state. */
export type OutingPattern = 'continuous' | 'frequent_stops' | 'unknown';
export type XCExposure = 'sheltered' | 'exposed' | 'descents' | 'unknown';

export interface XCContext {
  outingPattern?: OutingPattern;
  xcExposure?: XCExposure;
}

/** Accept supported XC choices or omitted fields; reject invalid persisted or request values. */
export function isXCContext(value: { outingPattern?: unknown; xcExposure?: unknown }): value is XCContext {
  return (value.outingPattern === undefined || ['continuous', 'frequent_stops', 'unknown'].includes(value.outingPattern as string))
    && (value.xcExposure === undefined || ['sheltered', 'exposed', 'descents', 'unknown'].includes(value.xcExposure as string));
}
