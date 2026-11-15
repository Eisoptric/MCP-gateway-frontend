import assert from "node:assert/strict";
import test from "node:test";

const { ApiError, apiErrorMessage } = await import("../src/lib/api/transport.ts");
const { login, reauthenticate } = await import("../src/lib/api/auth.ts");
const { useAuthStore } = await import("../src/lib/auth.ts");

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recordFetch(answers) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return answers[Math.min(calls.length - 1, answers.length - 1)]();
  };
  return calls;
}

test("a step-up that needs a second factor says which one", async () => {
  const totp = await apiErrorMessage(
    json(403, { detail: { message: "Enter the code from your authenticator app", second_factor: "totp" } }),
  );
  assert.deepEqual(totp, { message: "Enter the code from your authenticator app", migration: undefined, secondFactor: "totp" });
  const passkey = await apiErrorMessage(json(403, { detail: { message: "Confirm with your passkey", second_factor: "passkey" } }));
  assert.equal(passkey.secondFactor, "passkey");
  // Anything else is not a second factor the form knows how to ask for.
  assert.equal((await apiErrorMessage(json(403, { detail: { message: "x", second_factor: "sms" } }))).secondFactor, undefined);
  assert.equal((await apiErrorMessage(json(403, { detail: "Reauthentication required" }))).secondFactor, undefined);
});

test("the step-up sends the authenticator code with the password, and rejects with the factor", async () => {
  useAuthStore.setState({ user: { email: "member@saturn.ai" } });
  const calls = recordFetch([() => json(403, { detail: { message: "Enter the code", second_factor: "totp" } })]);
  await assert.rejects(reauthenticate("correct horse"), (error) => error instanceof ApiError && error.secondFactor === "totp");
  assert.equal(calls[0].body.totp_code, undefined);
  const sent = recordFetch([() => new Response(null, { status: 204 })]);
  await reauthenticate("correct horse", "123456");
  assert.equal(sent[0].url, "/saturn-api/auth/reauth");
  assert.equal(sent[0].body.totp_code, "123456");
  assert.match(sent[0].body.password, /^v2\./);
});

test("a hinted sign-in failure is retried once with both legacy proofs", async () => {
  const calls = recordFetch([
    () => json(401, { detail: { message: "Invalid email or password", migration: "v1" } }),
    () => json(401, { detail: "Invalid email or password" }),
  ]);
  await assert.rejects(login("member@saturn.ai", "correct horse"), (error) => error instanceof ApiError && error.status === 401);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.legacy_v1, undefined);
  assert.equal(calls[0].body.legacy_password, undefined);
  assert.match(calls[1].body.legacy_v1, /^v1\.[0-9a-f]{64}$/);
  assert.equal(calls[1].body.legacy_password, "correct horse");
});

test("a failure without the hint is not retried, so no legacy proof leaves the browser", async () => {
  const calls = recordFetch([() => json(401, { detail: "Invalid email or password" })]);
  await assert.rejects(login("member@saturn.ai", "correct horse"));
  assert.equal(calls.length, 1);
});
