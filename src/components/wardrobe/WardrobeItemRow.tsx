import { useRef } from "react";
import { CircleCheck, CircleSlash, EllipsisVertical, Trash2, X } from "lucide-react";
import type { WardrobeItem } from "@/types/wardrobe";
import type { ActionState, RowAction } from "@/hooks/useWardrobe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ItemThumbnail } from "./ItemThumbnail";
import { getItemBrandLabel, getItemCategoryLabel } from "./wardrobe-utils";

const PENDING_LABELS: Record<RowAction, string> = {
  remove: "Removing…",
  exclude: "Excluding…",
  include: "Including…",
};

const FAILED_LABELS: Record<RowAction, string> = {
  remove: "Couldn't remove this item.",
  exclude: "Couldn't exclude this item.",
  include: "Couldn't include this item.",
};

/** The id of a row's actions button, for returning focus after a change. */
export function rowActionsId(wardrobeId: string) {
  return `wardrobe-actions-${wardrobeId}`;
}

/** The id of the button that opens a row's details. */
export function rowButtonId(wardrobeId: string) {
  return `wardrobe-item-${wardrobeId}`;
}

interface WardrobeItemRowProps {
  item: WardrobeItem;
  state?: ActionState<RowAction>;
  onOpen: () => void;
  onSetExcluded: (excluded: boolean) => void;
  onRemove: () => void;
  onRetry: () => void;
  onDismissError: () => void;
}

export function WardrobeItemRow({
  item,
  state,
  onOpen,
  onSetExcluded,
  onRemove,
  onRetry,
  onDismissError,
}: WardrobeItemRowProps) {
  const name = item.details.model_name;
  const pending = state && !state.failed ? state.action : null;
  const failed = state?.failed ? state.action : null;
  const actionsRef = useRef<HTMLButtonElement>(null);
  // Retry and Dismiss remove the error strip they sit in, so focus moves to
  // the row's actions first.
  const fromErrorStrip = (action: () => void) => () => {
    actionsRef.current?.focus();
    action();
  };

  return (
    <li aria-busy={pending !== null} className="rounded-card border border-border bg-card text-card-foreground">
      <div className="flex items-center gap-1 p-1.5">
        <button
          id={rowButtonId(item.id)}
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-control p-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ItemThumbnail item={item} className={cn(item.disabled && "opacity-60")} />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 font-semibold leading-tight text-foreground">{name}</span>
            <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {getItemCategoryLabel(item)} · {getItemBrandLabel(item)}
            </span>
            {item.disabled && (
              <Badge size="sm" variant="outline" className="mt-1.5">
                Excluded from recommendations
              </Badge>
            )}
          </span>
        </button>

        {pending && <span className="shrink-0 px-1 text-sm text-muted-foreground">{PENDING_LABELS[pending]}</span>}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={actionsRef}
              id={rowActionsId(item.id)}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${name}`}
              className="shrink-0 text-muted-foreground"
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* The trigger stays focusable during a change, so focus can return to it. */}
            {item.disabled ? (
              <DropdownMenuItem disabled={pending !== null} onSelect={() => onSetExcluded(false)}>
                <CircleCheck />
                Include in recommendations
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={pending !== null} onSelect={() => onSetExcluded(true)}>
                <CircleSlash />
                Exclude from recommendations
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={pending !== null} onSelect={onRemove}>
              <Trash2 />
              Remove from wardrobe
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {failed && (
        <div role="alert" className="flex items-center gap-2 border-t border-border py-1.5 pr-1.5 pl-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-destructive">{FAILED_LABELS[failed]}</p>
          <Button type="button" variant="outline" size="sm" onClick={fromErrorStrip(onRetry)}>
            Retry
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={fromErrorStrip(onDismissError)} aria-label="Dismiss">
            <X />
          </Button>
        </div>
      )}
    </li>
  );
}
