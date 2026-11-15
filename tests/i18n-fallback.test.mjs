import assert from "node:assert/strict";
import test from "node:test";
import { forgetReload, loadEither, reloadOnce } from "../src/lib/i18n/catalog.ts";

function loader(failing) {
  const tried = [];
  const load = async (locale) => {
    tried.push(locale);
    if (failing.includes(locale)) throw new Error(`no ${locale}`);
  };
  return { load, tried };
}

test("the chosen language loads when it can", async () => {
  const { load, tried } = loader([]);
  assert.equal(await loadEither("zh", load), "zh");
  assert.deepEqual(tried, ["zh"]);
});

test("a language that cannot be downloaded falls back to the other one", async () => {
  const { load, tried } = loader(["zh"]);
  assert.equal(await loadEither("zh", load), "en");
  assert.deepEqual(tried, ["zh", "en"]);
});

test("when neither language loads the failure is passed on", async () => {
  const { load } = loader(["en", "zh"]);
  await assert.rejects(loadEither("en", load));
});

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

test("the page reloads once per tab, and again only after messages loaded", () => {
  const storage = memoryStorage();
  let reloads = 0;
  const reload = () => reloads++;
  assert.equal(reloadOnce(() => storage, reload), true);
  assert.equal(reloadOnce(() => storage, reload), false);
  assert.equal(reloads, 1);
  forgetReload(() => storage);
  assert.equal(reloadOnce(() => storage, reload), true);
  assert.equal(reloads, 2);
});

test("without storage the page is never reloaded", () => {
  let reloads = 0;
  const blocked = () => {
    throw new Error("SecurityError");
  };
  assert.equal(reloadOnce(blocked, () => reloads++), false);
  assert.equal(reloads, 0);
  forgetReload(blocked);
});
