import type { ExposureCriterion, ExposureLimit } from "@/types/biophysics";

const OUTSIDE_LABELS: Record<ExposureLimit["outside_iso_range"][number], string> = {
  metabolic_rate: "metabolic rate",
  air_temperature: "air temperature above 10°C",
  air_speed: "air speed",
};

/** The server's exposure status in words; no calculation happens here. */
function criterionText(criterion: ExposureCriterion): string {
  if (criterion.status === "no_heat_debt" || criterion.dle_hours === null) return "Not limited by whole-body cooling";
  if (criterion.status === "more_than_8_hours") return "More than 8 h";
  return `${criterion.dle_hours.toFixed(1)} h`;
}

interface ExposureLimitDetailsProps {
  /** One entry per phase shown, with a label when there is more than one. */
  phases: { label?: string; exposure: ExposureLimit }[];
}

/**
 * The evaluated outfit's duration-limited exposure (ISO 11079 DLE), as the
 * API reports it in `evaluation.exposure`.
 */
export function ExposureLimitDetails({ phases }: ExposureLimitDetailsProps) {
  if (phases.length === 0) return null;
  const outside = [...new Set(phases.flatMap(({ exposure }) => exposure.outside_iso_range))];
  const { heat_debt_limit_kj_m2: limit } = phases[0].exposure;
  return (
    <div>
      <h4 className="mb-1 font-semibold">Exposure limit (ISO 11079 DLE)*</h4>
      <p className="mb-2 text-xs text-muted-foreground">
        Time until this outfit&apos;s whole-body heat debt reaches {limit} kJ/m², at a steady effort in these conditions
      </p>
      <dl className="flex flex-col gap-2">
        {phases.map(({ label, exposure }) => (
          <div key={label ?? "outfit"} className="flex flex-col gap-1">
            {label && <dt className="text-xs font-medium">{label}</dt>}
            {([
              ["Minimal strain", exposure.minimal],
              ["Neutral", exposure.neutral],
            ] as const).map(([name, criterion]) => (
              <dd key={name} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="text-muted-foreground">
                  {name} (skin {criterion.skin_temp_c.toFixed(1)}°C)
                </span>
                <span className="font-mono">{criterionText(criterion)}</span>
              </dd>
            ))}
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        * From the outfit&apos;s torso, arm and leg insulation and SWTTR&apos;s simplified heat balance. It is not
        a time to a low core temperature, frostbite, or cold hands, feet or face, and stops and changing
        weather are not included.
        {outside.length > 0 && ` These conditions are outside ISO 11079's range (${outside.map((key) => OUTSIDE_LABELS[key]).join(", ")}), so it is an extrapolation.`}
      </p>
    </div>
  );
}
