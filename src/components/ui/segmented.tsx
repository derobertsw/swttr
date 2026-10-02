// Styles for a row of mutually exclusive choices: effort levels, Now/Later,
// sensitivity. The caller keeps its own markup and keyboard handling (a
// radiogroup with arrow keys, or toggle buttons). The selected look follows
// aria-checked or aria-pressed, so what is announced and what is shown stay
// in step, and the selection is marked by fill, outline and weight.
const segmentedGroupClassName = "grid gap-1 rounded-control bg-muted p-1"

const segmentedItemClassName = [
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors max-md:min-h-11 pointer-coarse:min-h-11",
  "hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
  "aria-checked:bg-primary-soft aria-checked:font-semibold aria-checked:text-foreground aria-checked:inset-ring aria-checked:inset-ring-primary",
  "aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:inset-ring aria-pressed:inset-ring-primary",
].join(" ")

export { segmentedGroupClassName, segmentedItemClassName }
