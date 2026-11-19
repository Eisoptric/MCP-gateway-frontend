import { fetchMcpOauthAttempt, fetchMcpServers, startMcpOauth, type ApiMcpOauthAttempt, type ApiMcpServer } from "@/lib/api";

export type McpAuthorizeCode = "popup" | "denied" | "incomplete" | "failed" | "cancelled";

export class McpAuthorizeError extends Error {
  code: McpAuthorizeCode;
  /** For "failed": the API's reason code, e.g. "access_denied". */
  reason: string;

  constructor(message: string, code: McpAuthorizeCode, reason = "") {
    super(message);
    this.name = "McpAuthorizeError";
    this.code = code;
    this.reason = reason;
  }
}

/** Reason codes the API reports for a failed sign-in, each with its own console text. */
export const MCP_SIGN_IN_REASONS = [
  "access_denied",
  "provider_error",
  "no_code",
  "browser_mismatch",
  "expired",
  "token_exchange_failed",
  "connect_failed",
] as const;

type Translate = (path: string, vars?: Record<string, string | number>) => string;

/** The console text for a failed sign-in. Empty when the user cancelled it. */
/** The API refuses an endpoint whose host is on neither Saturn's list nor the organization's. */
export function isHostNotApproved(error: unknown): boolean {
  return error instanceof Error && error.message === "MCP endpoint host is not approved";
}

export function mcpOauthErrorText(error: unknown, t: Translate): string {
  if (error instanceof McpAuthorizeError) {
    if (error.code === "cancelled") return "";
    if (error.code === "popup") return t("marketplace.popupBlocked");
    if (error.code === "incomplete") return t("marketplace.signInIncomplete");
    if (error.code === "failed" && (MCP_SIGN_IN_REASONS as readonly string[]).includes(error.reason)) {
      return t(`marketplace.signInFailed.${error.reason}`, { detail: error.message });
    }
    return t("marketplace.signInFailed.generic");
  }
  if (error instanceof Error && error.message.includes("does not let Saturn start sign-in")) return t("marketplace.signInUnavailable");
  if (isHostNotApproved(error)) return t("marketplace.hostNotApproved");
  return error instanceof Error ? error.message : t("marketplace.popupBlocked");
}

/**
 * Whether the API now holds a working authorization for this server. The API keys servers by
 * name, so only the name counts: the same endpoint already signed in under another name says
 * nothing about this sign-in.
 */
export function mcpSignInCompleted(
  servers: Pick<ApiMcpServer, "name" | "has_authorization" | "secret_status">[],
  wanted: { name: string }
): boolean {
  return servers.some(
    (server) =>
      server.name.trim() === wanted.name.trim() &&
      server.has_authorization === true &&
      server.secret_status !== "needs_reconnect"
  );
}

/**
 * Opens the provider's sign-in in a window that has no link back to this page.
 *
 * With that link, any page shown in the window could send this tab to another address while
 * the user is looking at the sign-in. "noopener" removes the link, but then window.open returns
 * nothing and this page cannot even hint that the window closed. So the window starts empty,
 * its link is cut here, and only then is it sent to the provider.
 */
function openDetached(url: string): Window | null {
  const popup = window.open("about:blank", "_blank", "popup,width=520,height=720");
  if (!popup) return null;
  popup.opener = null;
  popup.location.href = url;
  return popup;
}

export const POLL_MS = 1500;
// A provider page that sends Cross-Origin-Opener-Policy cuts the window off, and it then reads as
// closed while the user is still signing in. So "closed" only prompts the user after a while.
export const CLOSED_GRACE_MS = 120_000;
// The API reports an attempt as expired after 15 minutes; this only stops a loop it never answers.
export const MAX_WAIT_MS = 16 * 60_000;

export interface SignInWatch {
  nonce: string;
  readAttempt: (nonce: string) => Promise<ApiMcpOauthAttempt>;
  /** Whether the connection itself now shows as signed in; used when the API has no record. */
  signedIn: () => Promise<boolean>;
  windowClosed: () => boolean;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
  signal?: AbortSignal;
  /** Called once when the window has looked closed for CLOSED_GRACE_MS and nothing finished. */
  onStalled?: () => void;
}

function cancelled() {
  return new McpAuthorizeError("cancelled", "cancelled");
}

/** Asks the API how the sign-in went until it connects, fails or expires. */
export async function waitForMcpSignIn(watch: SignInWatch): Promise<"approved"> {
  const started = watch.now();
  let closedAt: number | null = null;
  let stalled = false;
  for (;;) {
    if (watch.signal?.aborted) throw cancelled();
    let attempt: ApiMcpOauthAttempt | null = null;
    try {
      attempt = await watch.readAttempt(watch.nonce);
    } catch (error) {
      // An API from before attempts were recorded answers 404; the connection list still tells.
      const status = (error as { status?: unknown } | null)?.status;
      if (status === 404 && (await watch.signedIn().catch(() => false))) return "approved";
      // Anything else (a dropped request) is retried on the next round.
    }
    if (watch.signal?.aborted) throw cancelled();
    if (attempt?.status === "connected") return "approved";
    if (attempt?.status === "failed") {
      throw new McpAuthorizeError(attempt.message || "failed", "failed", attempt.reason || "");
    }
    if (attempt?.status === "expired") throw new McpAuthorizeError("expired", "failed", "expired");
    const now = watch.now();
    if (now - started >= MAX_WAIT_MS) throw new McpAuthorizeError("incomplete", "incomplete");
    if (watch.windowClosed()) {
      closedAt ??= now;
      if (!stalled && now - closedAt >= CLOSED_GRACE_MS) {
        stalled = true;
        watch.onStalled?.();
      }
    }
    await watch.sleep(POLL_MS, watch.signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
    function done() {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
  });
}

export interface AuthorizeOptions {
  /** Aborting it stops waiting (the sign-in is then reported as "cancelled"). */
  signal?: AbortSignal;
  onStalled?: () => void;
}

export async function authorizeMcp(
  body: { name: string; endpoint: string },
  options: AuthorizeOptions = {}
): Promise<"connected" | "approved"> {
  // The API records the sign-in's outcome under this value, readable only by this member.
  const nonce = crypto.randomUUID();
  const started = await startMcpOauth({ ...body, nonce });
  if (!started.authorization_url) return "connected";
  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(started.authorization_url);
  } catch {
    throw new McpAuthorizeError("The MCP provider did not grant access.", "denied");
  }
  // The API checks this URL, but a popup is never opened on anything but https.
  if (authorizationUrl.protocol !== "https:") {
    throw new McpAuthorizeError("The MCP provider did not grant access.", "denied");
  }
  if (options.signal?.aborted) throw cancelled();
  const popup = openDetached(authorizationUrl.href);
  if (!popup) throw new McpAuthorizeError("popup", "popup");
  try {
    return await waitForMcpSignIn({
      nonce,
      readAttempt: fetchMcpOauthAttempt,
      signedIn: async () => mcpSignInCompleted(await fetchMcpServers(), body),
      windowClosed: () => popup.closed,
      sleep,
      now: () => Date.now(),
      signal: options.signal,
      onStalled: options.onStalled,
    });
  } catch (error) {
    if (error instanceof McpAuthorizeError && error.code === "cancelled") {
      try {
        popup.close();
      } catch {
        // A window the provider cut off can no longer be closed from here.
      }
    }
    throw error;
  }
}
