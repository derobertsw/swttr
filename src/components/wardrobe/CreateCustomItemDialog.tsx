"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sparkles, Plus } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BodyPart, LayerType } from "@/types/wardrobe";
import { getGenericOptions, getGenericLayerClo } from "@/data/genericLayerClo";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import { logError } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface CreateCustomItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodyPart?: BodyPart;
  onItemCreated: () => void;
}

const BODY_PART_OPTIONS: { value: BodyPart; label: string }[] = [
  { value: "torso", label: "Torso" },
  { value: "legs", label: "Legs" },
  { value: "hands", label: "Hands" },
  { value: "headNeck", label: "Head/Neck" },
];

export function CreateCustomItemDialog({
  open,
  onOpenChange,
  bodyPart: initialBodyPart,
  onItemCreated,
}: CreateCustomItemDialogProps) {
  const isMobile = useIsMobile();
  const [bodyPart, setBodyPart] = useState<BodyPart>(initialBodyPart || "torso");
  const [layerType, setLayerType] = useState<LayerType>("base");
  const [genericOption, setGenericOption] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get available options for selected layer type
  const options = getGenericOptions(bodyPart, layerType);

  // Get CLO value for selected option
  const cloValue = genericOption
    ? getGenericLayerClo(bodyPart, layerType, genericOption)
    : null;

  // Set first option as default when layer type changes
  const handleLayerTypeChange = (newLayerType: LayerType) => {
    setLayerType(newLayerType);
    const newOptions = getGenericOptions(bodyPart, newLayerType);
    setGenericOption(newOptions[0] || "");
    setError(null);
  };

  // Initialize first option when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && initialBodyPart) {
      setBodyPart(initialBodyPart);
      const newOptions = getGenericOptions(initialBodyPart, layerType);
      if (newOptions.length > 0) {
        setGenericOption(newOptions[0]);
      }
    } else if (newOpen && options.length > 0 && !genericOption) {
      setGenericOption(options[0]);
    }
    if (!newOpen) {
      // Reset form
      setBodyPart(initialBodyPart || "torso");
      setLayerType("base");
      setGenericOption("");
      setCustomName("");
      setError(null);
    }
    onOpenChange(newOpen);
  };

  const handleBodyPartChange = (newBodyPart: BodyPart) => {
    setBodyPart(newBodyPart);
    // Reset layer-specific selections when changing body part
    const newOptions = getGenericOptions(newBodyPart, layerType);
    setGenericOption(newOptions[0] || "");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!genericOption || !customName.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/wardrobe/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body_part: bodyPart,
          layer_type: layerType,
          generic_option: genericOption,
          custom_name: customName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create custom item");
        setCreating(false);
        return;
      }

      // Success - close dialog and refresh wardrobe
      onOpenChange(false);
      onItemCreated();

      // Reset form
      setLayerType("base");
      setGenericOption("");
      setCustomName("");
    } catch (err) {
      logError("CreateCustomItemDialog.handleSubmit", err);
      setError("Failed to create custom item");
    } finally {
      setCreating(false);
    }
  };

  const content = (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Body Part Selection */}
      <div className="space-y-2">
        <p id="custom-item-body-part" className="text-sm font-medium text-foreground">
          Body Part
        </p>
        <div
          role="group"
          aria-labelledby="custom-item-body-part"
          className={cn(segmentedGroupClassName, "grid-cols-2 sm:grid-cols-4")}
        >
          {BODY_PART_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={bodyPart === option.value}
              onClick={() => handleBodyPartChange(option.value)}
              className={segmentedItemClassName}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p id="custom-item-layer-type" className="text-sm font-medium text-foreground">
          Layer Type
        </p>
        <Tabs value={layerType} onValueChange={(v) => handleLayerTypeChange(v as LayerType)}>
          <TabsList aria-labelledby="custom-item-layer-type" className="grid w-full grid-cols-3">
            <TabsTrigger value="base">Base</TabsTrigger>
            <TabsTrigger value="mid">Mid</TabsTrigger>
            <TabsTrigger value="outer">Outer</TabsTrigger>
          </TabsList>

          <TabsContent value={layerType} className="mt-5 space-y-5">
            <div className="space-y-2">
              <label htmlFor="insulation-level" className="block text-sm font-medium text-foreground">
                Insulation Level
              </label>
              <Select value={genericOption} onValueChange={setGenericOption}>
                <SelectTrigger id="insulation-level" className="w-full">
                  <SelectValue placeholder="Select insulation level" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cloValue !== null && (
              <div className="rounded-control bg-muted p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">Thermal Insulation</p>
                  <p className="font-mono text-3xl font-bold text-foreground">
                    {cloValue.toFixed(2)}
                  </p>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  CLO value for {genericOption.toLowerCase()} {layerType} layer
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="custom-name" className="block text-sm font-medium text-foreground">
                Custom Name
              </label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., My favorite merino base layer"
                maxLength={50}
                required
              />
              <p className="text-sm text-muted-foreground">
                {customName.length}/50 characters
              </p>
            </div>

            {error && (
              <div role="alert" className="rounded-control bg-destructive-soft p-4">
                <p className="text-sm font-medium text-destructive">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={creating}
              disabled={!creating && (!genericOption || !customName.trim())}
            >
              {creating ? (
                "Adding..."
              ) : (
                <>
                  <Plus className="size-5" />
                  Add to Wardrobe
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </form>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent showCloseButton className="h-[90dvh]">
          <DrawerHeader className="pr-14 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <DrawerTitle>Add Custom Item</DrawerTitle>
            </div>
            <DrawerDescription>
              Create a generic item with custom name and insulation level
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="pb-6">{content}</DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-none border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <DialogTitle>Add Custom Item</DialogTitle>
          </div>
          <DialogDescription>
            Create a generic item with custom name and insulation level
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
