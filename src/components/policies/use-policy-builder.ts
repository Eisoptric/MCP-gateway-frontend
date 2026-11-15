"use client";

import { useReducer, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Edge } from "@xyflow/react";
import { useUpdatePolicy } from "@/hooks/use-console";
import {
  builderReducer,
  failureMessage,
  initialBuilderState,
  isActivateConflict,
  needsRiskConfirmation,
  parseTestArgs,
  readPolicyJson,
  simulationText,
} from "@/components/policies/builder-state";
import { syncNodeApprovals } from "@/components/policies/policy-approval-sync";
import { applyProgress, type PolicyProgress } from "@/components/policies/policy-thinking";
import { activatePolicy, simulatePolicy, streamPolicy, validatePolicy } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toDefinition, toFlow, type FlowNode } from "@/lib/policy-graph";
import type { Policy, PolicyDefinition, PolicyAnalysis } from "@/types";

/** The builder's requests and view switches, run against the reducer in builder-state.ts. */
export function usePolicyBuilder({
  policy,
  name,
  setId,
  analyses,
  nodes,
  edges,
  setNodes,
  setEdges,
  groupAccess,
}: {
  policy: Policy;
  name: string;
  setId: string;
  analyses: PolicyAnalysis[];
  nodes: FlowNode[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<FlowNode[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  groupAccess: boolean;
}) {
  const { t } = useI18n();
  const update = useUpdatePolicy();
  const [state, dispatch] = useReducer(builderReducer, policy, initialBuilderState);
  const [progress, setProgress] = useState<PolicyProgress | null>(null);
  const optimizeAbort = useRef<AbortController | null>(null);

  function canvasDefinition() {
    return toDefinition(nodes, edges, analyses, setId || null);
  }

  function editorDefinition() {
    return state.view === "json" ? readPolicyJson(state.jsonText) : canvasDefinition();
  }

  function applyGraph(definition: PolicyDefinition) {
    const flow = toFlow(definition);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    return JSON.stringify(definition, null, 2);
  }

  async function persist() {
    const definition = await syncNodeApprovals(editorDefinition(), name, groupAccess, t("policies.approvalIncomplete"));
    dispatch({ type: "jsonSynced", text: applyGraph(definition) });
    const saved = await update.mutateAsync({
      id: policy.id,
      body: {
        name: name.trim() || policy.name,
        description: policy.description,
        tool_set_id: setId || null,
        definition,
      },
    });
    dispatch({ type: "persisted", status: saved.status, version: saved.version });
    return saved;
  }

  async function save() {
    dispatch({ type: "start", busy: "save" });
    try {
      await persist();
    } catch (caught) {
      dispatch({ type: "failed", message: failureMessage(caught, "save", t) });
    } finally {
      dispatch({ type: "done" });
    }
  }

  function cycleView() {
    if (state.view === "canvas") {
      dispatch({ type: "showJson", text: JSON.stringify(canvasDefinition(), null, 2) });
      return;
    }
    if (state.view === "json") {
      try {
        dispatch({ type: "showForm", text: applyGraph(readPolicyJson(state.jsonText)) });
      } catch {
        dispatch({ type: "jsonRejected", message: t("policies.jsonInvalid") });
      }
      return;
    }
    dispatch({ type: "showCanvas" });
  }

  async function optimize() {
    // start bumps optimizeRun; a cancel bumps it again, so the reply is dropped if it still arrives.
    const run = state.optimizeRun + 1;
    const controller = new AbortController();
    optimizeAbort.current = controller;
    dispatch({ type: "start", busy: "optimize" });
    setProgress({ label: t("policies.optimizing"), done: 0, total: 0, indeterminate: true, note: "" });
    try {
      const definition = editorDefinition();
      // The proposal is shown beside the JSON editor, so the current definition goes there first.
      if (state.view !== "json") dispatch({ type: "showJson", text: JSON.stringify(definition, null, 2) });
      const result = await streamPolicy(
        `/policies/${policy.id}/optimize/stream`,
        { definition, instructions: state.optimizeInstructions },
        (event) => setProgress((current) => applyProgress(current, event, t)),
        controller.signal
      );
      setProgress(null);
      if (controller.signal.aborted) return;
      if (!result.definition || !result.diff) throw new Error("policy");
      dispatch({
        type: "proposed",
        run,
        proposal: { definition: result.definition, diff: result.diff, json: JSON.stringify(result.definition, null, 2) },
      });
    } catch (caught) {
      setProgress(null);
      // A cancel aborts the stream; that is not a failure to report.
      if (!controller.signal.aborted) dispatch({ type: "failed", message: failureMessage(caught, "optimize", t) });
    } finally {
      if (optimizeAbort.current === controller) optimizeAbort.current = null;
      dispatch({ type: "done" });
    }
  }

  function cancelOptimize() {
    optimizeAbort.current?.abort();
    dispatch({ type: "closeOptimize" });
  }

  async function validate() {
    dispatch({ type: "start", busy: "validate" });
    try {
      await persist();
      const result = await validatePolicy(policy.id);
      dispatch({ type: "validated", report: result.report, status: result.policy.status, version: result.policy.version });
    } catch (caught) {
      dispatch({ type: "failed", message: failureMessage(caught, "validate", t) });
    } finally {
      dispatch({ type: "done" });
    }
  }

  async function activate() {
    // As at the click: persist() resets confirmRisk in state, but this click may be the confirmation.
    const confirmed = state.confirmRisk;
    dispatch({ type: "start", busy: "activate" });
    try {
      await persist();
      const result = await validatePolicy(policy.id);
      dispatch({ type: "reportShown", report: result.report });
      if (!result.report.ok) return;
      if (needsRiskConfirmation(result.report, confirmed)) {
        // Show what will be enforced first; the second click activates.
        dispatch({ type: "riskPending" });
        return;
      }
      const saved = await activatePolicy(policy.id, confirmed);
      dispatch({ type: "activated", version: saved.version });
    } catch (caught) {
      if (isActivateConflict(caught)) dispatch({ type: "riskConflict" });
      dispatch({ type: "failed", message: failureMessage(caught, "activate", t) });
    } finally {
      dispatch({ type: "done" });
    }
  }

  async function runTest() {
    dispatch({ type: "start", busy: "test" });
    try {
      const args = parseTestArgs(state.testArgs);
      if (!state.testTool) return;
      await persist();
      const result = await simulatePolicy(policy.id, state.testTool, args);
      dispatch({ type: "testResult", text: simulationText(result) });
    } catch (caught) {
      dispatch({ type: "failed", message: failureMessage(caught, "test", t) });
    } finally {
      dispatch({ type: "done" });
    }
  }

  function applyProposal() {
    if (state.proposal) dispatch({ type: "applyProposal", text: applyGraph(state.proposal.definition) });
  }

  return { state, dispatch, progress, save, cycleView, optimize, cancelOptimize, validate, activate, runTest, applyProposal };
}

export type PolicyBuilderSession = ReturnType<typeof usePolicyBuilder>;
