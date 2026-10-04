import { useId } from "react";
import { Backpack, ChevronDown, Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BODY_PART_LABELS, BODY_PARTS, LAYER_LABELS } from "@/lib/layers";
import type { BodyPart, LayerType } from "@/types/wardrobe";
import type { DailyLayerPlan, LayerChanges, PlanLayerItem } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import { useTemperatureUnit } from "@/components/TemperatureUnitProvider";
import { formatTemperatureRange } from "@/lib/temperature";

const LAYER_TYPES: LayerType[] = ["base", "mid", "outer"];

interface PlanDayCardProps {
  day: DailyLayerPlan;
  /** The day before it in the plan; when there is one, the card leads with what changed since. */
  previousDay?: DailyLayerPlan;
  /** Wardrobe names for the guide's standard items. */
  itemMappings?: Map<string, string>;
}

function itemName(bodyPart: BodyPart, layerType: LayerType, name: string, itemMappings?: Map<string, string>) {
  return itemMappings?.get(`${bodyPart}:${layerType}:${name}`) ?? name;
}

/**
 * Changes named as the wardrobe items they map to. Putting on and taking off
 * what maps to the same item cancels out, so a swap between two of the
 * guide's items the user covers with one jacket isn't a change.
 */
function mapChanges(changes: LayerChanges | null, itemMappings?: Map<string, string>): LayerChanges | null {
  if (!changes) return null;
  const named = (item: PlanLayerItem) => ({ ...item, name: itemName(item.bodyPart, item.layerType, item.name, itemMappings) });
  const keyOf = (item: PlanLayerItem) => `${item.bodyPart}:${item.layerType}:${item.name}`;
  const add = changes.add.map(named);
  const remove = changes.remove.map(named);
  const addKeys = new Set(add.map(keyOf));
  const removeKeys = new Set(remove.map(keyOf));
  return {
    add: add.filter((item) => !removeKeys.has(keyOf(item))),
    remove: remove.filter((item) => !addKeys.has(keyOf(item))),
  };
}

function hasChanges(changes: LayerChanges | null): changes is LayerChanges {
  return changes !== null && (changes.add.length > 0 || changes.remove.length > 0);
}

/** Every item worn, by body area. */
function Outfit({ recommendation, itemMappings }: { recommendation: Recommendation; itemMappings?: Map<string, string> }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {BODY_PARTS.map((bodyPart) => {
        const names = [...new Set(LAYER_TYPES.flatMap((layerType) =>
          (recommendation[bodyPart][layerType] ?? []).map((item) => itemName(bodyPart, layerType, item.name, itemMappings))
        ))];
        return (
          <div key={bodyPart} className="contents">
            <dt className="text-muted-foreground">{BODY_PART_LABELS[bodyPart]}</dt>
            <dd className={names.length > 0 ? "text-foreground" : "text-muted-foreground"}>
              {names.length > 0 ? names.join(", ") : "Nothing needed"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function SameAllDay() {
  return <p className="text-sm text-muted-foreground">Same layers all day.</p>;
}

/** Items to put on and take off, each with its body area. */
function ChangeList({
  changes,
  addLabel,
  removeLabel,
}: {
  changes: LayerChanges;
  addLabel: string;
  removeLabel: string;
}) {
  const rows = [
    ...changes.add.map((item) => ({ item, verb: addLabel, Icon: Plus })),
    ...changes.remove.map((item) => ({ item, verb: removeLabel, Icon: Minus })),
  ];
  return (
    <ul className="flex flex-col gap-1">
      {rows.map(({ item, verb, Icon }) => (
        <li key={`${verb}:${item.bodyPart}:${item.layerType}:${item.name}`} className="flex items-start gap-2 text-sm">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            {verb} <span className="font-medium text-foreground">{item.name}</span>
            <span className="text-muted-foreground">
              {" "}· {BODY_PART_LABELS[item.bodyPart]} {LAYER_LABELS[item.layerType].toLowerCase()}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One day of a multi-day plan: its conditions, what to wear, how that changes
 * through the day, and what to carry. After the first day, it leads with what
 * changed since the day before, with the whole outfit a tap away.
 */
export function PlanDayCard({ day, previousDay, itemMappings }: PlanDayCardProps) {
  const { temperatureUnit } = useTemperatureUnit();
  const headingId = useId();
  const { baseline } = day;
  const recommendation = baseline.recommendation;
  const dayChanges = previousDay ? mapChanges(day.changesFromPreviousDay, itemMappings) : null;
  const leadWithChanges = previousDay !== undefined && dayChanges !== null;
  const changingDayparts = day.dayparts.flatMap((daypart) => {
    const changes = mapChanges(daypart.changes, itemMappings);
    return hasChanges(changes) ? [{ ...daypart, changes }] : [];
  });
  const sameAllDay = day.dayparts.length > 1 && changingDayparts.length === 0;

  return (
    <Card asChild>
      <article aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 id={headingId} className="text-lg font-semibold text-foreground">
              {day.label}
            </h3>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {formatTemperatureRange(baseline.minTemp, baseline.maxTemp, temperatureUnit)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Wind up to {baseline.maxWindSpeed} mph · {baseline.maxPrecipProbability}% chance of precipitation
          </p>
        </div>

        {recommendation ? (
          <section aria-label={`Wear on ${day.label}`} className="flex flex-col gap-2">
            {leadWithChanges ? (
              <>
                {hasChanges(dayChanges) ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">Changes from {previousDay.label}</p>
                    <ChangeList changes={dayChanges} addLabel="Add" removeLabel="Leave out" />
                  </>
                ) : (
                  <p className="text-sm text-foreground">Same layers as {previousDay.label}.</p>
                )}
                {sameAllDay && <SameAllDay />}
                <details className="group">
                  <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
                    All layers for {day.label}
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="pt-1">
                    <Outfit recommendation={recommendation} itemMappings={itemMappings} />
                  </div>
                </details>
              </>
            ) : (
              <>
                {changingDayparts.length > 0 && (
                  <p className="text-sm text-muted-foreground">For the coldest part of the day.</p>
                )}
                <Outfit recommendation={recommendation} itemMappings={itemMappings} />
                {sameAllDay && <SameAllDay />}
              </>
            )}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">No general layers for these conditions.</p>
        )}

        {recommendation && changingDayparts.length > 0 && (
          <section aria-label={`Through ${day.label}`} className="flex flex-col gap-3 border-t border-border pt-3">
            {changingDayparts.map((daypart) => (
              <div key={daypart.id} className="flex flex-col gap-1">
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{daypart.label}</span>
                  <span className="text-muted-foreground">
                    {" "}· {daypart.timeRangeLabel} · {formatTemperatureRange(daypart.minTemp, daypart.maxTemp, temperatureUnit)}
                  </span>
                </p>
                <ChangeList changes={daypart.changes} addLabel="Put on" removeLabel="Take off" />
              </div>
            ))}
          </section>
        )}

        {day.carryItems.length > 0 && (
          <section aria-label={`Carry on ${day.label}`} className="flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="text-sm font-semibold text-foreground">Carry</p>
            <ul className="flex flex-col gap-1">
              {day.carryItems.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <Backpack className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </Card>
  );
}
