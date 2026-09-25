import { Backpack } from "lucide-react";

/** Items carried but not worn during the shown ski-touring phase. */
export function PackItemsCard({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-white/20 bg-white/[0.06] px-3.5 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
        <Backpack className="size-3.5" />
        In the Pack
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((name) => (
            <li key={name} className="text-sm text-white/80">
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-white/40">Nothing extra in the pack.</p>
      )}
    </div>
  );
}
