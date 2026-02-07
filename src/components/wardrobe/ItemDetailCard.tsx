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

interface ItemDetailCardProps {
  item: WardrobeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ItemDetailCard({ item, open, onOpenChange }: ItemDetailCardProps) {
  const isMobile = useIsMobile();

  if (!item) return null;

  const title = `${item.details.brand} ${item.details.model_name}`;
  const description = item.nickname || "Wardrobe item details";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm pb-8 overflow-y-auto max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <div className="px-4">
              <ItemDetailContent item={item} />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ItemDetailContent item={item} />
      </DialogContent>
    </Dialog>
  );
}
