// The policy builder's toolbar, JSON view and test panel state, as plain data so it can be
// tested without rendering. The network calls stay in use-policy-builder.ts; this file only
// says what each step does to the state and which controls are usable when.
import type { PolicyProposal } from "@/components/policies/policy-optimize-proposal";
// transport rather than "@/lib/api": the barrel pulls in every API area, the tests only need the class.
import { ApiError } from "@/lib/api/transport";
import type { PolicyValidation } from "@/lib/api/policies";
import type { PolicyDefinition, PolicyStatus } from "@/types";

export type BuilderView = "canvas" | "json" | "form";
export type BuilderBusy = "save" | "validate" | "activate" | "test" | "optimize";
export type BuilderPanel = "validation" | "test";

export interface BuilderState {
  status: PolicyStatus;
  version: number;
  /** The one request in flight; every toolbar control waits for it. */
  busy: BuilderBusy | null;
  error: string;
  view: BuilderView;
  /** The JSON editor's text. Edits reach the graph only on save, on leaving the view, or on optimize. */
  jsonText: string;
  jsonError: string;
  panel: BuilderPanel | null;
  report: PolicyValidation | null;
  /** The review has been shown; the next Activate click sends confirm=true. */
  confirmRisk: boolean;
  testTool: string;
  testArgs: string;
  testResult: string;
  askOptimize: boolean;
  optimizeInstructions: string;
  proposal: PolicyProposal | null;
  /** Counts optimize requests and cancels, so a reply to a cancelled request is dropped. */
  optimizeRun: number;
}

export type BuilderAction =
  | { type: "start"; busy: BuilderBusy }
  | { type: "failed"; message: string }
  | { type: "done" }
  | { type: "jsonSynced"; text: string }
  | { type: "persisted"; status?: string; version?: number }
  | { type: "validated"; report: PolicyValidation; status?: string; version?: number }
  | { type: "reportShown"; report: PolicyValidation }
  | { type: "riskPending" }
  | { type: "riskConflict" }
  | { type: "activated"; version?: number }
  | { type: "showJson"; text: string }
  | { type: "showForm"; text: string }
  | { type: "showCanvas" }
  | { type: "jsonRejected"; message: string }
  | { type: "editJson"; text: string }
  | { type: "toggleTestPanel" }
  | { type: "testTool"; value: string }
  | { type: "testArgs"; value: string }
  | { type: "testResult"; text: string }
  | { type: "toggleOptimize" }
  | { type: "closeOptimize" }
  | { type: "optimizeInstructions"; value: string }
  | { type: "proposed"; run: number; proposal: PolicyProposal }
  | { type: "applyProposal"; text: string }
  | { type: "discardProposal" };

export function initialBuilderState(policy: { status: PolicyStatus; version: number }): BuilderState {
  return {
    status: policy.status,
    version: policy.version,
    busy: null,
    error: "",
    view: "canvas",
    jsonText: "",
    jsonError: "",
    panel: null,
    report: null,
    confirmRisk: false,
    testTool: "",
    testArgs: "{}",
    testResult: "",
    askOptimize: false,
    optimizeInstructions: "",
    proposal: null,
    optimizeRun: 0,
  };
}

/** What starting each request clears or opens before the request is sent. */
function started(state: BuilderState, busy: BuilderBusy): BuilderState {
  const next = { ...state, busy, error: "" };
  if (busy === "validate") return { ...next, panel: "validation" };
  if (busy === "test") return { ...next, testResult: "" };
  if (busy === "optimize") return { ...next, jsonError: "", optimizeRun: state.optimizeRun + 1 };
  return next;
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "start":
      return started(state, action.busy);
    case "failed":
      return { ...state, error: action.message };
    case "done":
      return { ...state, busy: null };
    case "jsonSynced":
      // Saving rewrites the editor; a proposal made from the old text no longer matches it.
      return action.text === state.jsonText ? state : { ...state, jsonText: action.text, proposal: null };
    case "persisted":
      return { ...state, status: savedStatus(action.status), version: action.version ?? state.version, confirmRisk: false };
    case "validated":
      return {
        ...state,
        report: action.report,
        status: validatedStatus(action.status, state.status),
        version: action.version ?? state.version,
      };
    case "reportShown":
      return { ...state, report: action.report, panel: "validation" };
    case "riskPending":
      return { ...state, confirmRisk: true };
    case "riskConflict":
      return { ...state, confirmRisk: true, panel: "validation" };
    case "activated":
      return { ...state, status: "active", version: action.version ?? state.version, confirmRisk: false };
    // The proposal lives beside the JSON editor and is computed from its text, so it goes
    // whenever the view changes rather than coming back stale after canvas or form edits.
    case "showJson":
      return { ...state, jsonError: "", jsonText: action.text, view: "json", proposal: null };
    case "showForm":
      return { ...state, jsonText: action.text, jsonError: "", view: "form", proposal: null };
    case "showCanvas":
      return { ...state, view: "canvas", proposal: null };
    case "jsonRejected":
      return { ...state, jsonError: action.message };
    case "editJson":
      // A hand edit makes the optimizer's proposal stale, so it is dropped.
      return { ...state, jsonText: action.text, jsonError: "", proposal: null };
    case "toggleTestPanel":
      return { ...state, panel: state.panel === "test" ? null : "test" };
    case "testTool":
      return { ...state, testTool: action.value };
    case "testArgs":
      return { ...state, testArgs: action.value };
    case "testResult":
      return { ...state, testResult: action.text };
    case "toggleOptimize":
      return { ...state, askOptimize: !state.askOptimize };
    case "closeOptimize":
      // Closing the form cancels a running optimize: its reply must not show up afterwards.
      return { ...state, askOptimize: false, optimizeRun: state.optimizeRun + 1 };
    case "optimizeInstructions":
      return { ...state, optimizeInstructions: action.value };
    case "proposed":
      if (action.run !== state.optimizeRun) return state;
      return { ...state, askOptimize: false, proposal: action.proposal };
    case "applyProposal":
      return { ...state, jsonText: action.text, proposal: null, view: "json" };
    case "discardProposal":
      return { ...state, proposal: null };
  }
}

