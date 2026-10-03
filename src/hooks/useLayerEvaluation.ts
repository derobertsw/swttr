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
 *
 * An evaluation is kept only for the same `scope` (the recommendation the
 * layers came from), so a new recommendation starts without a previous one.
 */
export function useLayerEvaluation(phases: PhaseEvaluationInput[] | null, scope?: unknown) {
  // The serialized request doubles as the effect key, so equal inputs rebuilt
  // on re-render don't trigger a new request.
  const body = phases ? JSON.stringify({ phases }) : null;
  const [result, setResult] = useState<{
    body: string;
    scope: unknown;
    phases: PhaseEvaluation[];
  } | null>(null);
  // Bumped by retry to send the same request again.
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{ body: string; attempt: number } | null>(null);

  // New layers or a new recommendation send a new request, which an earlier
  // failure doesn't describe, even for layers that failed before.
  const [requested, setRequested] = useState({ body, scope });
  if (requested.body !== body || requested.scope !== scope) {
    setRequested({ body, scope });
    setFailure(null);
  }

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
          setResult({ body, scope, phases: data.phases });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        logWarn("useLayerEvaluation", err);
        setFailure({ body, attempt });
      });

    return () => controller.abort();
  }, [body, scope, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const sameScope = result?.scope === scope;
  const current = body !== null && sameScope && result?.body === body;
  const failedBefore = !current && body !== null && failure?.body === body;
  const failed = failedBefore && failure.attempt === attempt;

  return {
    evaluation: body && sameScope ? (result?.phases ?? null) : null,
    pending: body !== null && !current && !failed,
    failed,
    /** Sending a failed check again. */
    retrying: failedBefore && !failed,
    retry,
  };
}
