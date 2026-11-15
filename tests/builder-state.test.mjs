import assert from "node:assert/strict";
import test from "node:test";
import {
  alertMessage,
  builderReducer,
  busyKeys,
  controlEnabled,
  failureMessage,
  initialBuilderState,
  isActivateConflict,
  needsRiskConfirmation,
  nextView,
  parseTestArgs,
  savedStatus,
  simulationText,
  statusKey,
  validatedStatus,
  viewButtonKey,
} from "../src/components/policies/builder-state.ts";
import { ApiError } from "../src/lib/api/transport.ts";

const t = (path) => path;
const BUSY = ["save", "validate", "activate", "test", "optimize"];
const CONTROLS = ["cycleView", "optimize", "save", "validate", "testPanel", "activate", "delete", "sendOptimize", "runTest"];

function initial(overrides = {}) {
  // Frozen so a reducer that mutates its input fails loudly.
  return Object.freeze({ ...initialBuilderState({ status: "draft", version: 3 }), ...overrides });
}

function run(state, ...actions) {
  return actions.reduce((current, action) => Object.freeze(builderReducer(current, action)), state);
}

const report = (fields = {}) => ({
  ok: true,
  toolCount: 1,
  analyzed: 1,
  unclassified: [],
  insufficient: [],
  issues: [],
  probes: [],
  ...fields,
});
const proposal = { definition: { nodes: [], edges: [], analyses: [] }, diff: [], json: "{}" };

test("a new builder starts idle on the canvas with the policy's status and version", () => {
  const state = initial();
  assert.equal(state.view, "canvas");
  assert.equal(state.busy, null);
  assert.equal(state.panel, null);
  assert.equal(state.status, "draft");
  assert.equal(state.version, 3);
  assert.equal(state.testArgs, "{}");
  assert.equal(state.confirmRisk, false);
});

test("while any request runs every control that starts or toggles work is disabled", () => {
  for (const busy of BUSY) {
    const state = initial({ busy, testTool: "fs.read" });
    for (const control of CONTROLS) assert.equal(controlEnabled(state, control), false, `${busy}/${control}`);
  }
});

test("when idle everything is enabled, except Run without a capability and Delete while a delete is pending", () => {
  const state = initial();
  for (const control of CONTROLS.filter((item) => item !== "runTest")) assert.equal(controlEnabled(state, control), true, control);
  assert.equal(controlEnabled(state, "runTest"), false);
  assert.equal(controlEnabled(initial({ testTool: "fs.read" }), "runTest"), true);
  assert.equal(controlEnabled(state, "delete", true), false);
  assert.equal(controlEnabled(state, "save", true), true);
});

test("starting a request clears the error, and only what that request owns", () => {
  const before = initial({ error: "old", jsonError: "bad json", testResult: "allow", panel: "test" });
  const save = run(before, { type: "start", busy: "save" });
  assert.deepEqual([save.busy, save.error, save.jsonError, save.panel, save.testResult], ["save", "", "bad json", "test", "allow"]);
  const validate = run(before, { type: "start", busy: "validate" });
  assert.equal(validate.panel, "validation", "validate shows the report panel straight away");
  assert.equal(validate.jsonError, "bad json");
  const activate = run(before, { type: "start", busy: "activate" });
  assert.equal(activate.panel, "test", "activate opens the report only once it has one");
  const testRun = run(before, { type: "start", busy: "test" });
  assert.equal(testRun.testResult, "");
  const optimize = run(before, { type: "start", busy: "optimize" });
  assert.equal(optimize.jsonError, "");
});

test("a failure keeps its message after the request finishes", () => {
  const state = run(initial(), { type: "start", busy: "save" }, { type: "failed", message: "nope" }, { type: "done" });
  assert.equal(state.busy, null);
  assert.equal(state.error, "nope");
});

test("unreadable JSON is reported per request, and API errors show the server's message", () => {
  const syntax = new SyntaxError("x");
  assert.equal(failureMessage(syntax, "save", t), "policies.jsonInvalid");
  assert.equal(failureMessage(syntax, "optimize", t), "policies.jsonInvalid");
  assert.equal(failureMessage(syntax, "test", t), "policies.badJson");
  // Validate and activate have no JSON message, so bad editor JSON reads as a failed save.
  assert.equal(failureMessage(syntax, "validate", t), "policies.saveFailed");
  assert.equal(failureMessage(syntax, "activate", t), "policies.saveFailed");
  for (const busy of BUSY) {
    assert.equal(failureMessage(new ApiError(400, "Server says no"), busy, t), "Server says no", busy);
    assert.equal(failureMessage(new Error("internal"), busy, t), "policies.saveFailed", busy);
  }
});

