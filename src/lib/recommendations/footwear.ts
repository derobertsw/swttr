/**
 * Feet (#405): a first, explicitly heuristic sock suggestion.
 *
 * Every sport here comes with footwear the sport dictates (running shoes,
 * cycling shoes, XC, alpine or touring boots). SWTTR doesn't know which pair
 * anyone owns, so the footwear is assumed, with an estimated insulation, and
 * never chosen. Socks are generic weights, not catalog items. The sock is the
 * lightest weight whose footwear-plus-sock insulation reaches the heuristic
 * foot band (`phaseTargets().feet`); when even the warmest sock the footwear
 * allows falls short, the response says so and names the sport's usual
 * remedy, without pretending to know how much it adds.
 *
 * Clo is on USARIEM T18-01's foot part-manikin scale: total insulation minus
 * the bare manikin's air layer. Only the midweight sock (0.39 clo, T18-01's
 * sock) is measured. Every footwear value and the other sock weights are
 * SWTTR estimates, bracketed by that sock and T18-01's extreme-cold bootie
 * (1.42 clo). Footwear and sock clo are added, as T18-01 added layers.
 *
 * Feet stay out of the comfort score and verdict, and nothing here is a toe
 * temperature, a frostbite risk or an exposure time. See
 * docs/footwear-heuristic.md.
 */
import type { ActivityType } from '@/lib/biophysics/constants';
import { localThermalStatus } from '@/lib/biophysics/comfort';
import type { FootwearAssessment } from '@/types/biophysics';

type SockWeight = FootwearAssessment['sock']['weight'];

/** Generic sock weights, lightest first. */
export const SOCK_WEIGHTS: ReadonlyArray<FootwearAssessment['sock']> = [
  { weight: 'thin', label: 'thin liner socks', clo: 0.2, measured: false },
  { weight: 'light', label: 'lightweight socks', clo: 0.3, measured: false },
  // USARIEM T18-01's sock on the foot manikin; calling it midweight is an assumption.
  { weight: 'midweight', label: 'midweight socks', clo: 0.39, measured: true },
  { weight: 'heavy', label: 'heavyweight socks', clo: 0.5, measured: false },
];

interface AssumedFootwear {
  type: string;
  label: string;
  /** Estimated clo without a sock. */
  clo: number;
  /** Sock weights the footwear takes. A fitted ski-boot shell leaves no room
   * for a heavyweight sock, and squeezing one in isn't warmer. */
  socks: readonly SockWeight[];
  /** What to add when even the warmest sock falls short. */
  remedy: string;
}

const ALL_SOCKS: readonly SockWeight[] = ['thin', 'light', 'midweight', 'heavy'];
const FITTED_SHELL_SOCKS: readonly SockWeight[] = ['thin', 'light', 'midweight'];

const TOURING_BOOT: AssumedFootwear = {
  type: 'touring_boot', label: 'touring boots', clo: 0.6, socks: FITTED_SHELL_SOCKS,
  remedy: 'insulated boot covers or boot heaters for the descent',
};

/** The footwear each sport assumes. Every clo here is an estimate. */
export const ASSUMED_FOOTWEAR: Record<ActivityType, AssumedFootwear> = {
  running: {
    type: 'running_shoe', label: 'running shoes', clo: 0.15, socks: ALL_SOCKS,
    remedy: 'winter running shoes with a wind-resistant upper, or shoe covers',
  },
  biking: {
    type: 'cycling_shoe', label: 'cycling shoes', clo: 0.15, socks: ALL_SOCKS,
    remedy: 'toe covers, insulated overshoes or winter cycling boots',
  },
  xc_skiing: {
    type: 'xc_boot', label: 'XC ski boots', clo: 0.35, socks: ALL_SOCKS,
    remedy: 'insulated XC boots or overboots',
  },
  alpine_skiing: {
    type: 'alpine_boot', label: 'ski boots', clo: 0.7, socks: FITTED_SHELL_SOCKS,
    remedy: 'boot heaters or insulated boot covers',
  },
  ski_touring_uphill: TOURING_BOOT,
  ski_touring_downhill: TOURING_BOOT,
};

/** Selection tolerance, in foot clo: the hand band's, on a similar scale. */
const FOOT_CLO_EPSILON = 0.03;

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The sock to wear with the sport's footwear for a heuristic foot band.
 * `phase` names the phase the band came from when the sport has several.
 */
export function assessFootwear(
  activity: ActivityType,
  band: { min: number; neutral: number },
  phase?: FootwearAssessment['phase'],
): FootwearAssessment {
  const footwear = ASSUMED_FOOTWEAR[activity];
  const socks = SOCK_WEIGHTS.filter(sock => footwear.socks.includes(sock.weight));
  const status = (sock: FootwearAssessment['sock']) =>
    localThermalStatus(round2(footwear.clo + sock.clo), band.min, band.neutral, FOOT_CLO_EPSILON);
  const sock = socks.find(option => status(option) !== 'under') ?? socks[socks.length - 1];
  const clo = round2(footwear.clo + sock.clo);
  const thermal_status = status(sock);
  const state = thermal_status === 'under' ? 'short' : 'selected';
  const prefix = phase === 'descent' ? 'Feet, sized for the descent (estimate)' : 'Feet (estimate)';
  const tail = 'Sized by a heuristic foot range; feet are not in the comfort score.';
  const message = state === 'short'
    ? `${prefix}: even ${sock.label} in ${footwear.label} fall short of the heuristic foot range. Consider ${footwear.remedy}.`
    : thermal_status === 'over'
      ? `${prefix}: ${sock.label} are enough in ${footwear.label}. ${tail}`
      : `${prefix}: ${sock.label} in ${footwear.label}. ${tail}`;
  return {
    method: 'heuristic',
    ...(phase ? { phase } : {}),
    footwear: { type: footwear.type, label: footwear.label, clo: footwear.clo },
    sock,
    clo,
    min: band.min,
    max: band.neutral,
    thermal_status,
    state,
    message,
  };
}

/** Where the message goes: a warning when the feet fall short, else guidance. */
export function footwearAdvice(assessment: FootwearAssessment): { guidance: string[]; warnings: string[] } {
  return assessment.state === 'short'
    ? { guidance: [], warnings: [assessment.message] }
    : { guidance: [assessment.message], warnings: [] };
}
