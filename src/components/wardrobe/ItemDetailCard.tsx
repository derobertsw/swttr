"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CircleCheck, CircleSlash, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WardrobeItem } from "@/types/wardrobe";
import type { ActionState, RowAction } from "@/hooks/useWardrobe";
import { ItemDetailContent } from "./item-detail/ItemDetailContent";
import { getItemBrandLabel, getItemCategoryLabel } from "./wardrobe-utils";

interface ItemDetailCardProps {
  item: WardrobeItem | null;
  /** The item's change in flight, or the one that failed. */
  state?: ActionState<RowAction>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetExcluded: (excluded: boolean) => void;
  onRemove: () => void;
  onRetry: () => void;
}

const FAILED_LABELS: Record<RowAction, string> = {
  remove: "Couldn't remove this item.",
  exclude: "Couldn't exclude this item.",
  include: "Couldn't include this item.",
};

export function ItemDetailCard({ item, state, open, onOpenChange, onSetExcluded, onRemove, onRetry }: ItemDetailCardProps) {
  const isMobile = useIsMobile();

  if (!item) return null;

  const title = item.details.model_name;
  const description = `${getItemCategoryLabel(item)} · ${getItemBrandLabel(item)}`;
  const pending = state && !state.failed ? state.action : null;
  const excluded = Boolean(item.disabled);

  const actions = (
    <div className="flex w-full flex-col gap-4">
      <section aria-labelledby="item-inclusion" className="flex flex-col gap-2 rounded-control bg-muted p-3">
        <h3 id="item-inclusion" className="text-sm font-semibold text-foreground">
          {excluded ? "Excluded from recommendations" : "Included in recommendations"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {excluded
            ? "Recommendations won't suggest it. This applies everywhere on your account, not just one trip."
            : "Recommendations can suggest it. Excluding it applies everywhere on your account, not just one trip."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          loading={pending === "exclude" || pending === "include"}
          disabled={pending === "remove"}
          onClick={() => onSetExcluded(!excluded)}
        >
          {excluded ? <CircleCheck /> : <CircleSlash />}
          {excluded ? "Include in recommendations" : "Exclude from recommendations"}
        </Button>
      </section>

      {state?.failed && (
        <div role="alert" className="flex items-center gap-2 rounded-control bg-destructive-soft py-1.5 pr-1.5 pl-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-destructive">{FAILED_LABELS[state.action]}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={pending === "remove"}
          disabled={pending === "exclude" || pending === "include"}
          onClick={onRemove}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          <Trash2 />
          Remove from wardrobe
        </Button>
        <p className="text-sm text-muted-foreground">You can restore it until you leave this page.</p>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent showCloseButton>
          <div className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col">
            <DrawerHeader className="pr-14 pb-2">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="flex flex-col gap-4 pb-8">
              <ItemDetailContent item={item} />
              {actions}
            </DrawerBody>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ItemDetailContent item={item} />
        {actions}
      </DialogContent>
    </Dialog>
  );
}
