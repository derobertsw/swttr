/**
 * Centralized styling utilities
 * Common Tailwind class patterns used throughout the app
 */

// Frosted glass input styling with stronger contrast for outdoor readability
export const FROSTED_INPUT =
  "bg-white/22 backdrop-blur-md border-white/60 text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]";
export const FROSTED_INPUT_PLACEHOLDER = "placeholder:text-white/80";
export const FROSTED_INPUT_FULL = `${FROSTED_INPUT} ${FROSTED_INPUT_PLACEHOLDER}`;

// Suggestions dropdown styling
export const SUGGESTIONS_DROPDOWN =
  "bg-white/95 text-slate-900 border border-white/60 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)]";

// Card shadow
export const CARD_SHADOW = "shadow-[0_5px_14px_rgba(0,0,0,0.3)]";

// Layer display card
export const LAYER_CARD = "rounded-lg bg-white/40 backdrop-blur-[2px] p-5";

// Label styling
export const FORM_LABEL = "text-sm font-medium text-white/80";

// Icon positioning in inputs
export const INPUT_ICON_LEFT = "absolute left-3 top-1/2 -translate-y-1/2";