test("saving replaces the editor text with what was sent and takes status and version from the reply", () => {
  const state = run(
    initial({ confirmRisk: true, jsonText: "{ hand edited" }),
    { type: "start", busy: "save" },
    { type: "jsonSynced", text: "{ synced }" },
    { type: "persisted", status: "validated", version: 4 },
    { type: "done" }
  );
  assert.equal(state.jsonText, "{ synced }");
  assert.equal(state.status, "validated");
  assert.equal(state.version, 4);
  assert.equal(state.confirmRisk, false, "a save asks for the risk review again");
  const noVersion = run(initial(), { type: "persisted", status: "draft" });
  assert.equal(noVersion.version, 3);
});

test("the save reply's status counts as active unless it is validated, paused or draft", () => {
  for (const status of ["validated", "paused", "draft"]) assert.equal(savedStatus(status), status);
  for (const status of ["active", "archived", undefined]) assert.equal(savedStatus(status), "active");
  for (const status of ["validated", "paused", "draft", "active"]) assert.equal(validatedStatus(status, "paused"), status);
  assert.equal(validatedStatus("archived", "paused"), "paused");
  assert.equal(validatedStatus(undefined, "draft"), "draft");
});

test("validating stores the report and falls back to the just-saved status and version", () => {
  const state = run(
    initial(),
    { type: "start", busy: "validate" },
    { type: "persisted", status: "draft", version: 4 },
    { type: "validated", report: report(), status: "weird" },
    { type: "done" }
  );
  assert.equal(state.panel, "validation");
  assert.equal(state.report.ok, true);
  assert.equal(state.status, "draft");
  assert.equal(state.version, 4);
});

test("activating with allowed or flagged tools shows the review first and activates on the second click", () => {
  const risky = report({ review: { allows: [{}], flagged_tools: [] } });
  assert.equal(needsRiskConfirmation(risky, false), true);
  assert.equal(needsRiskConfirmation(report({ review: { allows: [], flagged_tools: ["x"] } }), false), true);
  assert.equal(needsRiskConfirmation(risky, true), false);
  assert.equal(needsRiskConfirmation(report({ review: { allows: [], flagged_tools: [] } }), false), false);
  assert.equal(needsRiskConfirmation(report(), false), false);

  const first = run(
    initial(),
    { type: "start", busy: "activate" },
    { type: "persisted", status: "draft", version: 4 },
    { type: "reportShown", report: risky },
    { type: "riskPending" },
    { type: "done" }
  );
  assert.equal(first.panel, "validation");
  assert.equal(first.confirmRisk, true);
  assert.equal(busyKeys(first).activate, "policies.confirmActivate");

  const second = run(
    first,
    { type: "start", busy: "activate" },
    { type: "persisted", status: "draft", version: 5 },
    { type: "reportShown", report: risky },
    { type: "activated", version: 6 },
    { type: "done" }
  );
  assert.equal(second.status, "active");
  assert.equal(second.version, 6);
  assert.equal(second.confirmRisk, false);
});

test("a 409 from activate asks for confirmation and shows the review", () => {
  assert.equal(isActivateConflict(new ApiError(409, "confirm")), true);
  assert.equal(isActivateConflict(new ApiError(400, "no")), false);
  assert.equal(isActivateConflict(new Error("409")), false);
  const state = run(initial({ panel: "test" }), { type: "riskConflict" }, { type: "failed", message: "confirm" });
  assert.equal(state.confirmRisk, true);
  assert.equal(state.panel, "validation");
  assert.equal(state.error, "confirm");
});

test("the view button cycles canvas, JSON, form and back, naming the next view", () => {
  assert.deepEqual(["canvas", "json", "form"].map(nextView), ["json", "form", "canvas"]);
  assert.deepEqual(["canvas", "json", "form"].map(viewButtonKey), ["policies.json", "policies.form", "policies.canvas"]);
  const json = run(initial({ jsonError: "stale" }), { type: "showJson", text: "{ canvas }" });
  assert.deepEqual([json.view, json.jsonText, json.jsonError], ["json", "{ canvas }", ""]);
});

