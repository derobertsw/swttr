import { formatCategory } from "../wardrobe-utils";

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      {formatCategory(category)}
    </span>
  );
}
