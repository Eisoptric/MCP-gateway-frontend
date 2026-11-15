import type { StatusHistory, StatusReport } from "@/lib/status-page";
import { request } from "./transport";

// An API that takes the connection and never answers would otherwise leave the page on
// "unknown" until the proxy gives up minutes later. A timeout fails the query, and a failed
// /status reads as the API being down, the same as when it cannot be reached at all.
export const STATUS_TIMEOUT_MS = 10_000;

// Both are read without a session: the status page is public, and a signed-out visitor
// must not be sent to the sign-in page for looking at it.
export function fetchStatus() {
  return request<StatusReport>("/status", { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) }, false);
}

export function fetchStatusHistory() {
  return request<StatusHistory>("/status/history", { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) }, false);
}
