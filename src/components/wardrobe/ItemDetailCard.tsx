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
import { WardrobeItem } from "@/types/wardrobe";
import { ItemDetailContent } from "./item-detail/ItemDetailContent";
import { getItemHeaderContext } from "./item-detail/detail-formatters";

interface ItemDetailCardProps {
  item: WardrobeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ItemDetailCard({ item, open, onOpenChange }: ItemDetailCardProps) {
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
              <DrawerDescription className="text-muted-foreground/90">{description}</DrawerDescription>
            </DrawerHeader>
            <div className="px-5">
              <ItemDetailContent item={item} />
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
          <DialogDescription className="text-muted-foreground/90">{description}</DialogDescription>
        </DialogHeader>
        <ItemDetailContent item={item} />
      </DialogContent>
    </Dialog>
  );
}