/** The save endpoint's status, where anything it does not name counts as active. */
export function savedStatus(status: string | undefined): PolicyStatus {
  return status === "validated" || status === "paused" || status === "draft" ? status : "active";
}

/** The validate endpoint's status; an unknown one leaves the current status alone. */
export function validatedStatus(status: string | undefined, current: PolicyStatus): PolicyStatus {
  return status === "validated" || status === "draft" || status === "paused" || status === "active" ? status : current;
}

export function nextView(view: BuilderView): BuilderView {
  return view === "canvas" ? "json" : view === "json" ? "form" : "canvas";
}

export type BuilderControl =
  | "cycleView"
  | "optimize"
  | "save"
  | "validate"
  | "testPanel"
  | "activate"
  | "delete"
  | "confirmDelete"
  | "cancelDelete"
  | "sendOptimize"
  | "runTest";

/**
 * Whether a control can be used. Everything that starts or toggles work, including the delete
 * confirmation, waits for the request in flight; only the optimize form's Cancel does not,
 * since it is how that request is stopped.
 */
export function controlEnabled(state: BuilderState, control: BuilderControl, deleting = false) {
  if (state.busy !== null) return false;
  if (control === "delete" || control === "confirmDelete") return !deleting;
  if (control === "runTest") return state.testTool !== "";
  return true;
}

export function viewButtonKey(view: BuilderView) {
  return `policies.${nextView(view)}`;
}

export function statusKey(status: PolicyStatus) {
  return `policies.${status === "validated" ? "validated" : status === "draft" ? "draft" : status === "paused" ? "paused" : "active"}`;
}

export function busyKeys(state: BuilderState) {
  return {
    optimize: state.busy === "optimize" ? "policies.optimizing" : "policies.optimize",
    sendOptimize: state.busy === "optimize" ? "policies.optimizing" : "policies.sendToAi",
    save: state.busy === "save" ? "policies.saving" : "policies.save",
    validate: state.busy === "validate" ? "policies.validating" : "policies.validate",
    activate:
      state.busy === "activate" ? "policies.activating" : state.confirmRisk ? "policies.confirmActivate" : "policies.activate",
    runTest: state.busy === "test" ? "policies.testing" : "policies.runTest",
  };
}

/** Whether the review must be shown before activating: something is allowed or flagged and it has not been confirmed. */
export function needsRiskConfirmation(report: PolicyValidation, confirmRisk: boolean) {
  const review = report.review;
  return !confirmRisk && !!review && (review.allows.length > 0 || review.flagged_tools.length > 0);
}

export function isActivateConflict(caught: unknown) {
  return caught instanceof ApiError && caught.status === 409;
}

/** The JSON editor's text could not be read as a policy. A SyntaxError so older checks still match. */
export class PolicyJsonError extends SyntaxError {
  constructor() {
    super("policy");
    this.name = "PolicyJsonError";
  }
}

/** The JSON editor's text as a policy definition; throws PolicyJsonError when it is not one. */
export function readPolicyJson(text: string): PolicyDefinition {
  let parsed: PolicyDefinition;
  try {
    parsed = JSON.parse(text) as PolicyDefinition;
  } catch {
    throw new PolicyJsonError();
  }
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) throw new PolicyJsonError();
  return parsed;
}

/**
 * The message shown when a request fails. Unreadable policy JSON says so whichever request hit
 * it; any other SyntaxError is the test arguments for a test, and a stream reply for optimize.
 */
export function failureMessage(caught: unknown, busy: BuilderBusy, t: (path: string) => string) {
  if (caught instanceof PolicyJsonError) return t("policies.jsonInvalid");
  if (caught instanceof SyntaxError) {
    if (busy === "save" || busy === "optimize") return t("policies.jsonInvalid");
    if (busy === "test") return t("policies.badJson");
  }
  return caught instanceof ApiError ? caught.message : t("policies.saveFailed");
}

/** The banner under the toolbar, or null when there is none: the builder's own error first, then a failed delete. */
export function alertMessage(error: string, remove: { isError: boolean; error: unknown }, t: (path: string) => string) {
  if (error) return error;
  if (!remove.isError) return null;
  return remove.error instanceof Error ? remove.error.message : t("policies.saveFailed");
}

/** The test panel's arguments; blank means none. Throws SyntaxError on anything else that is not JSON. */
export function parseTestArgs(text: string) {
  return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export function simulationText(result: { decision: string; reason: string | null }) {
  return `${result.decision}${result.reason ? ` — ${result.reason}` : ""}`;
}
