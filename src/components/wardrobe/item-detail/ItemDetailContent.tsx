import { WardrobeItem } from "@/types/wardrobe";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GarmentDetails } from "./GarmentDetails";
import { HandwearDetails } from "./HandwearDetails";
import { HeadwearDetails } from "./HeadwearDetails";
import { getItemFacts } from "./detail-formatters";
import { getWardrobeMediaRef, resolveItemImageUrl, resolveBrandLogoUrl, toCssBackgroundImage, getBrandInitials } from "../media";
import { LAYER_LABELS } from "../wardrobe-utils";

export function ItemDetailContent({ item }: { item: WardrobeItem }) {
  const isCustom = item.item_type === "custom";

  return (
    <div className="flex w-full flex-col gap-4">
      {!isCustom && <ItemPhoto item={item} />}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {getItemFacts(item).map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="font-medium text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {isCustom ? (
        <section aria-labelledby="custom-estimate" className="rounded-control bg-muted p-3 text-sm">
          <h3 id="custom-estimate" className="font-medium text-foreground">
            Estimated properties
          </h3>
          <p className="mt-1 text-muted-foreground">
            This is a custom item, so recommendations treat it like a typical{" "}
            {item.details.generic_option?.toLowerCase() ?? "item"}
            {item.details.layer_type ? ` ${LAYER_LABELS[item.details.layer_type].toLowerCase()}` : ""}. Its
            values are estimates, not measurements.
          </p>
        </section>
      ) : (
        <Accordion type="single" collapsible>
          <AccordionItem value="technical" className="border-border">
            <AccordionTrigger>Technical details</AccordionTrigger>
            <AccordionContent>
              {item.item_type === "garment" && <GarmentDetails details={item.details} />}
              {item.item_type === "handwear" && <HandwearDetails details={item.details} />}
              {item.item_type === "headwear" && <HeadwearDetails details={item.details} />}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

function ItemPhoto({ item }: { item: WardrobeItem }) {
  const media = getWardrobeMediaRef(item);
  const brand = item.details.brand || "Unknown brand";

  // Catalog photos have white backgrounds, so the image well stays white in
  // both appearances.
  return (
    <div className="relative aspect-[4/3] max-h-64 w-full overflow-hidden rounded-card border border-border bg-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: toCssBackgroundImage(resolveItemImageUrl(media)) }}
      />
      <div
        className="absolute top-3 left-3 flex h-10 w-24 items-center justify-center overflow-hidden rounded-control border border-black/10 bg-white px-2 shadow-sm"
        title={brand}
        aria-label={`${brand} logo`}
      >
        <span className="pointer-events-none text-[10px] font-semibold tracking-[0.14em] text-slate-700 uppercase">
          {getBrandInitials(brand)}
        </span>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-white bg-contain bg-center bg-no-repeat p-1.5"
          style={{ backgroundImage: toCssBackgroundImage(resolveBrandLogoUrl(media)) }}
        />
      </div>
    </div>
  );
}
