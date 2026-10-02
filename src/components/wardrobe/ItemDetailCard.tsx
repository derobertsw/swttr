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
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const removeButton = onRemove && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => { onRemove(item.id); onOpenChange(false); }}
      className="text-destructive hover:bg-destructive-soft hover:text-destructive"
    >
      <Trash2 />
      Remove from wardrobe
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent showCloseButton>
          <div className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col">
            <DrawerHeader className="pr-14 pb-2">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription className="sr-only">{description}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="flex flex-col items-start gap-4 pb-8">
              <ItemDetailContent item={item} />
              {removeButton}
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
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <ItemDetailContent item={item} />
        {removeButton && <div>{removeButton}</div>}
      </DialogContent>
    </Dialog>
  );
}
