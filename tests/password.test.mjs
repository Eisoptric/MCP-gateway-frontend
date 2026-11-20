import assert from "node:assert/strict";
import test from "node:test";
import { legacyLoginVerifier, loginVerifier, memberWrapMaterial } from "../src/lib/password.ts";

const hex = (bytes) => Buffer.from(bytes).toString("hex");

test("the value sent as the password depends on the password and the email", async () => {
  const first = await loginVerifier("correct horse", "member@example.com");
  assert.match(first, /^v2\.[0-9a-f]{64}$/);
  // Stable, and the address is compared without regard to case or surrounding spaces.
  assert.equal(await loginVerifier("correct horse", " Member@Example.COM "), first);
  assert.notEqual(await loginVerifier("battery staple", "member@example.com"), first);
  // This is why an email change has to send a new value: the old one cannot be derived any more.
  assert.notEqual(await loginVerifier("correct horse", "moved@example.com"), first);
});

test("the key that wraps the member key never equals what is sent to the server", async () => {
  const sent = (await loginVerifier("correct horse", "member@example.com")).slice(3);
  const wrap = hex(await memberWrapMaterial("correct horse", "member@example.com"));
  assert.equal(wrap.length, 64);
  assert.notEqual(wrap, sent);
  // It changes with the password and with the email, so the stored copy of the member key must
  // be wrapped again when either one changes.
  assert.notEqual(hex(await memberWrapMaterial("battery staple", "member@example.com")), wrap);
  assert.notEqual(hex(await memberWrapMaterial("correct horse", "moved@example.com")), wrap);
});

test("the older verifier is a plain labelled hash, kept only to move old accounts over", async () => {
  const legacy = await legacyLoginVerifier("correct horse");
  assert.match(legacy, /^v1\.[0-9a-f]{64}$/);
  assert.equal(await legacyLoginVerifier("correct horse"), legacy);
});

test("known answers: an update to the hashing library must not change what is derived", async () => {
  // Every stored password value and every wrapped member key depends on these exact bytes.
  // If this fails after a dependency update, signing in and opening keys would break for
  // everyone, so the update must not ship.
  assert.equal(
    await loginVerifier("correct horse", "member@example.com"),
    "v2.4fb65ee69e272fd1639345ee6e64283dc7178cf57de69eb7a67edf6a23fd91f3",
  );
  assert.equal(
    hex(await memberWrapMaterial("correct horse", "member@example.com")),
    "bc738337ca01529a92887f052820a281f0f4807970b67f704ae0e4a76ee4fa92",
  );
  assert.equal(
    await legacyLoginVerifier("correct horse"),
    "v1.0eb10719ccf237974c2c7460a5ecb5bb9d882e9696a4bbd6c184a2c8dc2a23e2",
  );
});
