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
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Trash2 } from "lucide-react";
import { WardrobeItem } from "@/types/wardrobe";
import { ItemDetailContent } from "./item-detail/ItemDetailContent";
import { getItemHeaderContext } from "./item-detail/detail-formatters";

interface ItemDetailCardProps {
  item: WardrobeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove?: (wardrobeId: string) => void;
}

export function ItemDetailCard({ item, open, onOpenChange, onRemove }: ItemDetailCardProps) {
  const isMobile = useIsMobile();

  if (!item) return null;

  const title = `${item.details.brand} ${item.details.model_name}`;
  const description = getItemHeaderContext(item);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="rounded-t-2xl border-t-border/60 bg-background/95">
          <div className="mx-auto w-full max-w-sm max-h-[84vh] overflow-y-auto pb-8">
            <DrawerHeader className="px-5 pb-2 pt-2">
              <DrawerTitle className="text-2xl leading-tight">{title}</DrawerTitle>
              <DrawerDescription className="sr-only">{description}</DrawerDescription>
            </DrawerHeader>
            <div className="px-5">
              <ItemDetailContent item={item} />
              {onRemove && (
                <button
                  type="button"
                  onClick={() => { onRemove(item.id); onOpenChange(false); }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 hover:border-red-300"
                >
                  <Trash2 className="size-3.5" />
                  Remove from wardrobe
                </button>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto border-border/60 bg-background/95">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <ItemDetailContent item={item} />
        {onRemove && (
          <button
            type="button"
            onClick={() => { onRemove(item.id); onOpenChange(false); }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 hover:border-red-300"
          >
            <Trash2 className="size-3.5" />
            Remove from wardrobe
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
