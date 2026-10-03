"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { chipClassName } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { SegmentedChoice, arrowKeyTarget } from "@/components/SegmentedChoice";
import type { BodyPart, LayerType, WardrobeItem } from "@/types/wardrobe";
import { getGenericOptions, getGenericLayerClo } from "@/data/genericLayerClo";
import { logError } from "@/lib/logger";
import { BODY_AREAS, LAYER_LABELS, formatBodyPartLabel } from "./wardrobe-utils";

const NAME_LIMIT = 50;
const LAYERS: LayerType[] = ["base", "mid", "outer"];
const BODY_AREA_OPTIONS = BODY_AREAS.map((area) => ({ value: area, label: formatBodyPartLabel(area) }));

interface Kind {
  layer: LayerType;
  option: string;
}

interface CreateCustomItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting body area and name, e.g. from a catalog search that found nothing. */
  defaults?: { bodyPart?: BodyPart; name?: string };
  onItemCreated: (item: WardrobeItem) => void;
  /** Where focus goes when the form closes. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function CreateCustomItemDialog({
  open,
  onOpenChange,
  defaults,
  onItemCreated,
  onCloseAutoFocus,
}: CreateCustomItemDialogProps) {
  const isMobile = useIsMobile();
  const formId = useId();
  const [creating, setCreating] = useState(false);
  const title = "Add a similar item";
  const description = "For gear the catalog doesn't have. Pick what it's most like and SWTTR estimates its warmth.";
  const form = (
    <CustomItemForm
      id={formId}
      defaults={defaults}
      creating={creating}
      onCreatingChange={setCreating}
      onItemCreated={onItemCreated}
    />
  );
  const submit = (
    <Button type="submit" form={formId} size="lg" loading={creating} className="w-full sm:w-auto">
      <Plus />
      Add to wardrobe
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent showCloseButton className="h-[90dvh]" onCloseAutoFocus={onCloseAutoFocus}>
          <DrawerHeader className="pr-14 pb-3">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="pb-4">{form}</DrawerBody>
          <DrawerFooter>{submit}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader className="flex-none border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{form}</div>
        <DialogFooter className="flex-none border-t border-border px-6 py-4">{submit}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomItemForm({
  id,
  defaults,
  creating,
  onCreatingChange: setCreating,
  onItemCreated,
}: {
  id: string;
  defaults?: CreateCustomItemDialogProps["defaults"];
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  onItemCreated: (item: WardrobeItem) => void;
}) {
  const [bodyPart, setBodyPart] = useState<BodyPart>(defaults?.bodyPart ?? "torso");
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState(defaults?.name?.slice(0, NAME_LIMIT) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const kindRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const kinds: Kind[] = LAYERS.flatMap((layer) =>
    getGenericOptions(bodyPart, layer).map((option) => ({ layer, option }))
  );
  const selectedIndex = kind ? kinds.findIndex((k) => k.layer === kind.layer && k.option === kind.option) : -1;
  const clo = kind ? getGenericLayerClo(bodyPart, kind.layer, kind.option) : null;
  const missingKind = showMissing && !kind;
  const missingName = showMissing && !name.trim();

  const handleBodyPartChange = (next: BodyPart) => {
    setBodyPart(next);
    setKind(null);
    setError(null);
  };

  const handleKindKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = arrowKeyTarget(event.key, index, kinds.length);
    if (target === null) return;
    event.preventDefault();
    kindRefs.current[target]?.focus();
    setKind(kinds[target]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setError(null);
    if (!kind || !name.trim()) {
      setShowMissing(true);
      // Take the user to the first thing that's missing.
      if (!kind) kindRefs.current[0]?.focus();
      else document.getElementById(`${id}-name`)?.focus();
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/wardrobe/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body_part: bodyPart,
          layer_type: kind.layer,
          generic_option: kind.option,
          custom_name: name.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { item?: WardrobeItem; error?: string };

      if (!res.ok || !data.item) {
        setError(
          res.status === 409 && data.error
            ? data.error
            : "Couldn't add this item. Check your connection and try again."
        );
        return;
      }
      onItemCreated(data.item);
    } catch (err) {
      logError("CustomItemForm.handleSubmit", err);
      setError("Couldn't add this item. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <form id={id} onSubmit={handleSubmit} aria-busy={creating} noValidate className="flex flex-col gap-6">
      <SegmentedChoice
        label="Body area"
        options={BODY_AREA_OPTIONS}
        value={bodyPart}
        onChange={handleBodyPartChange}
        groupClassName="grid-flow-row grid-cols-2 sm:grid-cols-4"
      />

      <div className="flex flex-col gap-2">
        <p id={`${id}-kind`} className="text-sm font-medium text-foreground">
          What is it most like?
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`${id}-kind`}
          aria-required="true"
          aria-invalid={missingKind || undefined}
          aria-describedby={missingKind ? `${id}-kind-error` : undefined}
          className="flex flex-col gap-3"
        >
          {LAYERS.map((layer) => {
            const layerKinds = kinds.filter((k) => k.layer === layer);
            if (layerKinds.length === 0) return null;
            const layerLabelId = `${id}-${layer}`;
            return (
              <div key={layer}>
                <p id={layerLabelId} className="mb-1.5 text-sm text-muted-foreground">
                  {LAYER_LABELS[layer]}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {layerKinds.map((k) => {
                    const index = kinds.indexOf(k);
                    const checked = index === selectedIndex;
                    // Tab reaches the chosen kind, or the first one before any is chosen.
                    const tabbable = selectedIndex === -1 ? index === 0 : checked;
                    return (
                      <button
                        key={k.option}
                        ref={(element) => {
                          kindRefs.current[index] = element;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-describedby={layerLabelId}
                        tabIndex={tabbable ? 0 : -1}
                        onClick={() => {
                          setKind(k);
                          setError(null);
                        }}
                        onKeyDown={(event) => handleKindKeyDown(event, index)}
                        className={chipClassName}
                      >
                        {k.option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {missingKind && (
          <p id={`${id}-kind-error`} className="text-sm font-medium text-destructive">
            Choose what it&apos;s most like.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`} className="text-sm font-medium text-foreground">
          Name
        </label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Old ski jacket"
          maxLength={NAME_LIMIT}
          required
          aria-invalid={missingName || undefined}
          aria-describedby={`${id}-name-hint`}
        />
        <p id={`${id}-name-hint`} className="text-sm text-muted-foreground">
          {missingName ? (
            <span className="font-medium text-destructive">Give it a name. </span>
          ) : null}
          How it shows in your wardrobe. {name.length}/{NAME_LIMIT} characters.
        </p>
      </div>

      {kind && clo !== null && (
        <section aria-labelledby={`${id}-estimate`} className="rounded-control bg-muted p-3 text-sm">
          <h3 id={`${id}-estimate`} className="font-medium text-foreground">
            Estimated properties
          </h3>
          <p className="mt-1 text-muted-foreground">
            Recommendations treat it like a typical {kind.option.toLowerCase()}{" "}
            {LAYER_LABELS[kind.layer].toLowerCase()}. You don&apos;t need exact numbers.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium text-foreground">Technical details</summary>
            <p className="mt-1 text-muted-foreground">
              Estimated insulation: <span className="font-mono">{clo.toFixed(2)} clo</span>
            </p>
          </details>
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-destructive-soft p-3 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
