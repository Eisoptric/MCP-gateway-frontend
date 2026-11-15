import assert from "node:assert/strict";
import test from "node:test";

const { CLOSED_GRACE_MS, MAX_WAIT_MS, McpAuthorizeError, POLL_MS, mcpOauthErrorText, mcpSignInCompleted, waitForMcpSignIn } =
  await import("../src/lib/mcp-authorize.ts");

const wanted = { name: "Linear", endpoint: "https://mcp.linear.app/mcp" };
const server = (over = {}) => ({ name: "Linear", endpoint: "https://mcp.linear.app/mcp", has_authorization: true, secret_status: "ok", ...over });

test("a sign-in counts as done only when the API holds a working authorization for that server", () => {
  assert.equal(mcpSignInCompleted([server()], wanted), true);
  assert.equal(mcpSignInCompleted([], wanted), false);
  assert.equal(mcpSignInCompleted([server({ has_authorization: false })], wanted), false);
  assert.equal(mcpSignInCompleted([server({ has_authorization: undefined })], wanted), false);
  assert.equal(mcpSignInCompleted([server({ secret_status: "needs_reconnect" })], wanted), false);
  assert.equal(mcpSignInCompleted([server({ name: "Notion", endpoint: "https://mcp.notion.com/mcp" })], wanted), false);
});

test("the server is matched by name only, since the API keys servers by name", () => {
  assert.equal(mcpSignInCompleted([server({ name: " Linear " })], wanted), true);
  assert.equal(mcpSignInCompleted([server({ endpoint: "https://elsewhere.example/mcp" })], wanted), true);
  // The same endpoint signed in under another name does not mean this sign-in went through.
  assert.equal(mcpSignInCompleted([server({ name: "Linear (2)" })], wanted), false);
  assert.equal(mcpSignInCompleted([server({ name: "Linear (2)", endpoint: "https://mcp.linear.app/mcp/" })], wanted), false);
});

// A translator that shows which key and detail were asked for.
const t = (path, vars) => (vars?.detail ? `${path}|${vars.detail}` : path);

test("each way a sign-in can fail has its own message", () => {
  assert.equal(mcpOauthErrorText(new McpAuthorizeError("popup", "popup"), t), "marketplace.popupBlocked");
  assert.equal(mcpOauthErrorText(new McpAuthorizeError("incomplete", "incomplete"), t), "marketplace.signInIncomplete");
  assert.equal(mcpOauthErrorText(new McpAuthorizeError("x", "denied"), t), "marketplace.signInFailed.generic");
  assert.equal(mcpOauthErrorText(new McpAuthorizeError("cancelled", "cancelled"), t), "");
  assert.equal(mcpOauthErrorText(new Error("This MCP does not let Saturn start sign-in"), t), "marketplace.signInUnavailable");
  assert.equal(mcpOauthErrorText("not an error", t), "marketplace.popupBlocked");
});

test("a failed sign-in shows the reason the API gave, or a generic one", () => {
  const failed = (reason, message = "m") => mcpOauthErrorText(new McpAuthorizeError(message, "failed", reason), t);
  assert.equal(failed("access_denied"), "marketplace.signInFailed.access_denied|m");
  assert.equal(failed("browser_mismatch"), "marketplace.signInFailed.browser_mismatch|m");
  assert.equal(failed("connect_failed", "Access token was rejected"), "marketplace.signInFailed.connect_failed|Access token was rejected");
  assert.equal(failed("something_new"), "marketplace.signInFailed.generic");
  assert.equal(failed(""), "marketplace.signInFailed.generic");
});

// A fake clock: sleeping moves time on at once, so minutes of polling run instantly.
function watch(answers, over = {}) {
  let clock = 0;
  const reads = [];
  const base = {
    nonce: "n-12345678",
    readAttempt: async (nonce) => {
      reads.push(nonce);
      const next = answers.length > 1 ? answers.shift() : answers[0];
      if (next instanceof Error) throw next;
      return next;
    },
    signedIn: async () => false,
    windowClosed: () => false,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return { watch: { ...base, ...over }, reads, elapsed: () => clock };
}

const pending = { status: "pending", expires_at: "2026-11-16T00:15:00Z" };

test("the console waits for the API, not the window, to say the sign-in connected", async () => {
  // The window reads as closed from the start, as it does behind a COOP provider page.
  const { watch: w, reads, elapsed } = watch([pending, pending, pending, { status: "connected" }], { windowClosed: () => true });
  assert.equal(await waitForMcpSignIn(w), "approved");
  assert.equal(reads.length, 4);
  assert.deepEqual([...new Set(reads)], ["n-12345678"]);
  assert.equal(elapsed(), 3 * POLL_MS);
});

test("a failed sign-in carries the API's reason", async () => {
  const { watch: w } = watch([pending, { status: "failed", reason: "access_denied", message: "The MCP provider did not grant access." }]);
  await assert.rejects(waitForMcpSignIn(w), (error) => error.code === "failed" && error.reason === "access_denied");
});

test("an expired sign-in fails as expired", async () => {
  const { watch: w } = watch([{ status: "expired", expires_at: "x" }]);
  await assert.rejects(waitForMcpSignIn(w), (error) => error.code === "failed" && error.reason === "expired");
});

test("a closed window only prompts the user after a grace period, and waiting goes on", async () => {
  let stalledAt = null;
  const answers = [pending];
  const { watch: w, elapsed } = watch(answers, {
    windowClosed: () => true,
    onStalled: () => {
      stalledAt = elapsed();
      // The user finishes the sign-in after the prompt appeared.
      answers.unshift(pending, { status: "connected" });
    },
  });
  assert.equal(await waitForMcpSignIn(w), "approved");
  assert.ok(stalledAt >= CLOSED_GRACE_MS && stalledAt < CLOSED_GRACE_MS + 2 * POLL_MS, String(stalledAt));
});

test("an open window never prompts, and the wait ends at the backstop", async () => {
  let stalled = false;
  const { watch: w, elapsed } = watch([pending], { onStalled: () => (stalled = true) });
  await assert.rejects(waitForMcpSignIn(w), (error) => error.code === "incomplete");
  assert.equal(stalled, false);
  assert.ok(elapsed() >= MAX_WAIT_MS);
});

test("cancelling stops the wait", async () => {
  const controller = new AbortController();
  const { watch: w, reads } = watch([pending], {
    signal: controller.signal,
    sleep: async () => {
      if (reads.length === 2) controller.abort();
    },
  });
  await assert.rejects(waitForMcpSignIn(w), (error) => error.code === "cancelled");
  assert.equal(reads.length, 2);
});

test("dropped requests are retried, and an API without attempts falls back to the connection list", async () => {
  const dropped = Object.assign(new Error("network"), { status: 0 });
  const missing = Object.assign(new Error("Sign-in not found"), { status: 404 });
  const { watch: retried } = watch([dropped, pending, { status: "connected" }]);
  assert.equal(await waitForMcpSignIn(retried), "approved");
  let checks = 0;
  const { watch: old } = watch([missing], { signedIn: async () => ++checks >= 3 });
  assert.equal(await waitForMcpSignIn(old), "approved");
  assert.equal(checks, 3);
});
