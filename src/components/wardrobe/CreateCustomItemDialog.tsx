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
import { logError } from "@/lib/logger";

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
    if (newOpen && options.length > 0 && !genericOption) {
      setGenericOption(options[0]);
    }
    if (newOpen && initialBodyPart) {
      setBodyPart(initialBodyPart);
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
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-900">Body Part</label>
        <div className="flex flex-wrap gap-2">
          {BODY_PART_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleBodyPartChange(option.value)}
              className={`rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                bodyPart === option.value
                  ? "border-emerald-700 bg-emerald-700 text-white shadow-lg ring-2 ring-emerald-300 ring-offset-2"
                  : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-900">Layer Type</label>
        <Tabs value={layerType} onValueChange={(v) => handleLayerTypeChange(v as LayerType)}>
          <TabsList className="grid w-full grid-cols-3 bg-slate-100">
            <TabsTrigger value="base" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Base</TabsTrigger>
            <TabsTrigger value="mid" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Mid</TabsTrigger>
            <TabsTrigger value="outer" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Outer</TabsTrigger>
          </TabsList>

          <TabsContent value={layerType} className="mt-5 space-y-5">
            <div className="space-y-3">
              <label htmlFor="insulation-level" className="block text-sm font-semibold text-slate-900">
                Insulation Level
              </label>
              <Select value={genericOption} onValueChange={setGenericOption}>
                <SelectTrigger id="insulation-level" className="h-11 border-slate-300 bg-white">
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
              <div className="rounded-lg border-2 border-sky-200 bg-sky-50 p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Thermal Insulation</p>
                  <p className="font-mono text-3xl font-bold text-sky-800">
                    {cloValue.toFixed(2)}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-sky-700">
                  CLO value for {genericOption.toLowerCase()} {layerType} layer
                </p>
              </div>
            )}

            <div className="space-y-3">
              <label htmlFor="custom-name" className="block text-sm font-semibold text-slate-900">
                Custom Name
              </label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., My favorite merino base layer"
                maxLength={50}
                required
                className="h-11 border-slate-300 bg-white"
              />
              <p className="text-xs text-slate-500">
                {customName.length}/50 characters
              </p>
            </div>

            {error && (
              <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700"
              disabled={creating || !genericOption || !customName.trim()}
            >
              {creating ? (
                "Adding..."
              ) : (
                <>
                  <Plus className="mr-2 size-5" />
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
        <DrawerContent className="h-[90vh] rounded-t-2xl border-t-border/60 bg-background">
          <div className="flex h-full w-full flex-col">
            <DrawerHeader className="flex-none px-4 pb-3 pt-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-emerald-600" />
                <DrawerTitle className="text-xl font-semibold">
                  Add Custom Item
                </DrawerTitle>
              </div>
              <DrawerDescription className="text-sm text-muted-foreground">
                Create a generic item with custom name and insulation level
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-safe">{content}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-2xl flex-col overflow-hidden border-border/60 bg-background p-0">
        <DialogHeader className="flex-none border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-emerald-600" />
            <DialogTitle className="text-xl font-semibold">Add Custom Item</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Create a generic item with custom name and insulation level
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
