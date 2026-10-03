// Styles for a wrapping row of filter chips: body area, layer, sort, brand.
// Use segmented choices when the options fit one row. Each chip is a <button>;
// a toggle sets aria-pressed and a radio sets aria-checked, which drives the
// selected look (fill, outline and weight), the same as segmented choices.
const chipClassName = [
  "inline-flex min-h-9 items-center justify-center gap-1 rounded-full border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors select-none max-md:min-h-11 pointer-coarse:min-h-11 [&_svg]:size-3.5 [&_svg]:shrink-0",
  "hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
  "aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-foreground",
  "aria-checked:border-primary aria-checked:bg-primary-soft aria-checked:font-semibold aria-checked:text-foreground",
].join(" ")

export { chipClassName }
