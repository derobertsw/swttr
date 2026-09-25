"use client";

import { useEffect, useState } from "react";
import { logWarn } from "@/lib/logger";
import type { PhaseEvaluation, PhaseEvaluationInput } from "@/types/biophysics";

/**
 * Evaluates the worn layers on the server whenever they change. Returns the
 * latest evaluation (one per phase), keeping the previous one on screen while
 * an edit is re-evaluated; null until the first evaluation arrives.
 */
export function useLayerEvaluation(phases: PhaseEvaluationInput[] | null) {
  // The serialized request doubles as the effect key, so equal inputs rebuilt
  // on re-render don't trigger a new request.
  const body = phases ? JSON.stringify({ phases }) : null;
  const [result, setResult] = useState<{ body: string; phases: PhaseEvaluation[] } | null>(null);

  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();

    fetch("/api/v1/ensembles/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Evaluate failed (${res.status})`))))
      .then((data: { phases: PhaseEvaluation[] }) => {
        if (!controller.signal.aborted) setResult({ body, phases: data.phases });
      })
      .catch((err) => {
        if (!controller.signal.aborted) logWarn("useLayerEvaluation", err);
      });

    return () => controller.abort();
  }, [body]);

  return {
    evaluation: body ? (result?.phases ?? null) : null,
    pending: body !== null && result?.body !== body,
  };
}
