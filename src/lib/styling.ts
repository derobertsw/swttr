/**
 * Centralized styling utilities
 * Common Tailwind class patterns used throughout the app
 */

// Frosted glass input styling
export const FROSTED_INPUT = "bg-white/15 backdrop-blur-sm border-white/40 text-white/70";
export const FROSTED_INPUT_PLACEHOLDER = "placeholder:text-white/70";
export const FROSTED_INPUT_FULL = `${FROSTED_INPUT} ${FROSTED_INPUT_PLACEHOLDER}`;

// Suggestions dropdown styling
export const SUGGESTIONS_DROPDOWN = "bg-background border rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)]";

// Card shadow
export const CARD_SHADOW = "shadow-[0_5px_14px_rgba(0,0,0,0.3)]";

// Layer display card
export const LAYER_CARD = "rounded-lg bg-white/40 backdrop-blur-[2px] p-5";

// Label styling
export const FORM_LABEL = "text-sm font-medium text-white/80";

// Icon positioning in inputs
export const INPUT_ICON_LEFT = "absolute left-3 top-1/2 -translate-y-1/2";
