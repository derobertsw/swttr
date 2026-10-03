"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  dialogCloseClassName,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Whether the sheet is a drawer, so its title and description use the drawer's primitives.
const InDrawer = createContext(false);

const glassClassName = "border-white/14 bg-slate-950/95 text-white";
const closeClassName = cn(
  dialogCloseClassName,
  "text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-50"
);

interface TripSheetProps {
  open: boolean;
  /** Escape, the close button, a tap outside or a swipe down. Ignored while busy. */
  onClose: () => void;
  /** Saving or removing: nothing closes the sheet until it's done. */
  busy?: boolean;
  /** The title, and anything that goes with it. */
  header: ReactNode;
  children: ReactNode;
  /** The sheet's actions. */
  footer: ReactNode;
  /** False when nothing in the sheet is a TripSheetDescription. */
  described?: boolean;
  /** For the dialog on wider screens, e.g. its max width. */
  className?: string;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * A trip overlay in the trips' dark-glass look: a dialog on wider screens and
 * a bottom drawer on phones. Focus moves into it and stays there until it
 * closes.
 */
export function TripSheet({
  open,
  onClose,
  busy = false,
  header,
  children,
  footer,
  described = true,
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
}: TripSheetProps) {
  const isMobile = useIsMobile();
  const onOpenChange = (next: boolean) => {
    if (!next && !busy) onClose();
  };
  // Without a description, say so, or Radix warns that one is missing.
  const describedBy = described ? {} : { "aria-describedby": undefined };

  if (isMobile) {
    return (
      <InDrawer.Provider value={true}>
        <Drawer open={open} onOpenChange={onOpenChange} dismissible={!busy}>
          <DrawerContent
            className={cn(glassClassName, "shadow-[0_-12px_40px_rgba(0,0,0,0.5)]")}
            onOpenAutoFocus={onOpenAutoFocus}
            onCloseAutoFocus={onCloseAutoFocus}
            {...describedBy}
          >
            <DrawerHeader className="pr-14">{header}</DrawerHeader>
            <DrawerBody className="pb-4">{children}</DrawerBody>
            <DrawerFooter className="border-white/10">{footer}</DrawerFooter>
            <DrawerClose disabled={busy} className={closeClassName}>
              <XIcon />
              <span className="sr-only">Close</span>
            </DrawerClose>
          </DrawerContent>
        </Drawer>
      </InDrawer.Provider>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(glassClassName, "p-5", className)}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        {...describedBy}
      >
        <div className="pr-10">{header}</div>
        <div>{children}</div>
        <div className="flex flex-col gap-2">{footer}</div>
        <DialogClose disabled={busy} className={closeClassName}>
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function TripSheetTitle({ className, ...props }: ComponentProps<typeof DialogTitle>) {
  const Title = useContext(InDrawer) ? DrawerTitle : DialogTitle;
  return <Title className={cn("text-base font-semibold text-white", className)} {...props} />;
}

export function TripSheetDescription({ className, ...props }: ComponentProps<typeof DialogDescription>) {
  const Description = useContext(InDrawer) ? DrawerDescription : DialogDescription;
  return <Description className={cn("text-white/85", className)} {...props} />;
}
