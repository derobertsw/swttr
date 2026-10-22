import type { Outing, OutingRequestState, Advice } from "@/types/outing";
import type { WeatherData } from "@/types/weather";
import type { SavedKitPhaseId } from "@/types/savedKit";
import type { ThermalDecision } from "@/types/biophysics";

/** A projection of committed LayerDisplay state, never raw recommendation/account data. */
export interface DisplayedLayers {
  activePhase: SavedKitPhaseId;
  phases: {
    id: SavedKitPhaseId;
    wear: Record<"torso" | "legs" | "hands" | "headNeck", Record<"base" | "mid" | "outer", string[]>>;
    carry: string[];
    decision: ThermalDecision | null;
  }[];
  guidance: string[];
  missingGear: string[];
  warnings: string[];
  transition: { priority: string; timeLimitMinutes: number | null; steps: string[] } | null;
  edited: boolean;
  evaluation: "pending" | "failed" | "ready" | "unavailable";
}

export interface CurrentOutingSnapshot {
  status: "empty" | "loading" | "error" | "ready";
  pending: {
    activity: string;
    exertion: Outing["exertion"];
    place: Outing["place"] | null;
    when: Outing["when"] | null;
  } | null;
  request: OutingRequestState;
  displayed: {
    outing: Outing;
    weather: WeatherData & { units: { temperature: "fahrenheit"; windSpeed: "mph" } };
    advice: { kind: Advice["kind"]; reason?: string };
    layers: DisplayedLayers | null;
  } | null;
  limitations: string[];
}

export type OutingActionCode = "invalid_input" | "busy" | "cancelled" | "not_ready"
  | "weather_unavailable" | "recommendation_unavailable";

export type OutingActionOutcome =
  | { status: "completed"; snapshot: CurrentOutingSnapshot }
  | { status: "error"; code: OutingActionCode; message: string; snapshot: CurrentOutingSnapshot };
