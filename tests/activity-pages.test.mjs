import assert from "node:assert/strict";
import test from "node:test";
import { addOlderPage, mergeEvents, olderCursor, pagePath } from "../src/lib/activity-pages.ts";

const at = (minute) => `2026-11-16T10:${String(minute).padStart(2, "0")}:00Z`;
const event = (id, minute, extra = {}) => ({ id, at: at(minute), ...extra });
const ids = (list) => list.map((item) => item.id);

test("a page path carries the limit and, after the first page, the cursor", () => {
  assert.equal(pagePath("/activity", 500), "/activity?limit=500");
  assert.equal(pagePath("/activity", 500, null), "/activity?limit=500");
  assert.equal(pagePath("/activity/export", 5000, "eyJh-b_c"), "/activity/export?limit=5000&cursor=eyJh-b_c");
});

test("events merge once each, newest first, ties by id descending", () => {
  const merged = mergeEvents(
    [event("evt_b", 5), event("evt_a", 5), event("evt_c", 9)],
    [event("evt_a", 5), event("evt_d", 1)]
  );
  assert.deepEqual(ids(merged), ["evt_c", "evt_b", "evt_a", "evt_d"]);
});

test("the later copy of an event wins", () => {
  const merged = mergeEvents([event("evt_a", 5, { result: "pending" })], [event("evt_a", 5, { result: "approved" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].result, "approved");
});

test("the next older page starts at the live cursor, then follows each page's cursor to the end", () => {
  assert.equal(olderCursor(null, "live-next"), "live-next");
  assert.equal(olderCursor(null, null), null);

  const live = [event("evt_9", 9), event("evt_8", 8)];
  let state = addOlderPage(null, live, { items: [event("evt_7", 7), event("evt_6", 6)], next: "page-2" });
  assert.equal(olderCursor(state, "live-next"), "page-2");
  state = addOlderPage(state, live, { items: [event("evt_5", 5)], next: null });
  assert.equal(olderCursor(state, "live-next"), null);
  assert.deepEqual(ids(state.events), ["evt_9", "evt_8", "evt_7", "evt_6", "evt_5"]);
});

test("rows that new activity pushes off the live page stay between it and the older pages", () => {
  // The live page held 8 and 7 when the first older page (6, 5) was loaded after it.
  let state = addOlderPage(null, [event("evt_8", 8), event("evt_7", 7)], {
    items: [event("evt_6", 6), event("evt_5", 5)],
    next: "page-2",
  });
  // Two new events later the live page holds 10 and 9 only; 8 and 7 must not disappear.
  const live = [event("evt_10", 10), event("evt_9", 9)];
  state = { ...state, events: mergeEvents(state.events, live) };
  assert.deepEqual(ids(mergeEvents(state.events, live)), ["evt_10", "evt_9", "evt_8", "evt_7", "evt_6", "evt_5"]);
});
