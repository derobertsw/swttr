import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the design system's own radius and type names
// (globals.css). Without this it keeps both of rounded-full and
// rounded-control, and reads text-title as a color, dropping text-foreground.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["control", "card", "sheet"],
      text: ["title", "title-lg"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
