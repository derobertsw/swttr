import { formatCategory } from "../wardrobe-utils";

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {formatCategory(category)}
    </span>
  );
}