test("unreadable JSON keeps the JSON view and the unsaved edits; readable JSON moves on to the form", () => {
  const edited = run(initial({ view: "json", jsonText: "{}" }), { type: "editJson", text: "{ broken" });
  const rejected = run(edited, { type: "jsonRejected", message: "policies.jsonInvalid" });
  assert.deepEqual([rejected.view, rejected.jsonText, rejected.jsonError], ["json", "{ broken", "policies.jsonInvalid"]);
  const typing = run(rejected, { type: "editJson", text: "{ broken!" });
  assert.equal(typing.jsonError, "", "typing clears the JSON error");
  const form = run(typing, { type: "showForm", text: "{ pretty }" });
  assert.deepEqual([form.view, form.jsonText, form.jsonError], ["form", "{ pretty }", ""]);
  const canvas = run(form, { type: "showCanvas" });
  assert.equal(canvas.view, "canvas");
  assert.equal(canvas.jsonText, "{ pretty }");
});

test("a JSON edit drops the optimizer's proposal; applying one shows its JSON", () => {
  const proposed = run(initial({ askOptimize: true, view: "json" }), { type: "proposed", proposal });
  assert.equal(proposed.askOptimize, false);
  assert.equal(proposed.proposal, proposal);
  assert.equal(run(proposed, { type: "editJson", text: "{}" }).proposal, null);
  assert.equal(run(proposed, { type: "discardProposal" }).proposal, null);
  const applied = run({ ...proposed, view: "form" }, { type: "applyProposal", text: "{ optimized }" });
  assert.deepEqual([applied.view, applied.jsonText, applied.proposal], ["json", "{ optimized }", null]);
  // Leaving the JSON view keeps the proposal; it shows again on return.
  assert.equal(run(proposed, { type: "showForm", text: "{}" }, { type: "showCanvas" }, { type: "showJson", text: "{}" }).proposal, proposal);
});

test("the optimize form toggles and keeps its instructions when closed", () => {
  const open = run(initial(), { type: "toggleOptimize" }, { type: "optimizeInstructions", value: "tighten" });
  assert.equal(open.askOptimize, true);
  const closed = run(open, { type: "closeOptimize" });
  assert.equal(closed.askOptimize, false);
  assert.equal(closed.optimizeInstructions, "tighten");
  assert.equal(run(closed, { type: "toggleOptimize" }).askOptimize, true);
});

test("the test button toggles the test panel and replaces the validation report", () => {
  assert.equal(run(initial(), { type: "toggleTestPanel" }).panel, "test");
  assert.equal(run(initial({ panel: "test" }), { type: "toggleTestPanel" }).panel, null);
  assert.equal(run(initial({ panel: "validation" }), { type: "toggleTestPanel" }).panel, "test");
  const filled = run(initial(), { type: "testTool", value: "fs.read" }, { type: "testArgs", value: '{"path":"/"}' });
  assert.deepEqual([filled.testTool, filled.testArgs], ["fs.read", '{"path":"/"}']);
  assert.equal(run(filled, { type: "testResult", text: "allow" }).testResult, "allow");
});

test("test arguments: blank means none, anything else must be JSON", () => {
  assert.deepEqual(parseTestArgs(""), {});
  assert.deepEqual(parseTestArgs("   "), {});
  assert.deepEqual(parseTestArgs('{"a":1}'), { a: 1 });
  assert.throws(() => parseTestArgs("{a:1}"), SyntaxError);
  assert.equal(simulationText({ decision: "deny", reason: "rule 2" }), "deny — rule 2");
  assert.equal(simulationText({ decision: "allow", reason: null }), "allow");
  assert.equal(simulationText({ decision: "allow", reason: "" }), "allow");
});

test("labels follow the request in flight", () => {
  const idle = busyKeys(initial());
  assert.deepEqual(idle, {
    optimize: "policies.optimize",
    sendOptimize: "policies.sendToAi",
    save: "policies.save",
    validate: "policies.validate",
    activate: "policies.activate",
    runTest: "policies.runTest",
  });
  assert.equal(busyKeys(initial({ busy: "optimize" })).sendOptimize, "policies.optimizing");
  assert.equal(busyKeys(initial({ busy: "save" })).save, "policies.saving");
  assert.equal(busyKeys(initial({ busy: "test" })).runTest, "policies.validating");
  assert.equal(busyKeys(initial({ busy: "activate", confirmRisk: true })).activate, "policies.activating");
  assert.deepEqual(["validated", "draft", "paused", "active"].map(statusKey), [
    "policies.validated",
    "policies.draft",
    "policies.paused",
    "policies.active",
  ]);
});

test("the alert shows the builder's error before a failed delete", () => {
  const failed = { isError: true, error: new Error("in use") };
  assert.equal(alertMessage("save broke", failed, t), "save broke");
  assert.equal(alertMessage("", failed, t), "in use");
  assert.equal(alertMessage("", { isError: true, error: "odd" }, t), "policies.saveFailed");
  assert.equal(alertMessage("", { isError: false, error: null }, t), null);
});
