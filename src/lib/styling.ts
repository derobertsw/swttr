/**
 * Centralized styling utilities
 * Common Tailwind class patterns used throughout the app
 */

// Frosted glass input styling with stronger contrast for outdoor readability
export const FROSTED_INPUT =
  "bg-white/[0.16] backdrop-blur-xl border-white/45 text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/30";
export const FROSTED_INPUT_PLACEHOLDER = "placeholder:text-white/70";
export const FROSTED_INPUT_FULL = `${FROSTED_INPUT} ${FROSTED_INPUT_PLACEHOLDER}`;

// Suggestions dropdown styling
export const SUGGESTIONS_DROPDOWN =
  "bg-[rgba(247,249,255,0.94)] text-slate-900 border border-white/80 backdrop-blur-2xl rounded-2xl shadow-[0_14px_34px_rgba(9,15,30,0.3)]";

// Card shadow
export const CARD_SHADOW = "shadow-[0_8px_24px_rgba(0,0,0,0.28)]";

// Layer display card
export const LAYER_CARD = "rounded-xl bg-white/35 backdrop-blur-sm p-5";

// Label styling
export const FORM_LABEL = "text-sm font-medium text-white/82";
