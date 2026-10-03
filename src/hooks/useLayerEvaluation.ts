"use client";

import { useCallback, useEffect, useState } from "react";
import { logWarn } from "@/lib/logger";
import type { PhaseEvaluation, PhaseEvaluationInput } from "@/types/biophysics";

/**
 * Evaluates the worn layers on the server whenever they change. Returns the
 * latest evaluation (one per phase), keeping the previous one on screen while
 * an edit is re-evaluated; null until the first evaluation arrives.
 *
 * `pending` and `failed` say the evaluation is for other layers than the
 * current ones: the check is still running, or it failed and `retry` can
 * send it again.
 */
export function useLayerEvaluation(phases: PhaseEvaluationInput[] | null) {
  // The serialized request doubles as the effect key, so equal inputs rebuilt
  // on re-render don't trigger a new request.
  const body = phases ? JSON.stringify({ phases }) : null;
  const [result, setResult] = useState<{ body: string; phases: PhaseEvaluation[]; count: number } | null>(null);
  // Bumped by retry to send the same request again.
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{ body: string; attempt: number } | null>(null);

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
      .then((data: { phases?: PhaseEvaluation[] }) => {
        if (!Array.isArray(data?.phases)) throw new Error("Malformed evaluation response");
        if (!controller.signal.aborted) {
          setResult((prev) => ({ body, phases: data.phases!, count: (prev?.count ?? 0) + 1 }));
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        logWarn("useLayerEvaluation", err);
        setFailure({ body, attempt });
      });

    return () => controller.abort();
  }, [body, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const current = body !== null && result?.body === body;
  const failedBefore = !current && body !== null && failure?.body === body;
  const failed = failedBefore && failure.attempt === attempt;

  return {
    evaluation: body ? (result?.phases ?? null) : null,
    pending: body !== null && !current && !failed,
    failed,
    /** Sending a failed check again. */
    retrying: failedBefore && !failed,
    /** Evaluations received so far; more than one means an update replaced the first. */
    count: result?.count ?? 0,
    retry,
  };
}
